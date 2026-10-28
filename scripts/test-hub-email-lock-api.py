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

def create(email, role='agent'):
    pw=secrets.token_urlsafe(32)
    status,data=api('POST','/admin/users',{'email':email,'password':pw,'email_confirm':True,'app_metadata':{'role':role}})
    assert status==200, 'Synthetic user creation failed: HTTP '+str(status)
    status,session=api('POST','/token?grant_type=password',{'email':email,'password':pw})
    assert status==200, 'Synthetic login failed: HTTP '+str(status)
    return data['id'], session['access_token']

def prepare(actor, target, previous, email, reject=False):
    query="begin; set local role authenticated; select set_config('request.jwt.claim.sub','%s',true); select public.prepare_hub_work_email_change('%s','%s','%s'); commit;"%(actor,target,previous,email)
    return sql(query,reject)

def current(uid): return api('GET','/admin/users/'+uid)[1]['email']

# Empty disposable database: application schema fixture, real GoTrue Auth tables.
sql("""create or replace function auth.uid() returns uuid language sql stable as
$$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
create table public.onboarding_records(id uuid primary key, supabase_user_id text, workspace_email text, released_at timestamptz);
""")
admin,admin_token=create('lock-admin@thepncl.com','admin')
agent,agent_token=create('lock-agent@thepncl.com')
other,other_token=create('lock-other@thepncl.com')
legacy,legacy_token=create('lock-legacy@thepncl.com')
# Generate pending confirmation tokens before installing the restriction.
status,_=api('PUT','/user',{'email':'lock-legacy-new@thepncl.com'},legacy_token)
assert status==200, 'Legacy pending email-change fixture failed'
old_tokens=json.loads(sql("select json_build_array(email_change_token_current,email_change_token_new) from auth.users where id='%s';"%legacy))
assert len(set(old_tokens))==2 and all(old_tokens), 'Legacy confirmation tokens must be distinct'
check(sql("select email_change='lock-legacy-new@thepncl.com' from auth.users where id='%s';"%legacy)=='t','legacy confirmation fixture has a pending email before the lock')
onboarding=str(uuid.uuid4())
sql("insert into public.onboarding_records values('%s','%s','lock-agent@thepncl.com',null);"%(onboarding,agent))
sql(Path('/tmp/hub-email-lock.sql').read_text())
check(True,'migration installs against real GoTrue Auth tables')

for email in ['lock-self@thepncl.com','lock-self@example.com']:
    status,data=api('PUT','/user',{'email':email},agent_token)
    check(status==500 and data.get('error_code')=='unexpected_failure' and current(agent)=='lock-agent@thepncl.com','direct authenticated email request rejected: '+email.split('@')[1])
    check(sql("select coalesce(email_change,'')='' from auth.users where id='%s';"%agent)=='t','rejected API request leaves no pending change')
    time.sleep(1.05)
status,_=api('PUT','/user',{'data':{'role':'admin','email':'lock-admin@thepncl.com','full_name':'Synthetic Agent'}},agent_token)
check(status==200 and current(agent)=='lock-agent@thepncl.com','ordinary metadata updates work and cannot redefine login email')
check(prepare(agent,agent,'lock-agent@thepncl.com','lock-admin-new@thepncl.com',True),'forged user_metadata role cannot authorize a rename')
for token in old_tokens:
    status,_=api('POST','/verify',{'type':'email_change','token_hash':token},'')
check(status==500,'final pre-lock confirmation cannot commit the email change')
check(current(legacy)=='lock-legacy@thepncl.com','pre-lock confirmation links cannot complete an email change')

status,_=api('PUT','/admin/users/'+agent,{'email':'lock-bypass@thepncl.com','email_confirm':True})
check(status>=400 and current(agent)=='lock-agent@thepncl.com','Auth Admin also needs an exact approved permit')
check(prepare(admin,agent,'wrong@thepncl.com','lock-new@thepncl.com',True),'stale expected email is rejected')
check(prepare(admin,agent,'lock-agent@thepncl.com','lock-other@thepncl.com',True),'duplicate destination is rejected')
check(prepare(admin,agent,'lock-agent@thepncl.com','bad@thepncl.com.evil.test',True),'lookalike destination is rejected')
prepare(admin,agent,'lock-agent@thepncl.com','lock-new@thepncl.com')
check(prepare(admin,agent,'lock-agent@thepncl.com','lock-new@thepncl.com',True),'per-account rename cooldown enforced')
sql("update hub_auth_private.email_change_permits set expires_at=now()-interval '1 second' where user_id='%s';"%agent)
status,_=api('PUT','/admin/users/'+agent,{'email':'lock-new@thepncl.com','email_confirm':True})
check(status>=400 and current(agent)=='lock-agent@thepncl.com','expired permits cannot authorize Auth Admin')
sql("update hub_auth_private.email_change_permits set expires_at=now()+interval '1 minute' where user_id='%s';"%agent)
sql("update auth.users set raw_app_meta_data=jsonb_set(raw_app_meta_data,'{role}','\"agent\"') where id='%s';"%admin)
status,_=api('PUT','/admin/users/'+agent,{'email':'lock-new@thepncl.com','email_confirm':True})
check(status>=400,'role revocation invalidates an outstanding permit')
sql("update auth.users set raw_app_meta_data=jsonb_set(raw_app_meta_data,'{role}','\"admin\"') where id='%s';"%admin)
# A stale onboarding row aborts the entire Auth transaction, including its identity update.
sql("update public.onboarding_records set workspace_email='stale@thepncl.com' where id='%s';"%onboarding)
status,_=api('PUT','/admin/users/'+agent,{'email':'lock-new@thepncl.com','email_confirm':True})
check(status==500 and current(agent)=='lock-agent@thepncl.com','stale onboarding rejects and rolls back the Auth rename')
check(sql("select identity_data->>'email' from auth.identities where user_id='%s' and provider='email';"%agent)=='lock-agent@thepncl.com','failed rename rolls back its identity update')
sql("update public.onboarding_records set workspace_email='lock-agent@thepncl.com' where id='%s';"%onboarding)
status,data=api('PUT','/admin/users/'+agent,{'email':'lock-new@thepncl.com','email_confirm':True})
check(status==200 and data.get('id')==agent and current(agent)=='lock-new@thepncl.com','approved admin rename succeeds without replacing the user')
check(sql("select workspace_email from public.onboarding_records where id='%s';"%onboarding)=='lock-new@thepncl.com','onboarding work email updates atomically with Auth')
check(sql("select count(*) from hub_auth_private.email_change_audit where user_id='%s';"%agent)=='1','one successful rename audit; failed attempts leave no success audit')
check(sql("select consumed_at is not null from hub_auth_private.email_change_permits where user_id='%s';"%agent)=='t','permit is consumed on completion')
status,_=api('PUT','/user',{'email':'lock-again@thepncl.com'},agent_token)
check(status>=400 and current(agent)=='lock-new@thepncl.com','self-service remains locked after an admin rename')

# Exercise the identity changes made by Google/OAuth without contacting Google.
identity=str(uuid.uuid4())
sql("insert into auth.identities(id,user_id,provider,provider_id,identity_data) values('%s','%s','google','synthetic-google-sub','{\"email\":\"lock-new@thepncl.com\",\"sub\":\"synthetic-google-sub\"}');"%(identity,agent))
check(sql("update auth.identities set identity_data=jsonb_set(identity_data,'{email}','\"lock-other@thepncl.com\"') where id='%s';"%identity,True),'Google identity cannot introduce another work email')
check(sql("update auth.identities set user_id='%s' where id='%s';"%(other,identity),True),'identity cannot be reassigned to another user')
sql("update auth.identities set identity_data=jsonb_set(identity_data,'{name}','\"Updated name\"') where id='%s';"%identity)
check(True,'same-email OAuth metadata refresh remains allowed')
for query in ['select * from hub_auth_private.email_change_permits','select * from hub_auth_private.email_change_audit']:
    check(sql('set role authenticated; '+query,True),'browser role cannot read private authorization data')
check(sql("set role anon; select public.prepare_hub_work_email_change('%s','lock-new@thepncl.com','lock-unauthed@thepncl.com');"%agent,True),'anonymous API role cannot request a rename permit')
status,_=api('DELETE','/admin/users/'+other)
check(status==200,'approved hard account deletion remains available')
check(sql("select count(*) from auth.users;")=='3','renames preserve IDs and only the explicit deletion removes an account')
print('%s isolated Auth API/database checks passed; mail stayed in local sink'%checks,flush=True)
