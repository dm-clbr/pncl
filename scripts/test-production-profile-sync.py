from pathlib import Path
import subprocess,json,uuid,os
PSQL=os.environ.get('PSQL','psql')
TEST_ROOT=Path(os.environ.get('PROFILE_SYNC_TEST_ROOT','/tmp/profile-sync-test'))
TEST_ROOT.mkdir(exist_ok=True)
base=[PSQL,'-h','127.0.0.1','-p',os.environ.get('PROFILE_SYNC_TEST_PORT','55439'),'-U','postgres','-v','ON_ERROR_STOP=1','-At']
def sql(db,q):
 p=subprocess.run(base+['-d',db,'-c',q],text=True,capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr)
 return p.stdout.strip()
def literal(x):return "'"+json.dumps(x).replace("'","''")+"'::jsonb"
def rpc(db,action,user=None,body={}):
 s=sql(db,"select public.profile_sync('%s',%s,%s)"%(action,"'%s'::uuid"%user if user else 'null',literal(body)))
 return json.loads(s) if s else None
roots={'pncl':Path(os.environ['PNCL_SYNC_REPO']),'leadspply':Path(os.environ['LEADSPPLY_SYNC_REPO'])}
fields=[('first_name', 'first_name', 'first_name', 'name'), ('last_name', 'last_name', 'last_name', 'name'), ('phone', 'phone_number', 'phone', 'phone'), ('profile_photo', 'profile_photo_path', 'avatar_url', 'asset'), ('home_address_line1', 'address_line1', None, 'text'), ('home_address_city', 'address_city', None, 'text'), ('home_address_state', 'address_state', None, 'state'), ('home_address_zip', 'address_zip', None, 'zip'), ('home_county', 'county', None, 'text'), ('shirt_size', 'shirt_size', None, 'size'), ('polo_shirt_size', 'polo_shirt_size', None, 'size'), ('hoodie_size', 'hoodie_size', None, 'size'), ('waist_size', 'waist_size', None, 'size'), ('shoe_size', 'shoe_size', None, 'size'), ('business_legal_name', None, 'business_legal_name', 'text'), ('business_ein', None, 'business_ein', 'ein'), ('business_address_line1', None, 'business_address_line1', 'text'), ('business_address_city', None, 'business_address_city', 'text'), ('business_address_state', None, 'business_address_state', 'state'), ('business_address_postal', None, 'business_address_postal', 'zip'), ('business_website', None, 'business_website', 'url'), ('timezone', None, 'timezone', 'timezone'), ('npn', 'npn', 'npn', 'npn'), ('state_license_numbers', 'state_license_numbers', None, 'licenses'), ('eo_policy_number', 'eo_policy_number', None, 'text'), ('eo_certificate', 'eo_certificate_path', None, 'asset'), ('drivers_license', 'drivers_license_path', None, 'asset'), ('email_from_name', None, 'email_from_name', 'text'), ('email_reply_to', None, 'email_reply_to', 'email'), ('show_on_leaderboard', None, 'show_on_leaderboard', 'boolean')]
for role in ['anon','authenticated','service_role']:
 if not sql('postgres',"select 1 from pg_roles where rolname='%s'"%role):sql('postgres','create role '+role+(' bypassrls' if role=='service_role' else ''))
for system,root in roots.items():
 db='mirror_'+system
 sql('postgres','drop database if exists '+db+' with (force)');sql('postgres','create database '+db)
 native='portal_profiles' if system=='pncl' else 'agent_profiles'
 columns=['user_id uuid primary key references auth.users(id) on delete cascade','updated_at timestamptz default now()']
 for key,pn,ld,kind in fields:
  column=pn if system=='pncl' else ld
  if column:columns.append(column+' '+('jsonb' if kind=='licenses' else 'boolean' if kind=='boolean' else 'text'))
 columns+=['state_licenses text[]'] if system=='pncl' else ['licensed_states text[]','deactivated_at timestamptz','suspended_at timestamptz',"license_status text default 'active'"]
 stub="""create schema auth;create schema storage;create schema net;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),banned_until timestamptz,deleted_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.objects(bucket_id text,name text,updated_at timestamptz default now());
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language sql as $$select 1::bigint$$;
 create table public."""+native+'('+','.join(columns)+');'
 if system=='pncl':stub+="alter table portal_profiles add constraint portal_profiles_phone_number_valid check(phone_number is null or (phone_number ~ '^[0-9]{3}-[0-9]{3}-[0-9]{4}$' and phone_number<>'000-000-0000'));"+'create table public.portal_profile_documents(id uuid primary key default gen_random_uuid(),user_id uuid references public.portal_profiles(user_id),label text,file_path text,mime_type text,size_bytes bigint,created_at timestamptz default now());'
 else:
  stub+='create table public.pncl_account_links(pncl_user_id uuid primary key,leadspply_user_id uuid unique); create table public.admin_audit_log(admin_user_id uuid,action text,target_type text,target_id text,details jsonb);'
  npn=(root/'supabase/migrations/20260824050000_npn_is_an_identity_not_a_field.sql').read_text();start=npn.index('CREATE OR REPLACE FUNCTION public.set_my_npn(');end=npn.index('END $$;',start)+len('END $$;');stub+=npn[start:end]
 sql(db,stub)
 migration=next(root.glob('supabase/migrations/*_production_profile_sync.sql')).read_text()
 sql(db,'\n'.join(line for line in migration.splitlines() if not line.startswith('create extension')))
 if system=='pncl':
  for fix in root.glob('supabase/migrations/*_profile_sync_native_phone_format.sql'):sql(db,fix.read_text())
 for fix in root.glob('supabase/migrations/*_profile_sync_bounded_workers.sql'):sql(db,fix.read_text())
 print(system,'migration compiled')
a=str(uuid.uuid4());b=str(uuid.uuid4());pair={'pncl':a,'leadspply':b}
for system,user in pair.items():
 db='mirror_'+system;native='portal_profiles' if system=='pncl' else 'agent_profiles';phone='phone_number' if system=='pncl' else 'phone'
 sql(db,f"insert into auth.users(id,email) values('{user}','sync-test@thepncl.com'); insert into public.{native}(user_id,first_name,last_name,{phone},npn) values('{user}','Test','Agent','801-555-0147','12345678');")
sql('mirror_leadspply',f"insert into pncl_account_links values('{a}','{b}')")
for system,user in pair.items():rpc('mirror_'+system,'bind',user,{'peer':pair['leadspply' if system=='pncl' else 'pncl']})
def events(system):return rpc('mirror_'+system,'outbox',pair[system])
def deliver(system,e):
 other='leadspply' if system=='pncl' else 'pncl';e={k:e[k] for k in ['id','user_id','field','value','clock','baseline']};e['source']=system;e['file']=None
 r=rpc('mirror_'+other,'receive',pair[other],{'events':[e]});rpc('mirror_'+system,'ack',pair[system],{'receipts':r});return r
for system in pair:
 for e in events(system):deliver(system,e)
def view(system):return {f['field']:f for f in rpc('mirror_'+system,'read',pair[system])['fields']}
assert view('pncl')['phone']['clock']=={'pncl':1,'leadspply':1}
print('PASS baseline normalization and clock convergence')
sql('mirror_pncl',f"update portal_profiles set phone_number='801-555-0150' where user_id='{a}'")
e=next(x for x in events('pncl') if x['field']=='phone');r=deliver('pncl',e);assert r[0]['outcome']=='applied';assert view('leadspply')['phone']['value']=='+18015550150'
assert deliver('pncl',e)==r
print('PASS native capture, inbound projection, receipt replay')
sql('mirror_leadspply',f"update agent_profiles set phone='+18015550151' where user_id='{b}'")
for e in events('leadspply'):deliver('leadspply',e)
assert sql('mirror_pncl',f"select phone_number from portal_profiles where user_id='{a}'")=='801-555-0151'
assert view('pncl')['phone']['value']=='+18015550151'
print('PASS canonical phone retains native PNCL format and constraint')
sql('mirror_pncl',f"update portal_profiles set first_name='PNCL' where user_id='{a}'")
sql('mirror_leadspply',f"update agent_profiles set first_name='Lead' where user_id='{b}'")
for system in pair:
 for e in events(system):deliver(system,e)
assert all(view(s)['first_name']['conflict'] for s in pair)
v=view('pncl')['first_name'];request={'id':str(uuid.uuid4()),'changes':{'first_name':'Resolved'},'expected':{'first_name':v['clock']},'resolve':['first_name']}
assert rpc('mirror_pncl','save',a,request)['outcome']=='saved'
for e in events('pncl'):deliver('pncl',e)
assert view('leadspply')['first_name']['value']=='Resolved' and view('leadspply')['first_name']['conflict'] is None
assert rpc('mirror_pncl','save',a,request)['outcome']=='saved'
print('PASS concurrent conflict, explicit resolution, lost-response replay')
request['changes']['first_name']='Reused'
try:rpc('mirror_pncl','save',a,request);raise AssertionError('reused accepted')
except RuntimeError as e:assert 'request_id_reused' in str(e)
stale={'id':str(uuid.uuid4()),'changes':{'first_name':'Stale'},'expected':{'first_name':{'pncl':0,'leadspply':0}}}
assert rpc('mirror_pncl','save',a,stale)['outcome']=='conflict'
print('PASS stale saves and changed idempotency payload rejected')
request={'id':str(uuid.uuid4()),'changes':{'business_ein':'123456789','state_license_numbers':{'UT':'A123'}},'expected':{k:view('pncl')[k]['clock'] for k in ['business_ein','state_license_numbers']}}
assert rpc('mirror_pncl','save',a,request)['outcome']=='saved'
for e in events('pncl'):deliver('pncl',e)
assert sql('mirror_leadspply',f"select business_ein from agent_profiles where user_id='{b}'")=='123456789'
assert sql('mirror_leadspply',f"select licensed_states from agent_profiles where user_id='{b}'")=='{UT}'
print('PASS private counterpart writes and licensed-state projection')
request={'id':str(uuid.uuid4()),'changes':{'npn':'98765432'},'expected':{'npn':view('pncl')['npn']['clock']}}
rpc('mirror_pncl','save',a,request)
for e in events('pncl'):deliver('pncl',e)
assert sql('mirror_leadspply',f"select npn from agent_profiles where user_id='{b}'")=='98765432'
assert sql('mirror_leadspply',f"select count(*) from admin_audit_log where action='agent.npn_set_self' and admin_user_id='{b}'")=='1'
print('PASS incoming NPN uses validated audit-producing RPC')
for system in pair:
 for query in ["select public.profile_sync('config')","select * from profile_sync_private.fields"]:
  try:sql('mirror_'+system,'set role authenticated;'+query);raise AssertionError('public access')
  except RuntimeError as e:assert 'permission denied' in str(e)
print('PASS authenticated role cannot read sync internals or call service RPC')
print('DATABASE TESTS PASSED')
(TEST_ROOT/'identities.json').write_text(json.dumps(pair))

# Retry backoff is durable, bounded, and does not replace event IDs.
sql('mirror_pncl',f"update portal_profiles set phone_number='801-555-0160' where user_id='{a}'")
e=next(x for x in events('pncl') if x['field']=='phone')
for _ in range(10):rpc('mirror_pncl','fail',a,{'id':e['id'],'error':'synthetic_outage'})
assert sql('mirror_pncl',f"select status from profile_sync_private.outbox where id='{e['id']}'")=='error'
rpc('mirror_pncl','retry',a)
assert any(x['id']==e['id'] for x in events('pncl'))
print('PASS durable retry exhaustion and manual retry retain event identity')
# A photo replaced through an old fixed path still emits a new event.
path=a+'/avatar.png'
sql('mirror_pncl',f"insert into storage.objects(bucket_id,name) values('portal-profile-photos','{path}'); update portal_profiles set profile_photo_path='{path}' where user_id='{a}'")
before=view('pncl')['profile_photo']['clock']['pncl']
sql('mirror_pncl',f"update storage.objects set updated_at=now()+interval '1 second' where name='{path}'")
assert view('pncl')['profile_photo']['clock']['pncl']==before+1
sql('mirror_pncl',f"update portal_profiles set profile_photo_path=null where user_id='{a}'")
print('PASS fixed-path photo replacement is detected')
# Two actual database sessions retrying the same operation produce one event.
request={'id':str(uuid.uuid4()),'changes':{'eo_policy_number':'synthetic-concurrent'},'expected':{'eo_policy_number':view('pncl')['eo_policy_number']['clock']}}
q="select public.profile_sync('save','%s',%s)"%(a,literal(request))
processes=[subprocess.Popen(base+['-d','mirror_pncl','-c',q],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for _ in range(2)]
results=[p.communicate() for p in processes]
assert all(p.returncode==0 for p in processes),results
assert results[0][0]==results[1][0]
assert sql('mirror_pncl',f"select count(*) from profile_sync_private.outbox where user_id='{a}' and field='eo_policy_number' and value='\"synthetic-concurrent\"'::jsonb")=='1'
print('PASS concurrent database sessions share one durable save receipt')
