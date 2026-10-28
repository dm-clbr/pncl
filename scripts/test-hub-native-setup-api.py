"""Run inside the disposable pncl-hub-auth-test database container only.
Uses local GoTrue + SMTP sink; never reads production credentials or sends mail.
Required files: /tmp/hub-auth-test-secrets.json and /tmp/hub-email-lock.sql.
"""
import base64, hashlib, hmac, json, secrets, subprocess, time, uuid
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

CONFIG = json.loads(Path('/tmp/hub-auth-test-secrets.json').read_text())
BASE = 'http://auth:9999'
DB = 'hub_email_test'
checks = 0

def check(ok, label):
    global checks
    if not ok: raise AssertionError(label)
    checks += 1
    print('PASS', label, flush=True)

def sql(query, reject=False):
    r = subprocess.run(['psql','-U','postgres','-d',DB,'-At','-v','ON_ERROR_STOP=1'], input=query, text=True, capture_output=True)
    if reject:
        return r.returncode != 0
    if r.returncode:
        raise RuntimeError('Local SQL failed: ' + r.stderr[:600])
    return r.stdout.strip()

def enc(value): return base64.urlsafe_b64encode(json.dumps(value,separators=(',',':')).encode()).decode().rstrip('=')
claims = enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'role':'service_role','aud':'authenticated','exp':int(time.time())+3600})
SERVICE = claims+'.'+base64.urlsafe_b64encode(hmac.new(CONFIG['jwt'].encode(),claims.encode(),hashlib.sha256).digest()).decode().rstrip('=')

def api(method, path, body=None, token=SERVICE):
    req=Request(BASE+path, data=json.dumps(body).encode() if body is not None else None,
                headers={'Content-Type':'application/json','Authorization':'Bearer '+token},method=method)
    try:
        with urlopen(req, timeout=15) as r: return r.status,json.loads(r.read() or '{}')
    except HTTPError as e: return e.code,json.loads(e.read() or '{}')


# Minimal app tables with real GoTrue Auth tables. No production project, cron, SMS or external email.
sql("""
create table public.agent_profiles(user_id uuid primary key references auth.users(id),email text,phone text,npn text,first_name text,last_name text,deactivated_at timestamptz,suspended_at timestamptz,license_status text default 'pending',platform_approved_at timestamptz,setter_status text);
grant select,insert,update on public.agent_profiles to authenticated;
create table public.pncl_account_links(pncl_user_id uuid primary key,leadspply_user_id uuid unique references public.agent_profiles(user_id),source_name text,source_email text,source_npn text,sync_status text default 'pending',linked_at timestamptz default now());
create table public.pncl_integration_state(singleton boolean primary key default true, revision bigint default 0);
insert into public.pncl_integration_state values(true,0);
create table public.pncl_portal_events(id uuid primary key default gen_random_uuid(),kind text,source_actor_id uuid,pncl_user_id uuid,leadspply_user_id uuid,created_at timestamptz default now(),details jsonb default '{}');
create function public.test_profile() returns trigger language plpgsql security definer as $$ begin
 insert into public.agent_profiles(user_id,email,npn,first_name,last_name) values(new.id,new.email,new.raw_user_meta_data->>'npn',new.raw_user_meta_data->>'first_name',new.raw_user_meta_data->>'last_name');return new;end $$;
create trigger test_profile after insert on auth.users for each row execute function public.test_profile();
""")
sql(Path('/tmp/hub-email-lock.sql').read_text())
check(True,'both setup migrations install against real GoTrue Auth tables')
hub=str(uuid.uuid4()); uid=str(uuid.uuid4()); other=str(uuid.uuid4())
source={'id':hub,'email':'agent@thepncl.com','email_verified':True,'account_active':True,'npn':'123'}
def rpc(query): return sql('set role service_role; '+query).splitlines()[-1]
def link(h=hub,u=uid,src=source,method='hub_password',reject=False):
 return sql("set role service_role; select public.pncl_setup_link('%s','%s','%s'::jsonb,'%s');"%(h,u,json.dumps(src),method),reject)
status,data=api('POST','/admin/users',{'id':uid,'email':'old@example.com','password':'LocalPassword123!','email_confirm':True,'user_metadata':{'npn':'123'}})
check(status==200 and data['id']==uid,'Auth Admin creates the reserved immutable UUID')
status,session=api('POST','/token?grant_type=password',{'email':'old@example.com','password':'LocalPassword123!'},'')
check(status==200,'existing account credentials authenticate with real GoTrue')
link()
check(sql("select count(*) from public.pncl_account_links where pncl_user_id='%s' and leadspply_user_id='%s'"%(hub,uid))=='1','verified ownership links the existing account')
check(link(other,uid,{**source,'id':other},reject=True),'same LeadSpply account cannot be linked to another Hub account')
check(link(src={**source,'npn':'999'},reject=True),'conflicting NPN is sent for review')
check(sql("set role authenticated;select public.pncl_setup_link('%s','%s','%s','hub_password')"%(hub,uid,json.dumps(source)),True),'browser role cannot manufacture ownership proof')
check(sql("set role authenticated;select * from private.pncl_setup_registrations",True),'browser role cannot read phone proofs or registration state')
status,_=api('PUT','/user',{'email':'other@thepncl.com'},session['access_token'])
check(status>=400,'direct Auth API cannot change the linked login email')
check(sql("select coalesce(email_change,'')='' from auth.users where id='%s'"%uid)=='t','blocked Auth API leaves no pending email change')
check(sql("update auth.identities set identity_data=jsonb_set(identity_data,'{email}','\"other@thepncl.com\"') where user_id='%s'"%uid,True),'identity/provider email cannot bypass the Auth lock')
prepared=json.loads(rpc("select public.prepare_pncl_hub_email('%s','agent@thepncl.com');"%hub))
check(prepared['userId']==uid,'migration permit binds the same LeadSpply UUID')
status,data=api('PUT','/admin/users/'+uid,{'email':'agent@thepncl.com','email_confirm':True})
check(status==200 and data['id']==uid and data['email']=='agent@thepncl.com','approved admin Auth API updates email and preserves the account ID')
check(sql("select email from public.agent_profiles where user_id='%s'"%uid)=='agent@thepncl.com','profile projection follows the authoritative Auth update')
status,newsession=api('POST','/token?grant_type=password',{'email':'agent@thepncl.com','password':'LocalPassword123!'},'')
check(status==200,'same password signs in using the new Hub email')
status,_=api('POST','/token?grant_type=password',{'email':'old@example.com','password':'LocalPassword123!'},'')
check(status==400,'old email no longer authenticates')
status,_=api('PUT','/admin/users/'+uid,{'email':'another@thepncl.com','email_confirm':True})
check(status>=400,'consumed permit cannot authorize another change')
check(rpc("select public.pncl_setup_limit('test',2,600)")=='t','first bounded attempt allowed')
check(rpc("select public.pncl_setup_limit('test',2,600)")=='t','second bounded attempt allowed')
check(rpc("select public.pncl_setup_limit('test',2,600)")=='f','third attempt throttled durably')
newhub=str(uuid.uuid4())
def reserve(action='reserve',email='new@thepncl.com',phone='+12025550123',npn='456',reject=False):
 return sql("set role service_role;select public.pncl_setup_registration('%s','%s','%s','%s','%s')"%(newhub,email,action,phone,npn),reject)
check(reserve(reject=True),'new registration requires server-recorded phone verification')
newid=reserve('phone_verified').splitlines()[-1]
check(reserve().splitlines()[-1]==newid and reserve().splitlines()[-1]==newid,'registration retries reserve one immutable UUID')
racing_hub=str(uuid.uuid4())
sql("select public.pncl_setup_registration('%s','race@thepncl.com','phone_verified','+12025550123',null)"%racing_hub)
check(sql("select public.pncl_setup_registration('%s','race@thepncl.com','reserve','+12025550123','999')"%racing_hub,True),'concurrent registration claims cannot reserve the same phone before Auth creation')
sql("select public.pncl_setup_registration('%s','race@thepncl.com','phone_verified','+12025550124',null)"%racing_hub)
check(sql("select public.pncl_setup_registration('%s','race@thepncl.com','reserve','+12025550124','000456')"%racing_hub,True),'concurrent registration claims cannot reserve the same normalized NPN')

sql("update public.agent_profiles set phone='+12025550123' where user_id='%s'"%uid)
check(reserve(reject=True),'an existing phone number prevents duplicate account creation')
sql("update public.agent_profiles set phone=null where user_id='%s'"%uid)
check(reserve(email='agent@thepncl.com',reject=True),'reservation cannot be redirected to another email')
check(reserve(phone='+12025550124',reject=True),'phone proof is bound to the exact verified number')
sql("update private.pncl_setup_registrations set phone_verified_until=now()-interval '1 second' where hub_id='%s'"%newhub)
check(reserve(reject=True),'expired phone proof blocks account creation')
reserve('phone_verified')
status,data=api('POST','/admin/users',{'id':newid,'email':'new@thepncl.com','password':'LocalPassword123!','email_confirm':True,'app_metadata':{'pncl_hub_id':newhub},'user_metadata':{'npn':'456'}})
check(status==200 and data['email_confirmed_at'],'new account uses Hub-verified email without sending a confirmation email')
link(newhub,newid,{'id':newhub,'email':'new@thepncl.com','email_verified':True,'account_active':True,'npn':'456'},'hub_registration')
check(sql("select platform_approved_at is null and license_status='pending' from public.agent_profiles where user_id='%s'"%newid)=='t','new account remains pending approval')
check(sql("select count(*) from public.pncl_account_links where pncl_user_id='%s' and leadspply_user_id='%s'"%(newhub,newid))=='1','new account is linked inside the same setup flow')
self_claim="set role authenticated; select set_config('request.jwt.claim.sub','%s',false);"%newid
check(sql(self_claim+"update public.agent_profiles set platform_approved_at=now() where user_id='%s'"%newid,True),'profile API role cannot self-approve a PNCL account')
check(sql(self_claim+"update public.agent_profiles set setter_status='approved' where user_id='%s'"%newid,True),'profile API role cannot self-approve setter status')
check(sql(self_claim+"update public.agent_profiles set first_name='Updated' where user_id='%s'"%newid) is not None,'ordinary profile edits remain allowed')
sql("update public.agent_profiles set platform_approved_at=now() where user_id='%s'"%newid)
check(sql("select platform_approved_at is not null from public.agent_profiles where user_id='%s'"%newid)=='t','trusted server approval remains available')

# Prove the password login response includes verified MFA factors used by the service gate.
status,factor=api('POST','/factors',{'factor_type':'totp','friendly_name':'Local test'},newsession['access_token'])
check(status==200,'local MFA enrollment is available')
secret=base64.b32decode(factor['totp']['secret'].upper()+'='*((8-len(factor['totp']['secret'])%8)%8))
counter=(int(time.time())//30).to_bytes(8,'big'); digest=hmac.new(secret,counter,hashlib.sha1).digest(); offset=digest[-1]&15
code=str((int.from_bytes(digest[offset:offset+4],'big')&0x7fffffff)%1000000).zfill(6)
status,challenge=api('POST','/factors/'+factor['id']+'/challenge',{},newsession['access_token'])
status,verified=api('POST','/factors/'+factor['id']+'/verify',{'challenge_id':challenge['id'],'code':code},newsession['access_token'])
check(status==200,'local authenticator challenge verifies successfully')
status,login=api('POST','/token?grant_type=password',{'email':'agent@thepncl.com','password':'LocalPassword123!'},'')
check(status==200 and any(f['status']=='verified' and f['factor_type']=='totp' for f in login['user']['factors']),'real password login exposes verified factors so setup cannot skip MFA')
print('Completed %s isolated GoTrue/database checks.'%checks)
