/** Explicit native-profile union, independent of transport and storage. */
export type System = 'pncl' | 'leadspply';
export type Clock = { pncl: number; leadspply: number };
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Section = 'personal' | 'home' | 'sizes' | 'business' | 'licensing' | 'email' | 'documents';
export interface Field {
  key: string; label: string; section: Section; kind: 'name'|'text'|'phone'|'npn'|'state'|'zip'|'size'|'ein'|'url'|'timezone'|'email'|'boolean'|'licenses'|'asset'|'song';
  pncl?: string; leadspply?: string; options?: string[]; derived?: boolean;
}
export const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const sizes = ['XS','S','M','L','XL','2XL','3XL','4XL'];
export const CLOSE_OUT_CLIP_SECONDS = 10;
export const MAX_SONG_PREVIEW_SECONDS = 600;
export type CloseOutSong = {provider:'apple';id:string;title:string;artist:string;url:string;clipSource?:'apple_preview';previewDurationSeconds?:number;clipStartSeconds?:number;clipDurationSeconds?:10};
export const FIELDS: Field[] = [
  {key:'close_out_song',label:'Close out song',section:'personal',kind:'song'},
  {key:'first_name',label:'First name',section:'personal',kind:'name',pncl:'first_name',leadspply:'first_name'},
  {key:'last_name',label:'Last name',section:'personal',kind:'name',pncl:'last_name',leadspply:'last_name'},
  {key:'phone',label:'Phone number',section:'personal',kind:'phone',pncl:'phone_number',leadspply:'phone'},
  {key:'profile_photo',label:'Profile photo',section:'personal',kind:'asset',pncl:'profile_photo_path',leadspply:'avatar_url'},
  {key:'home_address_line1',label:'Street address',section:'home',kind:'text',pncl:'address_line1'},
  {key:'home_address_city',label:'City',section:'home',kind:'text',pncl:'address_city'},
  {key:'home_address_state',label:'State',section:'home',kind:'state',pncl:'address_state'},
  {key:'home_address_zip',label:'ZIP code',section:'home',kind:'zip',pncl:'address_zip'},
  {key:'home_county',label:'County',section:'home',kind:'text',pncl:'county',derived:true},
  ...(['shirt','polo_shirt','hoodie'] as const).map((name):Field=>({key:name+'_size',label:({shirt:'Shirt size',polo_shirt:'Polo shirt size',hoodie:'Hoodie size'})[name],section:'sizes',kind:'size',pncl:name+'_size',options:sizes})),
  {key:'waist_size',label:'Waist size',section:'sizes',kind:'size',pncl:'waist_size',options:['28','30','32','34','36','38','40','42','44','46','48']},
  {key:'shoe_size',label:'Shoe size',section:'sizes',kind:'size',pncl:'shoe_size',options:['6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','13','14']},
  {key:'business_legal_name',label:'Business legal name',section:'business',kind:'text',leadspply:'business_legal_name'},
  {key:'business_ein',label:'EIN',section:'business',kind:'ein',leadspply:'business_ein'},
  {key:'business_address_line1',label:'Street address',section:'business',kind:'text',leadspply:'business_address_line1'},
  {key:'business_address_city',label:'City',section:'business',kind:'text',leadspply:'business_address_city'},
  {key:'business_address_state',label:'State',section:'business',kind:'state',leadspply:'business_address_state'},
  {key:'business_address_postal',label:'ZIP code',section:'business',kind:'zip',leadspply:'business_address_postal'},
  {key:'business_website',label:'Business website',section:'business',kind:'url',leadspply:'business_website'},
  {key:'timezone',label:'Working timezone',section:'business',kind:'timezone',leadspply:'timezone'},
  {key:'npn',label:'NPN',section:'licensing',kind:'npn',pncl:'npn',leadspply:'npn'},
  {key:'state_license_numbers',label:'State licenses and numbers',section:'licensing',kind:'licenses',pncl:'state_license_numbers'},
  {key:'eo_policy_number',label:'E&O policy number',section:'licensing',kind:'text',pncl:'eo_policy_number'},
  {key:'eo_certificate',label:'E&O certificate',section:'licensing',kind:'asset',pncl:'eo_certificate_path'},
  {key:'drivers_license',label:"Driver’s license",section:'licensing',kind:'asset',pncl:'drivers_license_path'},
  {key:'email_from_name',label:'Email sender name',section:'email',kind:'text',leadspply:'email_from_name'},
  {key:'email_reply_to',label:'Reply-to email',section:'email',kind:'email',leadspply:'email_reply_to'},
  {key:'show_on_leaderboard',label:'Appear on leaderboard',section:'email',kind:'boolean',leadspply:'show_on_leaderboard'},
];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface Asset { id:string; name:string; mime:string; bytes:number; sha256:string; origin:System }
export class MirrorError extends Error {
  constructor(public code:string,public status=400){super(code);}
}
const record=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const safeText=(v:unknown,max=240):string=>{
  if(typeof v!=='string')throw new MirrorError('invalid_value');
  const s=v.trim();
  if([...s].length>max || [...s].some(c=>{const n=c.codePointAt(0)!;return n<32 || (n>=127&&n<=159) || (n>=0xd800&&n<=0xdfff);}))throw new MirrorError('invalid_value');
  return s;
};
export function fieldFor(key:string):Field {
  const f=FIELDS.find(f=>f.key===key);
  if(f)return f;
  if(key.startsWith('document_label:') && UUID.test(key.slice(15)))return {key,label:'Document label',section:'documents',kind:'text'};
  if(key.startsWith('document:') && UUID.test(key.slice(9)))return {key,label:'Document',section:'documents',kind:'asset'};
  throw new MirrorError('field_not_allowed');
}
export function normalize(key:string,value:unknown):Json {
  const f=fieldFor(key);
  if(value===null){if(f.kind==='name')throw new MirrorError('name_required');return null;}
  if(f.kind==='song'){
    if(!record(value)||Object.keys(value).some(k=>!['artist','id','provider','title','url','clipSource','previewDurationSeconds','clipStartSeconds','clipDurationSeconds'].includes(k))||value.provider!=='apple'||typeof value.id!=='string'||!/^\d{1,20}$/.test(value.id))throw new MirrorError('invalid_song');
    const title=safeText(value.title,240),artist=safeText(value.artist,240),url=safeText(value.url,1000);
    let parsed;try{parsed=new URL(url);}catch{throw new MirrorError('invalid_song');}
    if(!title||!artist||parsed.protocol!=='https:'||parsed.hostname!=='music.apple.com'||parsed.port||parsed.username||parsed.password)throw new MirrorError('invalid_song');
    const song:CloseOutSong={provider:'apple',id:value.id,title,artist,url};
    if(['clipSource','previewDurationSeconds','clipStartSeconds','clipDurationSeconds'].some(k=>k in value)){
      if(value.clipSource!=='apple_preview'||!Number.isSafeInteger(value.previewDurationSeconds)||Number(value.previewDurationSeconds)<CLOSE_OUT_CLIP_SECONDS||Number(value.previewDurationSeconds)>MAX_SONG_PREVIEW_SECONDS||!Number.isSafeInteger(value.clipStartSeconds)||Number(value.clipStartSeconds)<0||value.clipDurationSeconds!==CLOSE_OUT_CLIP_SECONDS||Number(value.clipStartSeconds)+CLOSE_OUT_CLIP_SECONDS>Number(value.previewDurationSeconds))throw new MirrorError('invalid_song');
      song.clipSource='apple_preview';song.previewDurationSeconds=Number(value.previewDurationSeconds);
      song.clipStartSeconds=Number(value.clipStartSeconds);song.clipDurationSeconds=CLOSE_OUT_CLIP_SECONDS;
    }
    return song;
  }
  if(f.kind==='boolean'){if(typeof value!=='boolean')throw new MirrorError('invalid_value');return value;}
  if(f.kind==='licenses'){
    if(!record(value) || Object.keys(value).length>51)throw new MirrorError('invalid_licenses');
    const result:Record<string,string>={};
    for(const state of Object.keys(value).sort()){
      if(!STATES.includes(state))throw new MirrorError('invalid_licenses');
      const number=safeText(value[state],60);if(!number)throw new MirrorError('license_number_required');result[state]=number;
    }
    return result;
  }
  if(f.kind==='asset'){
    if(!record(value)||Object.keys(value).sort().join(',')!=='bytes,id,mime,name,origin,sha256'||!UUID.test(String(value.id))||!['pncl','leadspply'].includes(String(value.origin))||!Number.isSafeInteger(value.bytes)||Number(value.bytes)<1||Number(value.bytes)>5*1024*1024||!/^[a-f0-9]{64}$/.test(String(value.sha256)))throw new MirrorError('invalid_asset');
    const name=safeText(value.name,120);if(!name||name.includes('/')||name.includes('\\'))throw new MirrorError('invalid_asset');
    const images=['image/jpeg','image/png','image/webp'];
    if(!(key==='profile_photo'?images:[...images,'application/pdf']).includes(String(value.mime)) || (key==='profile_photo'&&Number(value.bytes)>300*1024))throw new MirrorError('invalid_asset');
    return {id:String(value.id),name,mime:String(value.mime),bytes:Number(value.bytes),sha256:String(value.sha256),origin:value.origin as System};
  }
  const s=safeText(value);
  if(!s){if(f.kind==='name')throw new MirrorError('name_required');return null;}
  if(f.kind==='name'&&[...s].length>100)throw new MirrorError('invalid_name');
  if(f.kind==='phone'){
    if(!/^[+\d\s().-]+$/.test(s))throw new MirrorError('invalid_phone');
    const digits=s.replace(/\D/g,'');const n=digits.length===11&&digits[0]==='1'?digits.slice(1):digits;
    if(!/^\d{10}$/.test(n)||n==='0000000000')throw new MirrorError('invalid_phone');return '+1'+n;
  }
  if(f.kind==='npn'&&!/^\d{5,10}$/.test(s))throw new MirrorError('invalid_npn');
  if(f.kind==='state'&&!STATES.includes(s))throw new MirrorError('invalid_state');
  if(f.kind==='zip'&&!/^\d{5}(?:-\d{4})?$/.test(s))throw new MirrorError('invalid_zip');
  if(f.kind==='size'&&!f.options?.includes(s))throw new MirrorError('invalid_size');
  if(f.kind==='ein'){
    if(!/^\d{2}-?\d{7}$/.test(s))throw new MirrorError('invalid_ein');return s.replace('-','');
  }
  if(f.kind==='url'){
    let url;try{url=new URL(s);}catch{throw new MirrorError('invalid_website');}
    if(url.protocol!=='https:'||url.username||url.password)throw new MirrorError('invalid_website');return url.toString();
  }
  if(f.kind==='timezone'){try{new Intl.DateTimeFormat('en-US',{timeZone:s});}catch{throw new MirrorError('invalid_timezone');}}
  if(f.kind==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw new MirrorError('invalid_email');
  return s;
}
export const zero=():Clock=>({pncl:0,leadspply:0});
export const join=(a:Clock,b:Clock):Clock=>({pncl:Math.max(a.pncl,b.pncl),leadspply:Math.max(a.leadspply,b.leadspply)});
const dominates=(a:Clock,b:Clock)=>a.pncl>=b.pncl&&a.leadspply>=b.leadspply;
export interface Conflict { value:Json; clock:Clock; source:System; eventId:string }
export interface Version { value:Json; clock:Clock; source:System|null; at:string|null; conflict?:Conflict }
export interface Event { id:string; source:System; actor:string; field:string; value:Json; clock:Clock; at:string; baseline:boolean; attempts:number; nextAt:number; status:'pending'|'delivered'|'conflict'|'error'; error?:string }
export interface Replica { native:Record<string,Json>; counterparts:Record<string,Json>; fields:Record<string,Version> }
export interface Audit { id:string; source:System; destination:System; field:string; outcome:string; at:string; actor:string }
export interface MirrorState { version:2; link:Record<System,string>; replicas:Record<System,Replica>; outbox:Event[]; receipts:Record<string,{input:string;result:string}>; uploads?:Record<string,{input:string;result:SaveResult}>; operations:Record<string,{input:string;result:SaveResult}>; audit:Audit[] }
export interface View { version:2; legacyStates:string[]; values:Record<string,Json>; clocks:Record<string,Clock>; conflicts:Record<string,Conflict>; pending:number; errors:number; owned:Record<string,Json> }
export interface Save { id:string; changes:Record<string,Json>; expected:Record<string,Clock>; resolve?:string[] }
export interface SaveResult { outcome:'saved'|'conflict'; conflicts:string[]; view:View }
const other=(s:System):System=>s==='pncl'?'leadspply':'pncl';
function project(state:MirrorState,system:System,key:string,value:Json) {
  const replica=state.replicas[system],f=fieldFor(key),column=f[system];
  if(column){
    let native=value;
    if(key==='phone'&&system==='pncl'&&typeof value==='string'){const n=value.slice(2);native=`${n.slice(0,3)}-${n.slice(3,6)}-${n.slice(6)}`;}
    if(f.kind==='asset')native=value===null?null:system==='pncl'?`${state.link[system]}/mirror/${(value as unknown as Asset).id}`:`/api/${system}/assets/${(value as unknown as Asset).id}`;
    replica.native[column]=native;
  }else replica.counterparts[key]=value;
  if(key==='state_license_numbers'){
    const states=value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value).sort():[];
    const legacy=system==='leadspply'&&Array.isArray(replica.counterparts.legacy_licensed_states)?replica.counterparts.legacy_licensed_states.filter(s=>typeof s==='string'&&!states.includes(s)) as string[]:[];
    replica.counterparts.legacy_licensed_states=legacy;
    replica.native[system==='pncl'?'state_licenses':'licensed_states']=[...new Set([...states,...legacy])].sort();
  }
}
export function createMirror(link:Record<System,string>,pncl:Record<string,Json>,leadspply:Record<string,Json>,id:()=>string,now:()=>string):MirrorState {
  if(!UUID.test(link.pncl)||!UUID.test(link.leadspply))throw new MirrorError('invalid_link');
  const state:MirrorState={version:2,link,replicas:{pncl:{native:{...pncl},counterparts:{},fields:{}},leadspply:{native:{...leadspply},counterparts:{},fields:{}}},outbox:[],receipts:{},uploads:{},operations:{},audit:[]};
  if(Array.isArray(leadspply.licensed_states))state.replicas.leadspply.counterparts.legacy_licensed_states=leadspply.licensed_states.filter(s=>typeof s==='string'&&STATES.includes(s));
  for(const system of ['pncl','leadspply'] as System[])for(const f of FIELDS){
    const raw=f[system]?state.replicas[system].native[f[system]!]??null:null;
    const value=raw===null?null:normalize(f.key,raw);
    const clock=zero();if(value!==null)clock[system]=1;
    state.replicas[system].fields[f.key]={value,clock,source:value===null?null:system,at:value===null?null:now()};
    if(value!==null)state.outbox.push({id:id(),source:system,actor:link[system],field:f.key,value,clock:{...clock},at:now(),baseline:true,attempts:0,nextAt:0,status:'pending'});
  }
  return state;
}
export function view(state:MirrorState,system:System):View {
  const values:Record<string,Json>={},clocks:Record<string,Clock>={},conflicts:Record<string,Conflict>={};
  for(const [key,v]of Object.entries(state.replicas[system].fields)){values[key]=v.value;clocks[key]={...v.clock};if(v.conflict)conflicts[key]=v.conflict;}
  const owned:Record<string,Json>={};
  for(const [key,value]of Object.entries(state.replicas[system].native))if(['work_email','account_email','agent_number','pay_tier','pay_tier_effective_at','designation','license_status','verified_at','agent_code','microsite_domain'].includes(key))owned[key]=value;
  for(const key of ['work_email','agent_number','pay_tier','pay_tier_effective_at','designation','recovery_email'])if(key in state.replicas.pncl.native)owned[key]=state.replicas.pncl.native[key];
  for(const key of ['account_email','license_status','verified_at','agent_code','microsite_domain'])if(key in state.replicas.leadspply.native)owned[key]=state.replicas.leadspply.native[key];
  return {version:2,legacyStates:state.replicas.leadspply.counterparts.legacy_licensed_states as string[]??[],values,clocks,conflicts,pending:state.outbox.filter(e=>e.source===system&&e.status==='pending').length,errors:state.outbox.filter(e=>e.source===system&&e.status==='error').length,owned};
}
function validateClock(v:unknown):asserts v is Clock {
  if(!record(v)||Object.keys(v).sort().join(',')!=='leadspply,pncl'||!Number.isSafeInteger(v.pncl)||!Number.isSafeInteger(v.leadspply)||Number(v.pncl)<0||Number(v.leadspply)<0)throw new MirrorError('invalid_clock');
}
export function save(state:MirrorState,system:System,request:Save,id:()=>string,now:()=>string):SaveResult {
  if(!record(request)||Object.keys(request).some(k=>!['id','changes','expected','resolve'].includes(k))||!UUID.test(request.id)||!record(request.changes)||!record(request.expected)||Object.keys(request.changes).length>60)throw new MirrorError('invalid_request');
  const operation=system+':'+request.id,input=JSON.stringify(request);
  if(state.operations[operation]){if(state.operations[operation].input!==input)throw new MirrorError('request_id_reused',409);return state.operations[operation].result;}
  const keys=Object.keys(request.changes);
  if(Object.keys(request.expected).length!==keys.length||Object.keys(request.expected).some(k=>!keys.includes(k)))throw new MirrorError('invalid_request');
  if(request.resolve && (!Array.isArray(request.resolve)||request.resolve.some(k=>!keys.includes(k))))throw new MirrorError('invalid_request');
  const normalized:Record<string,Json>={},conflicts:string[]=[];
  for(const key of keys){
    const f=fieldFor(key);if(f.derived)throw new MirrorError('derived_field');
    normalized[key]=normalize(key,request.changes[key]);validateClock(request.expected[key]);
    const current=state.replicas[system].fields[key]??{value:null,clock:zero(),source:null,at:null};
    if(!equal(current.clock,request.expected[key])||(current.conflict&&!request.resolve?.includes(key)))conflicts.push(key);
  }
  // An ordinary local save is atomic; cross-system delivery merges by field.
  if(conflicts.length){const result:SaveResult={outcome:'conflict',conflicts,view:view(state,system)};state.operations[operation]={input,result};return result;}
  for(const key of keys){
    const current=state.replicas[system].fields[key]??{value:null,clock:zero(),source:null,at:null};
    if(equal(current.value,normalized[key])&&!current.conflict)continue;
    const clock=join(current.clock,current.conflict?.clock??zero());clock[system]++;
    if(!Number.isSafeInteger(clock[system]))throw new MirrorError('revision_overflow');
    const at=now(),value=normalized[key];state.replicas[system].fields[key]={value,clock,source:system,at};project(state,system,key,value);
    state.outbox.push({id:id(),source:system,actor:state.link[system],field:key,value,clock:{...clock},at,baseline:false,attempts:0,nextAt:0,status:'pending'});
  }
  const result:SaveResult={outcome:'saved',conflicts:[],view:view(state,system)};state.operations[operation]={input,result};return result;
}
/** Called within the destination transaction. Receipts and native projection commit together. */
export function deliver(state:MirrorState,eventId:string,now:()=>string):string {
  const event=state.outbox.find(e=>e.id===eventId);if(!event)throw new MirrorError('unknown_event');
  if(event.actor!==state.link[event.source]||!UUID.test(event.id))throw new MirrorError('invalid_actor');
  const value=normalize(event.field,event.value);validateClock(event.clock);
  const input=JSON.stringify({id:event.id,source:event.source,actor:event.actor,field:event.field,value,clock:event.clock,at:event.at,baseline:event.baseline});
  if(state.receipts[event.id]){if(state.receipts[event.id].input!==input)throw new MirrorError('event_id_reused',409);return state.receipts[event.id].result;}
  const destination=other(event.source),replica=state.replicas[destination];
  const current=replica.fields[event.field]??{value:null,clock:zero(),source:null,at:null};
  let outcome:string;
  if(equal(current.value,value)){
    if(current.conflict&&dominates(event.clock,join(current.clock,current.conflict.clock))){delete current.conflict;current.source=event.source;current.at=event.at;}
    current.clock=join(current.clock,event.clock);replica.fields[event.field]=current;outcome='matched';
  }else if(dominates(current.clock,event.clock))outcome='stale';
  else if((event.baseline&&current.value!==null)||!dominates(event.clock,current.clock)){
    current.conflict={value,clock:event.clock,source:event.source,eventId:event.id};replica.fields[event.field]=current;
    const source=state.replicas[event.source].fields[event.field];
    // A late receipt must not put an old conflict on a newer resolved edit.
    if(source&&equal(source.value,value)&&equal(source.clock,event.clock))source.conflict={value:current.value,clock:current.clock,source:destination,eventId:event.id};
    outcome='conflict';
  }else{
    replica.fields[event.field]={value,clock:{...event.clock},source:event.source,at:event.at};project(state,destination,event.field,value);outcome='applied';
  }
  event.status=outcome==='conflict'?'conflict':'delivered';delete event.error;
  state.receipts[event.id]={input,result:outcome};
  // Values, EINs, documents and credentials never enter the general audit stream.
  state.audit.unshift({id:event.id,source:event.source,destination,field:event.field,outcome,at:now(),actor:event.actor});
  return outcome;
}
export function failed(state:MirrorState,eventId:string,error:string,now:number) {
  const e=state.outbox.find(e=>e.id===eventId);if(!e||e.status!=='pending')return;
  e.attempts++;e.status=e.attempts>=10?'error':'pending';e.error=error;e.nextAt=now+Math.min(60000,250*2**Math.min(e.attempts,8));
}
export function retry(state:MirrorState,system:System){for(const e of state.outbox)if(e.source===system&&(e.status==='pending'||e.status==='error')){e.status='pending';e.attempts=0;e.nextAt=0;delete e.error;}}
/** Trusted derived-field projection (e.g. PNCL county lookup); never an arbitrary browser patch. */
export function deriveCounty(state:MirrorState,system:System,county:string|null,id:()=>string,now:()=>string){
  const key='home_county',value=normalize(key,county),current=state.replicas[system].fields[key];
  if(equal(current.value,value)&&!current.conflict)return;
  const clock=join(current.clock,current.conflict?.clock??zero());clock[system]++;
  state.replicas[system].fields[key]={value,clock,source:system,at:now()};project(state,system,key,value);
  state.outbox.push({id:id(),source:system,actor:state.link[system],field:key,value,clock,at:now(),baseline:false,attempts:0,nextAt:0,status:'pending'});
}
