import { describe,it,expect,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { sanitizeLeadSpplySnapshot } from '../../supabase/functions/_shared/leadspplySnapshot';

const activities={calls:12,appointments:2,presentations:1,policies:1,points:4.5};
const snapshot={version:1,state:'connected',asOf:'2026-10-08T03:40:00Z',
  account:{name:'Linked Agent',syncStatus:'synced',lastSyncedAt:'2026-10-08T02:00:00Z'},
  period:{timezone:'Pacific/Honolulu',monthStart:'2026-10-01',weekStart:'2026-10-05',today:'2026-10-07'},
  leads:{toWork:12,new:8,inProgress:4,callbacksToday:2},appointments:{upcoming:3,nextAt:'2026-10-09T16:00:00Z'},
  production:{paidPoliciesMtd:2,annualPremiumCentsMtd:125050},activity:{today:activities,week:activities},contact:{ratePct:25.5,speedMinutes:12.3}};
class AuthError extends Error {constructor(message:string,public status:number,public code:string){super(message);}}
function handler(options:{authError?:AuthError;env?:Record<string,string>;upstreamStatus?:number;payload?:unknown}={}) {
  let route:(req:Request)=>Promise<Response>;
  const env=options.env ?? {PNCL_INTEGRATION_KEY:'fixture-key',LEADSPPLY_SNAPSHOT_URL:'https://lhxvbtiepsuohunfmnkm.supabase.co/functions/v1/pncl-agent-snapshot'};
  const fetcher=vi.fn(async()=>new Response(JSON.stringify(options.payload??snapshot),{status:options.upstreamStatus??200}));
  const requireUser=vi.fn(async()=>{if(options.authError)throw options.authError;return{user:{id:'verified-pncl-user'},adminClient:{}};});
  const source=readFileSync(resolve('supabase/functions/get-leadspply-snapshot/index.ts'),'utf8').replace(/^import .*;\n/gm,'');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('Deno','AdminAuthError','requirePortalUser','corsHeaders','sanitizeLeadSpplySnapshot','fetch','AbortSignal','console',code)(
    {serve:(h:typeof route)=>{route=h;},env:{get:(key:string)=>env[key]}},AuthError,requireUser,
    {'Access-Control-Allow-Origin':'*'},sanitizeLeadSpplySnapshot,fetcher,{timeout:()=>new AbortController().signal},{error:()=>{}});
  return {fetcher,requireUser,request:(method='GET',query='')=>route(new Request('https://pncl/functions/v1/get-leadspply-snapshot'+query,{method}))};
}
describe('read-only snapshot projection',()=>{
  it('retains accurate cents and only approved aggregates',()=>{
    const result=sanitizeLeadSpplySnapshot({...snapshot,customerPhones:['private'],serviceRoleKey:'private',account:{...snapshot.account,email:'private',notes:'private'}});
    expect(result.production?.annualPremiumCentsMtd).toBe(125050);
    expect(result.activity?.today.points).toBe(4.5);
    expect(result).not.toHaveProperty('customerPhones');expect(result).not.toHaveProperty('serviceRoleKey');expect(result.account).not.toHaveProperty('email');expect(result.account).not.toHaveProperty('notes');
  });
  it('strips all metrics from unlinked and unavailable responses',()=>{
    for(const state of ['not_linked','account_unavailable'])expect(sanitizeLeadSpplySnapshot({...snapshot,state})).toEqual({version:1,state,asOf:snapshot.asOf});
  });
  it('rejects invalid versions, dates, counts, timezone, status and impossible percentages',()=>{
    for(const value of [ {...snapshot,version:2}, {...snapshot,asOf:'invalid'},
      {...snapshot,leads:{...snapshot.leads,new:-1}}, {...snapshot,production:{...snapshot.production,annualPremiumCentsMtd:1.5}},
      {...snapshot,period:{...snapshot.period,today:'2026-02-31'}}, {...snapshot,period:{...snapshot.period,timezone:'Invalid/Timezone'}},
      {...snapshot,account:{...snapshot.account,syncStatus:'source_missing'}}, {...snapshot,contact:{...snapshot.contact,ratePct:101}} ])expect(()=>sanitizeLeadSpplySnapshot(value)).toThrow('Invalid');
  });
  it('preserves unavailable rates instead of inventing zero',()=>expect(sanitizeLeadSpplySnapshot({...snapshot,contact:{ratePct:null,speedMinutes:null}}).contact).toEqual({ratePct:null,speedMinutes:null}));
});
describe('PNCL authenticated read proxy',()=>{
  it('derives identity solely from verified PNCL authentication',async()=>{
    const h=handler();const response=await h.request();expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
    expect(h.fetcher).toHaveBeenCalledTimes(1);const [url,init]=h.fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe('https://lhxvbtiepsuohunfmnkm.supabase.co/functions/v1/pncl-agent-snapshot');
    expect(init.body).toBe(JSON.stringify({pnclUserId:'verified-pncl-user'}));expect(init.method).toBe('POST');expect(init.redirect).toBe('error');
    expect(await response.json()).toEqual(snapshot);
  });
  it('rejects attempted account selection and mutation methods without upstream access',async()=>{
    const h=handler();expect((await h.request('GET','?pnclUserId=another-person')).status).toBe(400);
    expect((await h.request('POST')).status).toBe(405);expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('denies unauthenticated and unconfirmed/domain-ineligible portal users',async()=>{
    for(const status of [401,403]){const h=handler({authError:new AuthError('Denied',status,'denied')});expect((await h.request()).status).toBe(status);expect(h.fetcher).not.toHaveBeenCalled();}
  });
  it('fails closed when configuration is absent',async()=>{
    const h=handler({env:{}});expect((await h.request()).status).toBe(503);expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('never sends a server secret to a different origin, path, credential URL or redirect',async()=>{
    for(const endpoint of ['http://lhxvbtiepsuohunfmnkm.supabase.co/functions/v1/pncl-agent-snapshot','https://other.supabase.co/functions/v1/pncl-agent-snapshot','https://lhxvbtiepsuohunfmnkm.supabase.co/other','https://user:password@lhxvbtiepsuohunfmnkm.supabase.co/functions/v1/pncl-agent-snapshot','https://lhxvbtiepsuohunfmnkm.supabase.co/functions/v1/pncl-agent-snapshot?redirect=other']){
      const h=handler({env:{PNCL_INTEGRATION_KEY:'fixture-key',LEADSPPLY_SNAPSHOT_URL:endpoint}});expect((await h.request()).status).toBe(503);expect(h.fetcher).not.toHaveBeenCalled();
    }
  });
  it('shows a service error on upstream failure and malformed data',async()=>{
    for(const options of [{upstreamStatus:401},{payload:{secret:'private'}}]){
      const h=handler(options);const response=await h.request();expect(response.status).toBe(502);expect(await response.text()).not.toContain('private');
    }
  });
  it('supports harmless CORS preflight without reading data',async()=>{
    const h=handler();expect((await h.request('OPTIONS')).status).toBe(204);expect(h.fetcher).not.toHaveBeenCalled();
  });
});
