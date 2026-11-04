import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProfileSyncHandler } from '../../supabase/functions/_shared/profileSyncServer';

const user='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const queued='33333333-3333-4333-8333-333333333333';
const key='fixture-sync-key';
beforeEach(()=>vi.stubGlobal('AbortSignal',{timeout:()=>new AbortController().signal}));
afterEach(()=>vi.unstubAllGlobals());

function setup(options:{claim?:string|null;more?:boolean;waiting?:string[];failure?:boolean}={}){
  const events=[{id:'44444444-4444-4444-8444-444444444444',field:'first_name',value:'Saved',clock:{pncl:1,leadspply:0},baseline:false}];
  const rpc=vi.fn(async(_name:string,args:{p_action:string;p_user:string|null;p_body:Record<string,unknown>})=>{
    const results:Record<string,unknown>={config:{enabled:true,secret:key},available:true,operation:null,
      read:{fields:[],pending:0,errors:0,linked:true},save:{outcome:'saved',conflicts:[]},
      claim:options.claim===undefined?'lease':options.claim,outbox:events,finish:options.more??false,ready_users:options.waiting??[]};
    return {data:args.p_action in results?results[args.p_action]:true,error:null};
  });
  const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{
    const body=JSON.parse(String(init.body));
    if(options.failure&&body.action==='link')throw new Error('unavailable');
    return Response.json(body.action==='link'?{pncl:user,leadspply:other}:body.action==='deliver'?[{id:events[0].id,outcome:'applied'}]:{ok:true});
  });
  const tasks:Promise<unknown>[]=[];
  const defer=vi.fn((p:Promise<unknown>)=>{tasks.push(p);});
  const handler=createProfileSyncHandler({system:'pncl',db:{rpc,auth:{getUser:async()=>({data:{user:{id:user}},error:null})}},fetch:fetcher,defer,county:()=>null});
  const call=(body:Record<string,unknown>,server=false)=>handler(new Request('https://pncl.example/profile-sync',{
    method:'POST',headers:server?{'X-Profile-Sync-Key':key}:{Authorization:'Bearer fixture',Origin:'https://www.thepncl.com'},body:JSON.stringify(body),
  }));
  return {call,rpc,fetcher,defer,tasks};
}

describe('save-triggered profile sync',()=>{
  it('keeps reads, legacy ticks, and reverse flushes free of sync jobs',async()=>{
    const h=setup();
    for(let i=0;i<3;i++)expect((await h.call({action:'read'})).status).toBe(200);
    expect((await h.call({action:'tick'},true)).status).toBe(202);
    expect((await h.call({action:'flush',pair:{pncl:user,leadspply:other}},true)).status).toBe(202);
    expect(h.defer).not.toHaveBeenCalled();expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.rpc.mock.calls.map(([,a])=>a.p_action)).not.toContain('tick_users');
  });
  it('commits a save without launching a duplicate browser-request worker',async()=>{
    const h=setup();
    expect((await h.call({action:'save',request:{id:crypto.randomUUID(),changes:{first_name:'Saved'},expected:{first_name:{pncl:0,leadspply:0}}}})).status).toBe(200);
    expect(h.rpc.mock.calls.map(([,a])=>a.p_action)).toContain('save');
    expect(h.defer).not.toHaveBeenCalled();expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('delivers a database wake-up, releases its lease, and wakes saved work waiting for capacity',async()=>{
    const h=setup({more:true,waiting:[queued]});
    expect((await h.call({action:'sync',userId:user},true)).status).toBe(202);await Promise.all(h.tasks);
    const actions=h.rpc.mock.calls.map(([,a])=>a.p_action);
    expect(actions.indexOf('claim')).toBeLessThan(actions.indexOf('outbox'));
    expect(actions).toContain('ack');expect(actions).toContain('finish');
    expect(h.rpc.mock.calls.filter(([,a])=>a.p_action==='dispatch').map(([,a])=>a.p_user)).toEqual([user,queued]);
    expect(h.fetcher.mock.calls.map(([,init])=>JSON.parse(String(init.body)).action)).not.toContain('flush');
  });
  it('does no peer work when the lease cannot be acquired',async()=>{
    const h=setup({claim:null});await h.call({action:'sync',userId:user},true);await Promise.all(h.tasks);
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.rpc.mock.calls.map(([,a])=>a.p_action)).not.toContain('outbox');
  });
  it('rechecks capacity after a rejected claim so a simultaneous worker completion cannot strand the save',async()=>{
    const h=setup({claim:null,waiting:[user]});await h.call({action:'sync',userId:user},true);await Promise.all(h.tasks);
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.rpc.mock.calls.filter(([,a])=>a.p_action==='dispatch').map(([,a])=>a.p_user)).toEqual([user]);
  });
  it('releases a failed worker and continues other saved profiles without retrying the failed one',async()=>{
    const h=setup({failure:true,waiting:[queued]});await h.call({action:'sync',userId:user},true);await Promise.all(h.tasks);
    expect(h.rpc.mock.calls.find(([,a])=>a.p_action==='finish')?.[1].p_body).toMatchObject({error:'sync_unavailable'});
    expect(h.rpc.mock.calls.filter(([,a])=>a.p_action==='dispatch').map(([,a])=>a.p_user)).toEqual([queued]);
  });
});
