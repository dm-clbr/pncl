import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
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
let dispatches=0,songSearchCalls=0,songLookupCalls=0;
const testSong={provider:"apple",id:"123456789",title:"Synthetic Song",artist:"Synthetic Artist",url:"https://music.apple.com/us/song/123456789"};
const storage={pncl:new Map(),leadspply:new Map()},handlers={},pending=[];
const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const sql=(system,query)=>execFileSync(process.env.PSQL??'psql',['-h','127.0.0.1','-p',process.env.PROFILE_SYNC_TEST_PORT??'55439','-U','postgres','-d','mirror_'+system,'-v','ON_ERROR_STOP=1','-At','-c',query],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
for(const system of Object.keys(users)){
 sql(system,`update profile_sync_private.settings set enabled=true,secret='${key}'; grant select on public.pncl_account_links to service_role;`.replace(' grant select on public.pncl_account_links to service_role;',system==='leadspply'?' grant select on public.pncl_account_links to service_role;':''));
 const db={
  rpc:async(name,{p_action,p_user,p_body})=>{try{const result=sql(system,`set role service_role; select public.profile_sync('${p_action}',${p_user?`'${p_user}'::uuid`:'null'},${literal(p_body)});`).replace(/^SET(?:\n|$)/,'');if(p_action==='dispatch'){dispatches++;pending.push(Promise.resolve().then(()=>handlers[system](new Request(roots[system]+'/functions/v1/profile-sync',{method:'POST',headers:{'Content-Type':'application/json','X-Profile-Sync-Key':key},body:JSON.stringify({action:'sync',userId:p_user})}))));}return {data:result?JSON.parse(result):null,error:null};}catch(error){console.error('RPC failed',system,p_action,error.stderr.toString());return {data:null,error:{message:error.stderr.toString().split('\n')[0].replace('ERROR:  ','')}};}},
  auth:{getUser:async token=>token===system?{data:{user:{id:users[system]}},error:null}:{data:{user:null},error:{message:'invalid'}}},
  functions:{invoke:async()=>({data:{ok:true},error:null})},
  storage:{from:bucket=>({
    upload:async(path,bytes,{contentType})=>{storage[system].set(bucket+'/'+path,{bytes:Buffer.from(bytes),type:contentType});return {error:null};},
    download:async path=>{const value=storage[system].get(bucket+'/'+path);return value?{data:new Blob([value.bytes],{type:value.type}),error:null}:{data:null,error:{message:'missing'}};},
    createSignedUrl:async(path,seconds)=>({data:{signedUrl:roots[system]+'/private/'+bucket+'/'+path+'?expires='+seconds},error:null})
  })}
 };
 handlers[system]=createProfileSyncHandler({system,db,county:zip=>zip==='84101'?'Salt Lake':null,defer:promise=>pending.push(promise),fetch:async(url,options)=>{if(String(url).startsWith('https://itunes.apple.com/lookup?')){songLookupCalls++;assert.deepEqual(options.headers,{Accept:'application/json'});const id=new URL(url).searchParams.get('id');return Response.json({results:[{kind:'song',trackId:Number(id),previewUrl:id==='987654321'?'https://evil.example/audio.mp3':'https://audio-ssl.itunes.apple.com/test.m4a'}]});}if(String(url).startsWith('https://itunes.apple.com/search?')){songSearchCalls++;return Response.json({results:[{kind:'song',trackId:123456789,trackName:testSong.title,artistName:testSong.artist,trackViewUrl:testSong.url,previewUrl:'https://example.com/never-download.mp3',artworkUrl100:'https://example.com/never-download.jpg'}]});}const target=url.startsWith(roots.pncl)?'pncl':'leadspply';return handlers[target](new Request(url,options));}});
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
async function signedWakeup(body,{signature,origin}={}){const raw=JSON.stringify(body);return handlers.pncl(new Request(roots.pncl+'/functions/v1/profile-sync',{method:'POST',headers:{'Content-Type':'application/json','X-Profile-Sync-Kick':signature??createHmac('sha256',key).update(raw).digest('hex'),...(origin?{Origin:origin}:{})},body:raw}));}
const wakeup={action:'sync',userId:users.pncl,issuedAt:Math.floor(Date.now()/1000)};
assert.equal((await signedWakeup(wakeup)).status,202);await drain();ok('signed database wake-up accepted without exposing persistent key');
assert.equal((await signedWakeup({...wakeup,issuedAt:wakeup.issuedAt-301})).status,401);ok('expired database signature rejected');
assert.equal((await signedWakeup(wakeup,{signature:'0'.repeat(64)})).status,401);ok('forged database signature rejected');
assert.equal((await signedWakeup({...wakeup,action:'link'})).status,401);ok('database signatures cannot authorize profile reads or delivery');
assert.equal((await signedWakeup(wakeup,{origin:'https://www.thepncl.com'})).status,401);ok('signed database wake-ups rejected from browser origin');
current=(await call('pncl',{action:'read'})).body;await drain();
const backlog={business_legal_name:'Synthetic Agency',business_ein:'123456789',business_address_city:'Salt Lake City',business_address_state:'UT',business_address_postal:'84101',business_website:'https://example.com/',timezone:'America/Denver',email_from_name:'Synthetic Agent',email_reply_to:'sync@example.com',show_on_leaderboard:true,shirt_size:'M',polo_shirt_size:'L',hoodie_size:'XL',waist_size:'32',shoe_size:'10'};
assert.equal((await call('pncl',{action:'save',request:{id:crypto.randomUUID(),changes:backlog,expected:Object.fromEntries(Object.keys(backlog).map(k=>[k,current.clocks[k]]))}})).status,200);await drain();
remote=(await call('leadspply',{action:'read'})).body;await drain();for(const [field,value]of Object.entries(backlog))assert.equal(remote.values[field],value,field);assert.ok(dispatches>=2);ok('large profile backlog drains through bounded independent jobs');
console.log(`${checks} HTTP/FILE INTEGRATION CHECKS PASSED`);

const songs=await call('pncl',{action:'search_songs',query:'Synthetic Song'});
assert.equal(songs.status,200);assert.deepEqual(songs.body,{songs:[testSong]});
assert.equal((await call('pncl',{action:'search_songs',query:'synthetic song'})).status,200);assert.equal(songSearchCalls,1);
assert.equal((await call('pncl',{action:'search_songs',query:'x'})).status,400);
assert.equal((await call('pncl',{action:'search_songs',query:'Valid query'},{Authorization:'Bearer invalid'})).status,401);
ok('authenticated song metadata search caches results and excludes audio/artwork');
assert.equal((await call('pncl',{action:'song_preview',id:testSong.id},{Authorization:'Bearer invalid'})).status,401);
assert.equal((await call('pncl',{action:'song_preview',id:'https://evil.example/audio.mp3'})).status,400);
assert.deepEqual((await call('pncl',{action:'song_preview',id:testSong.id})).body,{url:'https://audio-ssl.itunes.apple.com/test.m4a'});
assert.equal((await call('pncl',{action:'song_preview',id:testSong.id})).status,200);assert.equal(songLookupCalls,1);
assert.deepEqual((await call('leadspply',{action:'song_preview',id:'987654321'})).body,{url:null});
assert.equal((await call('pncl',{action:'song_preview',id:'987654321'})).status,429);
ok('preview lookup requires auth, validates IDs and Apple hosts, caches metadata, and rate limits');
let songSave={id:crypto.randomUUID(),changes:{close_out_song:testSong},expected:{close_out_song:{pncl:0,leadspply:0}}};
assert.equal((await call('pncl',{action:'save',request:songSave})).status,200);await drain();
remote=(await call('leadspply',{action:'read'})).body;await drain();assert.deepEqual(remote.values.close_out_song,testSong);
const clip={...testSong,clipSource:'apple_preview',previewDurationSeconds:30,clipStartSeconds:12,clipDurationSeconds:10};
assert.equal((await call('pncl',{action:'save',request:{...songSave,id:crypto.randomUUID(),changes:{close_out_song:clip}}})).status,200);await drain();
remote=(await call('leadspply',{action:'read'})).body;await drain();assert.deepEqual(remote.values.close_out_song,clip);
assert.equal((await call('leadspply',{action:'save',request:{...songSave,id:crypto.randomUUID(),changes:{close_out_song:{...clip,clipStartSeconds:8}}}})).status,200);await drain();
remote=(await call('pncl',{action:'read'})).body;await drain();assert.equal(remote.values.close_out_song.clipStartSeconds,8);
assert.equal((await call('pncl',{action:'save',request:{...songSave,id:crypto.randomUUID(),changes:{close_out_song:{...clip,clipStartSeconds:25}}}})).status,400);
ok('ten-second preview selections sync both ways and reject a section beyond the preview');
songSave={id:crypto.randomUUID(),changes:{close_out_song:null},expected:{close_out_song:{pncl:0,leadspply:0}}};
assert.equal((await call('leadspply',{action:'save',request:songSave})).status,200);await drain();
remote=(await call('pncl',{action:'read'})).body;await drain();assert.equal(remote.values.close_out_song,null);
assert.equal((await call('pncl',{action:'save',request:{...songSave,id:crypto.randomUUID(),changes:{close_out_song:{...testSong,url:'javascript:alert(1)'}}}})).status,400);
ok('song choice and removal sync both ways; untrusted links rejected');
console.log(`${checks} TOTAL HTTP/FILE/SONG CHECKS PASSED`);
