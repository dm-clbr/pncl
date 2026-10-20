from pathlib import Path
import os,json,uuid,subprocess,time
source=Path(os.environ['PNCL_SYNC_REPO'])/'scripts/test-production-profile-sync.py'
exec(source.read_text().split('for role in')[0])
pair=json.loads((TEST_ROOT/'identities.json').read_text())
for system,user in pair.items():
 db='mirror_'+system
 # Finish any unrelated synthetic backlog before checking idle admission.
 sql(db,"update profile_sync_private.outbox set status='delivered' where status='pending'; update profile_sync_private.accounts set lease_token=null,lease_until='-infinity',sync_after='-infinity',dispatch_after='-infinity',sync_failures=0,last_error=null;")
 assert rpc(db,'tick_users')==[]
 assert rpc(db,'claim',user) is None
 print('PASS',system,'idle accounts never enter scheduler or worker')
 native='portal_profiles' if system=='pncl' else 'agent_profiles'
 # Refresh is not blocked behind a locked native row.
 lock=subprocess.Popen(base+['-d',db,'-c',f"begin;select 1 from {native} where user_id='{user}' for update;select pg_sleep(1.5);rollback"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 time.sleep(.25)
 sql(db,f"set statement_timeout='300ms';select public.profile_sync('read','{user}')")
 lock.communicate();assert lock.returncode==0
 print('PASS',system,'initialized profile reads avoid native write locks')
 sql(db,f"update {native} set first_name='Queued load {uuid.uuid4()}' where user_id='{user}'")
 assert user in rpc(db,'tick_users') or sql(db,f"select dispatch_after>now() from profile_sync_private.accounts where user_id='{user}'")=='t'
 # Simultaneous sessions must share one account lease.
 q=f"select public.profile_sync('claim','{user}')"
 ps=[subprocess.Popen(base+['-d',db,'-c',q],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for _ in range(16)]
 outputs=[p.communicate() for p in ps];assert all(p.returncode==0 for p in ps),outputs
 tokens=[json.loads(out.strip()) for out,err in outputs if out.strip() and out.strip()!='null']
 assert len(tokens)==1,tokens
 token=tokens[0]
 assert rpc(db,'finish',user,{'token':str(uuid.uuid4()),'error':None}) is False
 assert rpc(db,'claim',user) is None
 # Recover a crashed worker, then reject completion from its old token.
 sql(db,f"update profile_sync_private.accounts set lease_until=now()-interval '1 second' where user_id='{user}'")
 replacement=rpc(db,'claim',user);assert replacement and replacement!=token
 assert rpc(db,'finish',user,{'token':token,'error':None}) is False
 assert rpc(db,'claim',user) is None
 rpc(db,'finish',user,{'token':replacement,'error':'not_linked'})
 assert rpc(db,'claim',user) is None and user not in rpc(db,'tick_users')
 assert sql(db,f"select sync_failures=1 and sync_after>now() from profile_sync_private.accounts where user_id='{user}'")=='t'
 print('PASS',system,'concurrent lease, crash recovery, stale finish, durable account backoff')
 # Saturate project-wide admission with distinct accounts.
 test_users=[]
 for i in range(8):
  u=str(uuid.uuid4());test_users.append(u)
  sql(db,f"insert into auth.users(id,email) values('{u}','load-{i}@thepncl.com');insert into {native}(user_id,first_name) values('{u}','Load');")
  if system=='leadspply':sql(db,f"insert into pncl_account_links values('{uuid.uuid4()}','{u}')")
 # Keep admission transactions open so a missing global lock would oversubscribe.
 ps=[subprocess.Popen(base+['-d',db,'-c',f"with acquired as materialized (select public.profile_sync('claim','{u}') token), paused as materialized (select pg_sleep(0.5) from acquired) select token from acquired,paused"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for u in test_users]
 outputs=[p.communicate() for p in ps];assert all(p.returncode==0 for p in ps),outputs
 claims=[json.loads(out.strip()) if out.strip() else None for out,err in outputs]
 assert 1<=sum(t is not None for t in claims)<=4,claims
 claims=[t or rpc(db,'claim',u) for u,t in zip(test_users,claims)]
 assert sum(t is not None for t in claims)==4
 for u,t in zip(test_users,claims):
  if t:rpc(db,'finish',u,{'token':t,'error':'synthetic_failure'})
 print('PASS',system,'project-wide cap admits at most four account workers')
 # Queue wake-ups coalesce; unrelated profile updates produce no requests.
 rpc(db,'retry',user)
 before=int(sql(db,'select count(*) from net.requests'))
 for _ in range(20):rpc(db,'dispatch',user)
 assert int(sql(db,'select count(*) from net.requests'))==before
 sql(db,f"update {native} set updated_at=now() where user_id='{user}'")
 assert int(sql(db,'select count(*) from net.requests'))==before
 assert before>0
 assert sql(db,"select bool_and(headers ? 'X-Profile-Sync-Kick' and not headers ? 'X-Profile-Sync-Key') from net.requests")=='t'
 print('PASS',system,'native no-ops and duplicate kicks coalesce with signed requests')
 for query in ["select profile_sync_private.claim('"+user+"')", "select public.profile_sync('claim','"+user+"')"]:
  try:sql(db,'set role authenticated;'+query);raise AssertionError('browser lease access')
  except RuntimeError as e:assert 'permission denied' in str(e)
 print('PASS',system,'worker admission remains service-only')
print('QUEUE LOAD REGRESSIONS PASSED')
