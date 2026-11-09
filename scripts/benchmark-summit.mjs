// Isolated intake/queue benchmark. NEVER targets Supabase or production.
// Requires a disposable local Postgres database with both Summit migrations.
// NODE_PATH=/tmp/pncl-summit-loadtest/node_modules node scripts/benchmark-summit.mjs
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const { Pool } = createRequire(import.meta.url)("pg");
const pool = new Pool({host:"127.0.0.1",port:55439,database:"pncl_summit",user:"service_role",max:20});
const N = 2000, durationMs = Number(process.env.SUMMIT_BURST_WINDOW_MS || 60000);
assert.equal(Number((await pool.query("select count(*) from summit_questions")).rows[0].count),0,"Use an empty isolated test database");
const requests = Array.from({length:N},(_,i)=>({id:crypto.randomUUID(),client_id:crypto.randomUUID(),question:`Synthetic queue fixture ${i}: topic ${i%25}?`}));
let wakes=0;
const server=createServer(async(req,res)=>{
  try {
    let body="";for await (const chunk of req) body+=chunk;
    const q=JSON.parse(body);
    const result=await pool.query("select summit_accept($1,$2,$3) receipt",[q.id,q.client_id,q.question]);
    if(result.rows[0].receipt.wake)wakes++;
    res.writeHead(201,{"Content-Type":"application/json"});res.end(JSON.stringify({id:result.rows[0].receipt.id}));
  } catch {res.writeHead(503);res.end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const endpoint=`http://127.0.0.1:${server.address().port}`;
const latencies=[];let failures=0;
async function send(q){const t=performance.now();const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(q)});await r.text();latencies.push(performance.now()-t);if(r.status!==201)failures++;}
const started=performance.now();
await Promise.all(requests.map((q,i)=>new Promise(resolve=>setTimeout(resolve,i*durationMs/N)).then(()=>send(q))));
const intakeSeconds=(performance.now()-started)/1000;
// Concurrent lost-response retries must not increase the durable total.
await Promise.all(requests.slice(0,100).map(send));
const stored=Number((await pool.query("select count(*) from summit_questions")).rows[0].count);
assert.equal(failures,0);assert.equal(stored,N);
const snapshot=(await pool.query("select summit_snapshot_v2() s")).rows[0].s;
assert.equal(snapshot.pending_count,N);
// Simulate a provider failure and verify every saved original remains queued.
const failedToken=crypto.randomUUID();await pool.query("select summit_claim($1)",[failedToken]);
await pool.query("select summit_fail($1,'ai_http_429')",[failedToken]);
assert.equal(Number((await pool.query("select count(*) from summit_questions where group_id is null")).rows[0].count),N);
// Test recovery without waiting 30 seconds; this is the disposable local DB.
await pool.query("update summit_worker set retry_after=now()");
const held=crypto.randomUUID();await pool.query("select summit_claim($1)",[held]);
assert.equal((await pool.query("select summit_claim($1) c",[crypto.randomUUID()])).rows[0].c,null);
await pool.query("update summit_worker set lease_until=now()-interval '1 second'");
const groupIds=Array.from({length:25},()=>crypto.randomUUID());
let batches=0;const drainStarted=performance.now();
while(true){
  const token=crypto.randomUUID();const claim=(await pool.query("select summit_claim($1) c",[token])).rows[0].c;
  if(!claim)break;
  // Deterministic test assignment, deliberately NOT an AI capacity claim.
  const assignments=claim.questions.map(q=>({question_id:q.id,group_id:groupIds[Number(q.question.match(/topic (\d+)/)[1])]}));
  await pool.query("select summit_finish($1,$2::jsonb)",[token,JSON.stringify(assignments)]);batches++;
}
const final=(await pool.query("select summit_snapshot_v2() s")).rows[0].s;
assert.equal(final.total,N);assert.equal(final.pending_count,0);assert.equal(final.groups.length,25);
assert.equal(final.groups.reduce((sum,g)=>sum+g.count,0),N);
latencies.sort((a,b)=>a-b);const percentile=p=>Number(latencies[Math.floor((latencies.length-1)*p)].toFixed(2));
const result={environment:"isolated local PostgreSQL 14 + Node HTTP adapter; not hosted Edge capacity",target:{questions:N,windowSeconds:durationMs/1000},durableQuestions:stored,requestsIncludingRetries:latencies.length,failures,errorRate:failures/latencies.length,intakeSeconds:Number(intakeSeconds.toFixed(2)),intakeQuestionsPerSecond:Number((N/intakeSeconds).toFixed(2)),latencyMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:Number(latencies.at(-1).toFixed(2))},coalescedWakeRequests:wakes,queue:{provider429PreservedAll:true,expiredLeaseRecovered:true,concurrentWorkerExcluded:true,drained:N,batches,simulatedDrainSeconds:Number(((performance.now()-drainStarted)/1000).toFixed(2)),aiCalls:0},snapshotBytes:Buffer.byteLength(JSON.stringify(final))};
writeFileSync('/tmp/pncl-summit-benchmark.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
await new Promise(resolve=>server.close(resolve));await pool.end();
