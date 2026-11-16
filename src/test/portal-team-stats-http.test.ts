import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { buildPortalHierarchyResponse } from '../../supabase/functions/_shared/portalHierarchy';
import { sanitizePortalTeamStats } from '../../supabase/functions/_shared/portalTeamStats';
import { teamStatsFixture } from '@/test/fixtures/portal-team-stats';

class AuthError extends Error { status = 401; }
function loadHandler(file: string, deps: Record<string, unknown>) {
  const js = ts.transpileModule(readFileSync(file, 'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^import .*;\n/gm,'');
  new Function(...Object.keys(deps), js)(...Object.values(deps));
}
function hub({deny=false, upstreamOk=true, endpoint='https://lhxvbtiepsuohunfmnkm.supabase.co/functions/v1/pncl-agent-snapshot'}={}) {
  let route!: (req: Request) => Promise<Response>;
  const roster = vi.fn(async()=>[
    {id:'leader',name:'Leader',npn:null,referrerId:null,referrerName:null},
    {id:'direct',name:'Direct',npn:null,referrerId:'leader',referrerName:'Leader'},
    {id:'outsider',name:'Outsider',npn:null,referrerId:null,referrerName:null},
  ]);
  const fetch = vi.fn(async()=>new Response(JSON.stringify({...teamStatsFixture(),email:'do not relay'}), {status:upstreamOk?200:500}));
  loadHandler('supabase/functions/get-portal-team-stats/index.ts', {
    serve:(handler:typeof route)=>{route=handler;}, AdminAuthError:AuthError,
    requirePortalUser:async()=>{if(deny)throw new AuthError('Unauthorized');return {user:{id:'leader'},adminClient:{}};},
    loadPortalTeamScope:async (_client:unknown, userId:string)=>({ids:buildPortalHierarchyResponse(await roster(),userId,[]).people.map(person=>person.id)}),sanitizePortalTeamStats,
    corsHeaders:{},handleCors:()=>null,AbortSignal:{timeout:()=>new AbortController().signal},Deno:{env:{get:(key:string)=>key==='PNCL_INTEGRATION_KEY'?'server-only-secret':endpoint}},fetch,
  });
  return {fetch,roster,request:(query='',method='GET')=>route(new Request(`https://hub.test/stats${query}`,{method}))};
}

describe('Hub team stats endpoint',()=>{
  it('authenticates before reading identities or contacting LeadSpply',async()=>{
    const h=hub({deny:true});expect((await h.request()).status).toBe(401);expect(h.roster).not.toHaveBeenCalled();expect(h.fetch).not.toHaveBeenCalled();
  });
  it('derives the allowed people from the verified hierarchy and strips any upstream extras',async()=>{
    const h=hub();const response=await h.request('?period=month');expect(response.status).toBe(200);
    const args=h.fetch.mock.calls[0] as unknown as [URL,RequestInit];
    expect(String(args[0])).toBe('https://lhxvbtiepsuohunfmnkm.supabase.co/functions/v1/pncl-team-stats');
    expect(JSON.parse(String(args[1].body))).toEqual({pnclUserIds:['leader','direct'],period:'month'});
    expect(args[1].redirect).toBe('error');expect(args[1].signal).toBeInstanceOf(AbortSignal);
    const payload=await response.text();expect(payload).not.toMatch(/partner|indirect|outsider|do not relay|server-only-secret/);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects all client scope selectors, invalid periods, duplicate periods and writes',async()=>{
    const h=hub();for(const query of ['?userId=outsider','?pnclUserIds=outsider','?root=outsider','?period=all','?period=week&period=month'])expect((await h.request(query)).status).toBe(400);
    expect((await h.request('','POST')).status).toBe(405);expect(h.fetch).not.toHaveBeenCalled();
  });
  it('fails closed on an untrusted destination and upstream errors',async()=>{
    const h=hub({endpoint:'https://other.test/functions/v1/pncl-agent-snapshot'});expect((await h.request()).status).toBe(503);expect(h.fetch).not.toHaveBeenCalled();
    const response=await hub({upstreamOk:false}).request();expect(response.status).toBe(502);expect(await response.text()).not.toContain('server-only-secret');
  });
});

function bridge({key='shared-key',configured=true}={}) {
  let route!: (req:Request)=>Promise<Response>;
  const rpc=vi.fn(async(name:string)=>name==='get_pncl_integration_config'?{data:configured?{pncl_integration_key:'shared-key'}:null,error:null}:{data:teamStatsFixture(),error:null});
  const createClient=vi.fn(()=>({rpc}));
  loadHandler('integrations/leadspply/supabase/functions/pncl-team-stats/index.ts',{
    createClient,timingSafeEqual:(a:string,b:string)=>a===b,
    Deno:{serve:(handler:typeof route)=>{route=handler;},env:{get:(name:string)=>name==='PNCL_INTEGRATION_KEY'?undefined:'test'}},
  });
  return {rpc,createClient,request:(body:unknown,method='POST')=>route(new Request('https://ls.test/stats',{method,headers:key?{'X-PNCL-Integration-Key':key}:{},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}))};
}
const id='11111111-1111-4111-8111-111111111111';
describe('LeadSpply stats bridge',()=>{
  it('requires the server credential before reading configuration or stats',async()=>{
    const missing=bridge({key:''});expect((await missing.request({pnclUserIds:[id],period:'month'})).status).toBe(401);expect(missing.createClient).not.toHaveBeenCalled();
    const bad=bridge({key:'wrong'});expect((await bad.request({pnclUserIds:[id],period:'month'})).status).toBe(401);expect(bad.rpc).toHaveBeenCalledTimes(1);
  });
  it('accepts only a bounded list of PNCL UUIDs and supported periods',async()=>{
    const h=bridge();for(const body of ['bad json',{pnclUserIds:[id],period:'month',userId:id},{pnclUserIds:['bad'],period:'month'},{pnclUserIds:[],period:'month'},{pnclUserIds:Array(1001).fill(id),period:'month'},{pnclUserIds:[id],period:'all'}])expect((await h.request(body)).status).toBe(400);
    expect(h.rpc.mock.calls.every(([name])=>name==='get_pncl_integration_config')).toBe(true);
  });
  it('uses the shared config fallback and returns deduplicated metrics with no cache',async()=>{
    const h=bridge();const response=await h.request({pnclUserIds:[id,id],period:'week'});expect(response.status).toBe(200);expect(h.rpc).toHaveBeenLastCalledWith('get_pncl_team_stats',{p_pncl_user_ids:[id],p_period:'week'});expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
