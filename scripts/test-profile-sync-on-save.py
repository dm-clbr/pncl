"""Exercise save-triggered dispatch against a disposable local PostgreSQL database.

Requires a test server on 127.0.0.1:55447 (override PROFILE_SYNC_TEST_PORT).
Never reads production credentials or connects to a remote database.
"""
from pathlib import Path
import os, json, uuid, re

root = Path(__file__).resolve().parents[1]
os.environ['PNCL_SYNC_REPO'] = str(root)
os.environ.setdefault('PROFILE_SYNC_TEST_PORT', '55447')
setup = (root/'scripts/test-production-profile-sync.py').read_text().split('a=str(uuid.uuid4())')[0]
setup = re.sub(r"roots=\{[^\n]+", "roots={'pncl':Path(os.environ['PNCL_SYNC_REPO'])}", setup)
setup = setup.replace("db='mirror_'+system", "db='profile_save_only_test'")
exec(setup)
db = 'profile_save_only_test'
sql(db, """
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema cron;
create table cron.job(jobid bigint primary key,command text,active boolean);
insert into cron.job values(1,'select profile_sync_private.kick();',true),(2,'select 1;',true);
create function cron.alter_job(job_id bigint,active boolean) returns void language sql as
$$update cron.job j set active=$2 where j.jobid=$1$$;
create table net.sent(id bigserial,payload jsonb);
create or replace function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int)
returns bigint language sql as $$insert into net.sent(payload) values(body) returning id$$;
""")
sql(db, next(root.glob('supabase/migrations/*_profile_sync_on_save.sql')).read_text())
sql(db, "update profile_sync_private.settings set enabled=true,secret='local-test-only';")
assert sql(db, "select active from cron.job where jobid=1") == 'f'
assert sql(db, "select active from cron.job where jobid=2") == 't'
print('PASS only the recurring profile sync job is disabled')

def new_user():
    user = str(uuid.uuid4())
    # Existing unsynced profiles must be displayable without requesting sync.
    sql(db, f"""alter table portal_profiles disable trigger profile_sync_capture;
    insert into auth.users(id,email) values('{user}','synthetic@thepncl.com');
    insert into portal_profiles(user_id,first_name,last_name) values('{user}','Synthetic','Agent');
    alter table portal_profiles enable trigger profile_sync_capture;""")
    rpc(db,'read',user)
    return user

def save(user, changes):
    return rpc(db,'save',user,{'id':str(uuid.uuid4()),'changes':changes,'expected':{}})

def sent():
    return int(sql(db,'select count(*) from net.sent'))

user = new_user()
for _ in range(3): rpc(db,'read',user)
rpc(db,'dispatch',user)
sql(db,'select profile_sync_private.kick()')
assert sent() == 0 and rpc(db,'tick_users') == [] and rpc(db,'ready_users') == []
assert rpc(db,'claim',user) is None
print('PASS display reads, legacy ticks, and unsolicited wakes never sync')

save(user, {'first_name':'Saved'})
assert sent() == 1
assert json.loads(sql(db,'select payload from net.sent limit 1'))['action'] == 'sync'
token = rpc(db,'claim',user)
assert token and rpc(db,'claim',user) is None
save(user, {'last_name':'While busy'})
assert sent() == 1
events = rpc(db,'outbox',user)
assert any(e['value']=='While busy' for e in events)
rpc(db,'ack',user,{'receipts':[{'id':e['id'],'outcome':'applied'} for e in events[:1]]})
assert rpc(db,'finish',user,{'token':token,'error':None}) is True
rpc(db,'dispatch',user)
assert sent() == 2
print('PASS a committed save wakes once, and saves during delivery remain queued')

token = rpc(db,'claim',user)
events = rpc(db,'outbox',user)
for event in events: rpc(db,'fail',user,{'id':event['id'],'error':'test_peer_unavailable'})
assert rpc(db,'finish',user,{'token':token,'error':None}) is False
before = sent()
for _ in range(3):
    rpc(db,'read',user)
    rpc(db,'dispatch',user)
assert sent() == before and rpc(db,'ready_users') == []
assert int(sql(db,"select count(*) from profile_sync_private.outbox where status='error'")) > 0
save(user, {'first_name':'Retry after saving'})
assert sent() == before+1
assert int(sql(db,"select count(*) from profile_sync_private.outbox where status='error'")) == 0
print('PASS failed events persist without retries until the next explicit save')

# Five simultaneous saved profiles must not strand the fifth when the cap is four.
sql(db,"update profile_sync_private.outbox set status='delivered'; update profile_sync_private.accounts set sync_requested=false,lease_token=null,lease_until='-infinity';")
users = [new_user() for _ in range(5)]
tokens = []
for i, uid in enumerate(users):
    save(uid, {'first_name':f'Saved {i}'})
    tokens.append(rpc(db,'claim',uid))
assert all(tokens[:4]) and tokens[4] is None
assert rpc(db,'ready_users') == []
events = rpc(db,'outbox',users[0])
rpc(db,'ack',users[0],{'receipts':[{'id':e['id'],'outcome':'applied'} for e in events]})
rpc(db,'finish',users[0],{'token':tokens[0],'error':None})
assert users[4] in rpc(db,'ready_users')
before = sent()
rpc(db,'dispatch',users[4])
assert sent() == before+1 and rpc(db,'claim',users[4])
print('PASS worker completion can wake the fifth save without a periodic scheduler')

assert sql(db,"select has_function_privilege('anon','public.profile_sync(text,uuid,jsonb)','execute')") == 'f'
assert sql(db,"select has_function_privilege('authenticated','profile_sync_private.wake(uuid)','execute')") == 'f'
assert sql(db,"select has_function_privilege('service_role','public.profile_sync(text,uuid,jsonb)','execute')") == 't'
print('PASS sync functions remain restricted to the backend service role')
print('ALL SAVE-ONLY DATABASE CHECKS PASSED')
