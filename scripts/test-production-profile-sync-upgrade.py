from pathlib import Path
import os,json,uuid
source=Path(os.environ['PNCL_SYNC_REPO'])/'scripts/test-production-profile-sync.py'
setup=source.read_text().split('a=str(uuid.uuid4())')[0]
setup='\n'.join(line for line in setup.splitlines() if "*_profile_sync_latest_save.sql" not in line and "*_profile_sync_queue_limits.sql" not in line)
exec(setup.replace("db='mirror_'+system","db='mirror_upgrade_'+system"))
pair={'pncl':str(uuid.uuid4()),'leadspply':str(uuid.uuid4())}
for system,user in pair.items():
 db='mirror_upgrade_'+system;native='portal_profiles' if system=='pncl' else 'agent_profiles'
 sql(db,f"insert into auth.users(id,email) values('{user}','upgrade-test@thepncl.com'); insert into {native}(user_id,first_name,last_name) values('{user}','{system}','Same');")
sql('mirror_upgrade_leadspply',f"insert into pncl_account_links values('{pair['pncl']}','{pair['leadspply']}')")
for system,user in pair.items():rpc('mirror_upgrade_'+system,'bind',user,{'peer':pair['leadspply' if system=='pncl' else 'pncl']})
def view(system):return {f['field']:f for f in rpc('mirror_upgrade_'+system,'read',pair[system])['fields']}
def events(system):return rpc('mirror_upgrade_'+system,'outbox',pair[system])
def deliver(system,event,version=True):
 other='leadspply' if system=='pncl' else 'pncl'
 e={k:event[k] for k in ['id','user_id','field','value','clock','baseline']};e.update(source=system,file=None)
 if version:e['write_version']=event['write_version']
 r=rpc('mirror_upgrade_'+other,'receive',pair[other],{'events':[e]});rpc('mirror_upgrade_'+system,'ack',pair[system],{'receipts':r});return r
old_events={s:events(s) for s in pair}
for s in pair:
 for e in old_events[s]:deliver(s,e,False)
assert all(view(s)['first_name']['conflict'] is not None for s in pair)
counts={s:sql('mirror_upgrade_'+s,'select count(*) from profile_sync_private.receipts') for s in pair}
for s,root in roots.items():sql('mirror_upgrade_'+s,next(root.glob('supabase/migrations/*_profile_sync_latest_save.sql')).read_text())
assert all(view(s)['first_name']['conflict'] is None for s in pair)
for s in reversed(pair):
 for e in events(s):deliver(s,e)
assert view('pncl')['first_name']['value']==view('leadspply')['first_name']['value']=='leadspply'
assert all(int(sql('mirror_upgrade_'+s,'select count(*) from profile_sync_private.receipts'))>=int(counts[s]) for s in pair)
print('PASS existing conflicts automatically converge with history retained')
# A delivery accepted before upgrade but acknowledged afterwards must replay safely.
for s in pair:
 old=next(e for e in old_events[s] if e['field']=='last_name')
 event=json.loads(sql('mirror_upgrade_'+s,f"select to_jsonb(e) from profile_sync_private.outbox e where id='{old['id']}'"))
 assert deliver(s,event)[0]['outcome']=='matched'
print('PASS pre-upgrade delivery receipts accept unchanged retries with new ordering metadata')
# Deterministic tie-break with the exact same timestamp, delivered in either order.
for s in pair:
 native='portal_profiles' if s=='pncl' else 'agent_profiles'
 sql('mirror_upgrade_'+s,f"update {native} set last_name='{s} tie' where user_id='{pair[s]}'")
 e=next(e for e in events(s) if e['field']=='last_name');e['write_version']['at']='2026-10-20T00:00:00.000000+00:00'
 sql('mirror_upgrade_'+s,f"update profile_sync_private.fields set write_version={literal(e['write_version'])} where field='last_name'")
 old_events[s]=e
for s in pair:deliver(s,old_events[s])
assert all(view(s)['last_name']['value']=='pncl tie' for s in pair)
print('PASS exact timestamp ties converge deterministically')

for s,root in roots.items():sql('mirror_upgrade_'+s,next(root.glob('supabase/migrations/*_profile_sync_queue_limits.sql')).read_text())
assert all(view(s)['last_name']['value']=='pncl tie' for s in pair)
print('PASS queue-limit upgrade retains saved fields and delivery history')
