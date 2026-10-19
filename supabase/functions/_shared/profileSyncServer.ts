import { FIELDS, fieldFor, normalize, UUID, MirrorError, type System, type Json, type Clock } from './profileMirror.ts';

export const HOSTS = {pncl:'https://dpnajpojbxgsckwrmvnm.supabase.co',leadspply:'https://lhxvbtiepsuohunfmnkm.supabase.co'};
const ORIGINS = {pncl:['https://www.thepncl.com','https://thepncl.com','https://portal.thepncl.com'],leadspply:['https://leadspply.com','https://www.leadspply.com']};
const MAX_FILE=5*1024*1024;
// JSON and injected SDK boundaries are validated before database access.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ObjectValue=Record<string,any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SyncDependencies {system:System;db:any;fetch:typeof fetch;defer:(task:Promise<unknown>)=>void;county:(zip:string)=>string|null}
const object=(v:unknown):v is ObjectValue=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):string=>{if(typeof v!=='string'||!UUID.test(v))throw new MirrorError('invalid_request');return v;};
export function validateClock(c:unknown):asserts c is Clock {if(!object(c)||Object.keys(c).sort().join(',')!=='leadspply,pncl'||!['pncl','leadspply'].every(k=>Number.isSafeInteger(c[k])&&c[k]>=0))throw new MirrorError('invalid_clock');}
export function validFile(bytes:Uint8Array,mime:string,field:string){
  if(!bytes.length||bytes.length>MAX_FILE)throw new MirrorError('invalid_file_size');
  const pdf=bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45;
  const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const png=[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  const str=(start:number,end:number)=>new TextDecoder().decode(bytes.slice(start,end));
  const webp=str(0,4)==='RIFF'&&str(8,12)==='WEBP';
  if(!(mime==='image/jpeg'&&jpg||mime==='image/png'&&png||mime==='image/webp'&&webp||mime==='application/pdf'&&pdf&&field!=='profile_photo'))throw new MirrorError('invalid_file_type');
}
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource))).map(x=>x.toString(16).padStart(2,'0')).join('');
function toBase64(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function fromBase64(v:unknown){if(typeof v!=='string'||v.length>Math.ceil(MAX_FILE/3)*4+4||!/^[A-Za-z0-9+/]*={0,2}$/.test(v))throw new MirrorError('invalid_file');try{return Uint8Array.from(atob(v),c=>c.charCodeAt(0));}catch{throw new MirrorError('invalid_file');}}
const safeCode=(e:unknown)=>e instanceof MirrorError?e.code:'sync_unavailable';
const allowedCodes=['account_unavailable','identity_mismatch','not_linked','request_id_reused','event_id_reused','npn_rejected'];
export function createProfileSyncHandler(d:SyncDependencies){
  const {db,system}=d,other:System=system==='pncl'?'leadspply':'pncl';
  const rpc=async(action:string,user:string|null=null,body:ObjectValue={})=>{const {data,error}=await db.rpc('profile_sync',{p_action:action,p_user:user,p_body:body});if(error){console.warn('profile_sync_rpc',JSON.stringify({system,action,code:error.code}));throw new MirrorError(allowedCodes.includes(error.message)?error.message:'sync_unavailable',503);}return data;};
  const songCache=new Map<string,{expires:number;songs:Json[]}>();
  const songRequests=new Map<string,number>();
  const available=async(user:string)=>{if(!await rpc('available',user))throw new MirrorError('account_unavailable',409);};
  async function peer(key:string,body:ObjectValue){
    let response:Response;try{response=await d.fetch(`${HOSTS[other]}/functions/v1/profile-sync`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json','X-Profile-Sync-Key':key},body:JSON.stringify(body)});}catch(error){console.warn('profile_sync_transport',JSON.stringify({system,action:body.action,error:error instanceof Error?error.message.replaceAll(key,'[redacted]').slice(0,160):'unknown'}));throw error;}
    const value=await response.json().catch(()=>null);
    if(!response.ok){console.warn('profile_sync_peer',JSON.stringify({system,action:body.action,status:response.status,code:allowedCodes.includes(value?.error)?value.error:'sync_unavailable'}));throw new MirrorError(allowedCodes.includes(value?.error)?value.error:'sync_unavailable',response.status);}
    return value;
  }
  async function link(key:string,user:string){
    const pair=system==='leadspply'?await rpc('link',user,{system}):await peer(key,{action:'link',userId:user,system});
    if(!pair)throw new MirrorError('not_linked',409);
    if(!object(pair)||uuid(pair[system])!==user)throw new MirrorError('identity_mismatch',409);
    uuid(pair[other]);await available(user);await rpc('bind',user,{peer:pair[other]});return pair;
  }
  async function checkPair(key:string,pair:ObjectValue){
    if(!object(pair))throw new MirrorError('invalid_request');
    const actual=await link(key,uuid(pair[system]));
    if(actual[other]!==uuid(pair[other]))throw new MirrorError('identity_mismatch',409);
    return actual;
  }
  const assetField=(field:string)=>fieldFor(field).kind==='asset';
  function location(user:string,value:ObjectValue,source:System=system){
    const buckets=source==='pncl'?['portal-profile-photos','portal-profile-documents','profile-sync-documents']:['avatars','profile-sync-documents'];
    if(!object(value)||!buckets.includes(value.bucket)||typeof value.path!=='string'||!value.path.startsWith(user+'/')||value.path.includes('..')||value.path.includes('\\'))throw new MirrorError('invalid_asset');
    return {bucket:value.bucket,path:value.path};
  }
  async function enrich(user:string,e:ObjectValue){
    const value=e.value;
    if(assetField(e.field)&&value!==null){
      const file=location(user,e.file??value),{data,error}=await db.storage.from(file.bucket).download(file.path);
      if(error||!data)throw new MirrorError('file_unavailable',503);
      const bytes=new Uint8Array(await data.arrayBuffer()),mime=data.type.split(';')[0];validFile(bytes,mime,e.field);
      const digest=await hash(bytes);
      if(value.sha256&&value.sha256!==digest)throw new MirrorError('source_file_changed',409);
      e={...e,value:{...value,...file,system,id:e.id,name:String(value.name||'Document').slice(0,120),mime,bytes:bytes.length,sha256:digest},bytes:toBase64(bytes)};
      await rpc('materialize',user,{id:e.id,value:e.value});
    } else {
      // Do not let malformed legacy values escape the field contract.
      e={...e,value:normalize(e.field,value)};
    }
    return {id:e.id,user_id:user,source:system,field:e.field,value:e.value,clock:e.clock,baseline:e.baseline,write_version:e.write_version,bytes:e.bytes};
  }
  async function receive(key:string,pair:ObjectValue,raw:ObjectValue){
    await checkPair(key,pair);
    if(!object(raw)||raw.source!==other||uuid(raw.user_id)!==pair[other]||typeof raw.field!=='string'||typeof raw.baseline!=='boolean')throw new MirrorError('invalid_event');
    uuid(raw.id);validateClock(raw.clock);fieldFor(raw.field);
    const version=raw.write_version;
    if(!object(version)||Object.keys(version).sort().join(',')!=='at,baseline,id,source'||typeof version.at!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(version.at)||!Number.isFinite(Date.parse(version.at))||!['pncl','leadspply'].includes(version.source)||typeof version.baseline!=='boolean'||typeof version.id!=='string'||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(version.id))throw new MirrorError('invalid_event');
    const event={id:raw.id,user_id:raw.user_id,source:other,field:raw.field,value:raw.value,clock:raw.clock,baseline:raw.baseline,write_version:version,file:null as ObjectValue|null};
    if(assetField(raw.field)&&raw.value!==null){
      if(!object(raw.value))throw new MirrorError('invalid_asset');
      location(pair[other],raw.value,other);
      const bytes=fromBase64(raw.bytes);validFile(bytes,raw.value.mime,raw.field);
      if(bytes.length!==raw.value.bytes||await hash(bytes)!==raw.value.sha256)throw new MirrorError('file_integrity');
      const bucket=raw.field==='profile_photo'?(system==='pncl'?'portal-profile-photos':'avatars'):(system==='pncl'?'portal-profile-documents':'profile-sync-documents');
      const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'} as ObjectValue)[raw.value.mime];
      const path=`${pair[system]}/mirror/${raw.id}.${ext}`;
      const {error}=await db.storage.from(bucket).upload(path,bytes,{contentType:raw.value.mime,upsert:false});if(error){const existing=await db.storage.from(bucket).download(path);if(existing.error||!existing.data||await hash(new Uint8Array(await existing.data.arrayBuffer()))!==raw.value.sha256)throw new MirrorError('file_copy_failed',503);}
      event.file={bucket,path};
    }else event.value=normalize(raw.field,raw.value);
    const receipts=await rpc('receive',pair[system],{events:[event]});
    if(system==='leadspply'&&receipts.some((r:ObjectValue)=>r.outcome==='applied')&&['first_name','last_name','phone','business_legal_name','business_address_line1','business_address_city','business_address_state','business_address_postal','business_website','timezone'].includes(event.field))defer(db.functions.invoke('sync-business-profile',{body:{target_user_id:pair[system]}}));
    return receipts;
  }
  async function syncUserBody(key:string,user:string,reverse=true){
    const pair=await link(key,user);
    await peer(key,{action:'bind',pair});
    const pendingEvents=await rpc('outbox',user);
    const events=pendingEvents.slice(0,4);
    // Bound fan-out and keep a failed field independent of the rest of the profile.
    for(let i=0;i<events.length;i+=4)await Promise.all(events.slice(i,i+4).map(async(raw:ObjectValue)=>{
      try{const event=await enrich(user,raw);const receipts=await peer(key,{action:'deliver',pair,event});await rpc('ack',user,{receipts});}
      catch(error){await rpc('fail',user,{id:raw.id,error:safeCode(error)});}
    }));
    if(pendingEvents.length>events.length)await rpc('dispatch',user);
    if(reverse)await peer(key,{action:'flush',pair});
    return {processed:events.length};
  }
  async function syncUser(key:string,user:string,reverse=true){try{await rpc('touch',user);return await syncUserBody(key,user,reverse);}catch(error){await rpc('touch',user,{error:safeCode(error)});throw error;}}
  function defer(task:Promise<unknown>){d.defer(task.catch(()=>undefined));}
  async function getView(user:string){
    const data=await rpc('read',user),values:ObjectValue={},clocks:ObjectValue={},conflicts:ObjectValue={},urls:ObjectValue={};
    for(const f of data.fields){
      values[f.field]=f.value;clocks[f.field]=f.clock;
      // Differences are resolved automatically by server save order.
      if(f.file&&f.value!==null){
        const file=location(user,f.file);const {data:signed}=await db.storage.from(file.bucket).createSignedUrl(file.path,60);
        if(signed?.signedUrl)urls[f.field]=signed.signedUrl;
      }
    }
    return {version:3,values,clocks,conflicts,urls,pending:data.pending,errors:data.errors,linked:data.linked,lastError:data.lastError};
  }
  async function searchSongs(user:string,query:unknown){
    if(typeof query!=='string'||query.trim().length<2||query.length>100)throw new MirrorError('invalid_song_query');
    const term=query.trim(),cacheKey=term.toLocaleLowerCase('en-US'),cached=songCache.get(cacheKey);
    if(cached&&cached.expires>Date.now())return {songs:cached.songs};
    if(Date.now()-(songRequests.get(user)??0)<1500)throw new MirrorError('song_search_busy',429);
    if(songRequests.size>=500)songRequests.delete(songRequests.keys().next().value!);
    songRequests.set(user,Date.now());
    const url=new URL('https://itunes.apple.com/search');
    url.search=new URLSearchParams({term,entity:'song',media:'music',country:'US',limit:'20'}).toString();
    let data:ObjectValue;
    try{
      const response=await d.fetch(url.toString(),{redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('provider_unavailable');
      data=await response.json();
    }catch{throw new MirrorError('song_search_unavailable',503);}
    if(!object(data)||!Array.isArray(data.results))throw new MirrorError('song_search_unavailable',503);
    const songs:Json[]=[],seen=new Set<string>();
    for(const track of data.results.slice(0,20)){
      if(!object(track)||track.kind!=='song'||!Number.isSafeInteger(track.trackId)||seen.has(String(track.trackId)))continue;
      try{
        const song=normalize('close_out_song',{provider:'apple',id:String(track.trackId),title:track.trackName,artist:track.artistName,url:track.trackViewUrl});
        songs.push(song);seen.add(String(track.trackId));
      }catch{/* Ignore malformed provider metadata; never return audio or artwork. */}
    }
    if(songCache.size>=100)songCache.delete(songCache.keys().next().value!);
    songCache.set(cacheKey,{expires:Date.now()+60*60*1000,songs});
    return {songs};
  }
  async function userSave(user:string,request:ObjectValue){
    if(!object(request)||Object.keys(request).some(k=>!['id','changes','expected','resolve'].includes(k))||!object(request.changes)||!object(request.expected))throw new MirrorError('invalid_request');
    uuid(request.id);const keys=Object.keys(request.changes);
    if(keys.length>80||Object.keys(request.expected).length!==keys.length||Object.keys(request.expected).some(k=>!keys.includes(k))||request.resolve&&(!Array.isArray(request.resolve)||request.resolve.some((k:unknown)=>typeof k!=='string'||!keys.includes(k))))throw new MirrorError('invalid_request');
    const fingerprint=await hash(new TextEncoder().encode(JSON.stringify(request)));
    const previous=await rpc('operation',user,{id:request.id});if(previous){if(previous.fingerprint!==fingerprint)throw new MirrorError('request_id_reused',409);return {...previous.result,view:await getView(user)};}
    const current=await rpc('read',user),files:ObjectValue={},changes:ObjectValue={};
    for(const field of keys){
      validateClock(request.expected[field]);const meta=fieldFor(field);if(meta.derived)throw new MirrorError('derived_field');
      const value=request.changes[field];
      if(meta.kind==='asset'&&value!==null){
        const f=current.fields.find((f:ObjectValue)=>f.field===field);
        const candidate=[f,...(request.resolve?.includes(field)?[f?.conflict]:[])].find(x=>x&&JSON.stringify(x.value)===JSON.stringify(value));
        if(!candidate?.file)throw new MirrorError('asset_not_owned',403);
        files[field]=candidate.file;changes[field]=value;
      }else changes[field]=normalize(field,value);
    }
    if(keys.includes('home_address_zip')){
      const county=changes.home_address_zip===null?null:d.county(changes.home_address_zip);
      if(changes.home_address_zip!==null&&!county)throw new MirrorError('unknown_zip');
      changes.home_county=county;request={...request,expected:{...request.expected,home_county:current.fields.find((f:ObjectValue)=>f.field==='home_county').clock}};
    }
    const result=await rpc('save',user,{...request,changes,files,fingerprint});return {...result,view:await getView(user)};
  }
  async function upload(user:string,body:ObjectValue){
    if(!assetField(body.field)||!object(body.clock))throw new MirrorError('invalid_upload');uuid(body.id);validateClock(body.clock);
    const fingerprint=await hash(new TextEncoder().encode(JSON.stringify(body)));const previous=await rpc('operation',user,{id:body.id});if(previous){if(previous.fingerprint!==fingerprint)throw new MirrorError('request_id_reused',409);return {...previous.result,view:await getView(user)};}
    const bytes=fromBase64(body.base64);validFile(bytes,body.mime,body.field);
    if(typeof body.name!=='string'||body.name.length>120||(body.name.includes('/')||body.name.includes('\\')||Array.from(body.name).some(char=>char.charCodeAt(0)<32)))throw new MirrorError('invalid_file_name');
    const bucket=body.field==='profile_photo'?(system==='pncl'?'portal-profile-photos':'avatars'):(system==='pncl'?'portal-profile-documents':'profile-sync-documents');
    const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'} as ObjectValue)[body.mime];
    const digest=await hash(bytes),path=`${user}/mirror/${body.id}-${digest}.${ext}`;
    const {error}=await db.storage.from(bucket).upload(path,bytes,{contentType:body.mime,upsert:false});if(error){const existing=await db.storage.from(bucket).download(path);if(existing.error||!existing.data||await hash(new Uint8Array(await existing.data.arrayBuffer()))!==digest)throw new MirrorError('upload_failed',503);}
    const value={system,bucket,path,id:body.id,name:body.name,mime:body.mime,bytes:bytes.length,sha256:digest};
    const changes:ObjectValue={[body.field]:value},expected:ObjectValue={[body.field]:body.clock};
    if(body.field.startsWith('document:')){const key='document_label:'+body.field.slice(9);changes[key]=normalize(key,body.label||body.name);const current=await rpc('read',user);expected[key]=current.fields.find((f:ObjectValue)=>f.field===key)?.clock??{pncl:0,leadspply:0};}
    const result=await rpc('save',user,{id:body.id,changes,expected,fingerprint,files:{[body.field]:{bucket,path}}});return {...result,view:await getView(user)};
  }
  return async(req:Request):Promise<Response>=>{
    const origin=req.headers.get('Origin'),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
    if(origin&&ORIGINS[system].includes(origin))headers['Access-Control-Allow-Origin']=origin;
    const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
    try{
      if(origin&&!ORIGINS[system].includes(origin))throw new MirrorError('forbidden_origin',403);
      if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'}});
      if(req.method!=='POST')throw new MirrorError('method_not_allowed',405);
      if(Number(req.headers.get('Content-Length'))>8*1024*1024)throw new MirrorError('request_too_large',413);
      const raw=await req.text();if(raw.length>8*1024*1024)throw new MirrorError('request_too_large',413);
      let body;try{body=JSON.parse(raw);}catch{throw new MirrorError('invalid_request');}if(!object(body))throw new MirrorError('invalid_request');
      const config=await rpc('config');if(!config.enabled||!config.secret)throw new MirrorError('sync_disabled',503);
      let key=req.headers.get('X-Profile-Sync-Key');
      const kickSignature=req.headers.get('X-Profile-Sync-Kick');
      if(kickSignature){
        // Managed pg_net queues can be readable. Sign only a short-lived wake-up;
        // never put the persistent server credential into that queue.
        if(origin||!['tick','sync'].includes(body.action)||!Number.isSafeInteger(body.issuedAt)||Math.abs(Date.now()/1000-body.issuedAt)>300||!/^[a-f0-9]{64}$/.test(kickSignature))throw new MirrorError('unauthorized',401);
        const signingKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
        const signature=Uint8Array.from(kickSignature.match(/../g)!,v=>parseInt(v,16));
        if(!await crypto.subtle.verify('HMAC',signingKey,signature,new TextEncoder().encode(raw)))throw new MirrorError('unauthorized',401);
        key=config.secret;
      }
      if(key){
        if(origin||key.length!==config.secret.length)throw new MirrorError('unauthorized',401);
        const a=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(config.secret)));let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];if(mismatch)throw new MirrorError('unauthorized',401);
        if(body.action==='link'&&system==='leadspply'){
          const pair=await rpc('link',uuid(body.userId),{system:body.system});if(pair)await available(pair.leadspply);return json(pair);
        }
        if(body.action==='tick'){const users=await rpc('tick_users');defer((async()=>{const garbage=await rpc('gc_candidates');for(const file of garbage)await db.storage.from(file.bucket).remove([file.path]);for(const user of users)await rpc('dispatch',user);})());return json({accepted:true,accounts:users.length},202);}
        if(body.action==='sync'){const user=uuid(body.userId);defer(syncUser(key,user));return json({accepted:true},202);}
        if(body.action==='bind'){await checkPair(key,body.pair);return json({ok:true});}
        if(body.action==='deliver')return json(await receive(key,body.pair,body.event));
        if(body.action==='flush'){const pair=await checkPair(key,body.pair);defer(syncUser(key,pair[system],false));return json({accepted:true},202);}
        throw new MirrorError('invalid_action');
      }
      const authorization=req.headers.get('Authorization')??'';if(!authorization.startsWith('Bearer '))throw new MirrorError('unauthorized',401);
      const {data,error}=await db.auth.getUser(authorization.slice(7));if(error||!data.user)throw new MirrorError('unauthorized',401);
      const user=data.user.id;await available(user);
      if(Object.keys(body).some(k=>!['action','request','field','id','clock','name','mime','base64','label','query'].includes(k)))throw new MirrorError('invalid_request');
      if(body.action==='search_songs')return json(await searchSongs(user,body.query));
      if(body.action==='read'){defer(syncUser(config.secret,user));return json(await getView(user));}
      if(body.action==='save'){const result=await userSave(user,body.request);defer(syncUser(config.secret,user));return json(result,result.outcome==='conflict'?409:200);}
      if(body.action==='upload'){const result=await upload(user,body);defer(syncUser(config.secret,user));return json(result,result.outcome==='conflict'?409:200);}
      if(body.action==='retry'){await rpc('retry',user);defer(syncUser(config.secret,user));return json(await getView(user));}
      throw new MirrorError('invalid_action');
    }catch(error){return json({error:safeCode(error)},error instanceof MirrorError?error.status:503);}
  };
}
