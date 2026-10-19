import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const pnclRoot=process.env.PNCL_SYNC_REPO;
const testRoot=process.env.PROFILE_SYNC_TEST_ROOT??'/tmp/profile-sync-test';
const require=createRequire(pnclRoot+'/package.json');
const {build}=require('esbuild');
await build({plugins:[{name:'test-diagnostics',setup(b){b.onLoad({filter:/profileSyncServer\.ts$/},args=>({contents:readFileSync(args.path,'utf8').replace('}catch(error){return json','}catch(error){if(!(error?.status<500))console.error(error);return json'),loader:'ts'}));}}],entryPoints:[pnclRoot+'/supabase/functions/_shared/profileSyncServer.ts'],outfile:testRoot+'/server.mjs',bundle:true,format:'esm',platform:'node',target:'node22'});
const {createProfileSyncHandler}=await import(testRoot+'/server.mjs');
const users=JSON.parse(readFileSync(testRoot+'/identities.json','utf8'));
const key='test-only-profile-sync-key-not-a-production-secret';
const roots={pncl:'https://dpnajpojbxgsckwrmvnm.supabase.co',leadspply:'https://lhxvbtiepsuohunfmnkm.supabase.co'};
const storage={pncl:new Map(),leadspply:new Map()},handlers={},pending=[];
const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const sql=(system,query)=>execFileSync(process.env.PSQL??'psql',['-h','127.0.0.1','-p',process.env.PROFILE_SYNC_TEST_PORT??'55439','-U','postgres','-d','mirror_'+system,'-v','ON_ERROR_STOP=1','-At','-c',query],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
for(const system of Object.keys(users)){
 sql(system,`update profile_sync_private.settings set enabled=true,secret='${key}'; grant select on public.pncl_account_links to service_role;`.replace(' grant select on public.pncl_account_links to service_role;',system==='leadspply'?' grant select on public.pncl_account_links to service_role;':''));
 const db={
  rpc:async(name,{p_action,p_user,p_body})=>{try{const result=sql(system,`set role service_role; select public.profile_sync('${p_action}',${p_user?`'${p_user}'::uuid`:'null'},${literal(p_body)});`).replace(/^SET(?:\n|$)/,'');return {data:result?JSON.parse(result):null,error:null};}catch(error){console.error('RPC failed',system,p_action,error.stderr.toString());return {data:null,error:{message:error.stderr.toString().split('\n')[0].replace('ERROR:  ','')}};}},
  auth:{getUser:async token=>token===system?{data:{user:{id:users[system]}},error:null}:{data:{user:null},error:{message:'invalid'}}},
  functions:{invoke:async()=>({data:{ok:true},error:null})},
  storage:{from:bucket=>({
    upload:async(path,bytes,{contentType})=>{storage[system].set(bucket+'/'+path,{bytes:Buffer.from(bytes),type:contentType});return {error:null};},
    download:async path=>{const value=storage[system].get(bucket+'/'+path);return value?{data:new Blob([value.bytes],{type:value.type}),error:null}:{data:null,error:{message:'missing'}};},
    createSignedUrl:async(path,seconds)=>({data:{signedUrl:roots[system]+'/private/'+bucket+'/'+path+'?expires='+seconds},error:null})
  })}
 };
 handlers[system]=createProfileSyncHandler({system,db,county:zip=>zip==='84101'?'Salt Lake':null,defer:promise=>pending.push(promise),fetch:async(url,options)=>{const target=url.startsWith(roots.pncl)?'pncl':'leadspply';return handlers[target](new Request(url,options));}});
}
async function call(system,body,headers={}){const response=await handlers[system](new Request(roots[system]+'/functions/v1/profile-sync',{method:'POST',headers:{Authorization:'Bearer '+system,Origin:system==='pncl'?'https://www.thepncl.com':'https://leadspply.com','Content-Type':'application/json',...headers},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};}
async function drain(){let count=0;while(pending.length){assert.ok(count++<40,'background sync must terminate');await Promise.all(pending.splice(0));}}
let checks=0;const ok=label=>{checks++;console.log('PASS '+label);};
assert.equal((await call('pncl',{action:'read'},{Authorization:'Bearer invalid'})).status,401);ok('invalid session rejected');
assert.equal((await call('pncl',{action:'read'},{Origin:'https://evil.example'})).status,403);ok('foreign origins rejected');
assert.equal((await call('pncl',{action:'read',userId:users.leadspply})).status,400);ok('browser cannot choose another identity');
assert.equal((await call('pncl',{action:'tick'},{'X-Profile-Sync-Key':key})).status,401);ok('server credential rejected from browser origin');
let current=(await call('pncl',{action:'read'})).body;await drain();assert.equal(current.version,3);ok('authenticated read and background sync');
const request={id:crypto.randomUUID(),changes:{home_address_zip:'84101',home_address_line1:'123 Synthetic Test Street'},expected:{home_address_zip:current.clocks.home_address_zip,home_address_line1:current.clocks.home_address_line1}};
let saved=await call('pncl',{action:'save',request});assert.equal(saved.status,200,JSON.stringify(saved));await drain();
let remote=(await call('leadspply',{action:'read'})).body;await drain();assert.equal(remote.values.home_address_line1,'123 Synthetic Test Street');assert.equal(remote.values.home_county,'Salt Lake');ok('two-way native/counterpart propagation and derived county');
assert.equal((await call('pncl',{action:'save',request})).status,200);await drain();ok('lost-response retry remains idempotent with derived fields');
const changed={...request,changes:{...request.changes,home_address_line1:'different'}};assert.equal((await call('pncl',{action:'save',request:changed})).status,409);ok('changed request ID reuse rejected');
const forbidden={id:crypto.randomUUID(),changes:{password:'bad'},expected:{password:{pncl:0,leadspply:0}}};assert.equal((await call('pncl',{action:'save',request:forbidden})).status,400);ok('credential fields rejected');
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
current=(await call('leadspply',{action:'read'})).body;await drain();
const upload={action:'upload',field:'eo_certificate',id:crypto.randomUUID(),clock:current.clocks.eo_certificate,name:'synthetic.png',mime:'image/png',base64:bytes.toString('base64')};
const uploaded=await call('leadspply',upload);assert.equal(uploaded.status,200,JSON.stringify(uploaded));await drain();
let pncl=(await call('pncl',{action:'read'})).body;await drain();assert.equal(pncl.values.eo_certificate.sha256,uploaded.body.view.values.eo_certificate.sha256);assert.ok(pncl.urls.eo_certificate.includes(users.pncl));assert.ok([...storage.pncl.keys()].some(k=>k.startsWith('portal-profile-documents/'+users.pncl+'/mirror/')));ok('private file copied with integrity and destination-owned path');
assert.equal((await call('leadspply',upload)).status,200);await drain();ok('upload retry returns original receipt');
const forged={id:crypto.randomUUID(),changes:{eo_certificate:{...pncl.values.eo_certificate,path:users.leadspply+'/secret.pdf'}},expected:{eo_certificate:pncl.clocks.eo_certificate}};assert.equal((await call('pncl',{action:'save',request:forged})).status,403);ok('forged file references rejected');
const removal={id:crypto.randomUUID(),changes:{eo_certificate:null},expected:{eo_certificate:pncl.clocks.eo_certificate}};
assert.equal((await call('pncl',{action:'save',request:removal})).status,200);await drain();remote=(await call('leadspply',{action:'read'})).body;await drain();assert.equal(remote.values.eo_certificate,null);assert.equal(remote.urls.eo_certificate,undefined);ok('file deletion converges and removes download access');
const document='document:'+crypto.randomUUID();current=(await call('leadspply',{action:'read'})).body;await drain();const docUpload={...upload,field:document,id:crypto.randomUUID(),clock:{pncl:0,leadspply:0},label:'Test document'};
assert.equal((await call('leadspply',docUpload)).status,200);await drain();assert.equal(sql('pncl',`select label from portal_profile_documents where id='${document.slice(9)}'`),'Test document');ok('document collection and label project into native PNCL table');
const suspendedSql=`update agent_profiles set suspended_at=now() where user_id='${users.leadspply}'`;sql('leadspply',suspendedSql);
assert.equal((await call('leadspply',{action:'read'})).status,409);ok('suspended accounts denied');
sql('leadspply',`update agent_profiles set suspended_at=null where user_id='${users.leadspply}'`);
console.log(`${checks} HTTP/FILE INTEGRATION CHECKS PASSED`);
