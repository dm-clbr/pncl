"""Isolated PostgreSQL regression checks; no production credentials or network."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import secrets
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
DOCKER = '/usr/local/bin/docker'
NAME = 'pncl-link-test-' + secrets.token_hex(5)
ADMIN = '00000000-0000-4000-8000-000000000001'
USER = '00000000-0000-4000-8000-000000000002'
OTHER = '00000000-0000-4000-8000-000000000003'
RECORD = '00000000-0000-4000-8000-000000000010'
SECOND = '00000000-0000-4000-8000-000000000011'
EMAIL = 'fixture@thepncl.com'

def docker(*args, stdin=None, check=True):
    result = subprocess.run([DOCKER, *args], input=stdin, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr)
    return result

def sql(query):
    return docker('exec', '-i', NAME, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', stdin=query).stdout.strip()

BOOTSTRAP = """
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
  deleted_at timestamptz, banned_until timestamptz, is_anonymous boolean default false,
  email_change text default '', raw_app_meta_data jsonb default '{}');
create table auth.identities(id uuid primary key default gen_random_uuid(), user_id uuid, provider text,
  provider_id text, identity_data jsonb);
create table public.onboarding_records(id uuid primary key, workspace_email text, supabase_user_id text,
  google_user_id text, status text, enrollment_status text, referral_status text, contract_status text,
  application_status text, google_account_status text, portal_account_status text, finalization_status text,
  onboarding_completed_at timestamptz, released_at timestamptz, provisioning_lock_expires_at timestamptz,
  failure_code text, failed_step text, failure_detail text, portal_linked_at timestamptz, finalized_at timestamptz,
  updated_at timestamptz default now(), preserved_payload text default 'preserve original data');
create table public.admin_audit_log(id uuid primary key default gen_random_uuid(), admin_user_id uuid not null,
  target_user_id uuid, action text not null, changes jsonb, created_at timestamptz default now());
"""
FIXTURE = f"""
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
 ('{ADMIN}','admin@thepncl.com',now(),'{{"role":"admin"}}'),
 ('{USER}','{EMAIL}',now(),'{{"role":"agent"}}');
insert into auth.identities(user_id,provider,provider_id,identity_data) values
 ('{USER}','google','google-fixture','{{"sub":"google-fixture","email":"{EMAIL}","email_verified":true}}');
insert into public.onboarding_records(id,workspace_email,google_user_id,status,enrollment_status,
 referral_status,contract_status,application_status,google_account_status,portal_account_status,finalization_status,
 onboarding_completed_at,failed_step,failure_code,failure_detail) values
 ('{RECORD}','{EMAIL}','google-fixture','credentials_viewed','needs_attention','finalized','finalized','finalized',
  'ready','failed','failed','2026-07-01T00:00:00Z','portal','legacy_portal_link_missing','Historical link missing');
"""
CALL = f"public.reconcile_portal_account_link('{ADMIN}','{RECORD}','{USER}')"
PERSIST = f"public.persist_portal_account_link('{RECORD}','{USER}','{EMAIL}')"
STATUS = f"public.portal_link_repair_status('{RECORD}','{USER}')"
CLAIMS = "set local request.jwt.claims = '{\"role\":\"service_role\"}';"

def run_case(name, setup, action, condition):
    output = sql(f"begin; {CLAIMS} {FIXTURE} {setup} {action} select case when ({condition}) then 'PASS' else 'FAIL' end; rollback;")
    assert output.splitlines()[-1] == 'PASS', (name, output)
    print('PASS ' + name, flush=True)

def rejected(call, reason):
    return f"""do $case$ begin
      begin perform {call}; raise exception 'Unexpected success';
      exception when others then if sqlerrm <> '{reason}' then raise; end if; end;
    end $case$;"""

try:
    docker('run', '-d', '--rm', '--network', 'none', '--name', NAME,
           '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17.6')
    for _ in range(45):
        if docker('exec', NAME, 'pg_isready', '-U', 'postgres', check=False).returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('Isolated Postgres did not become ready')
    sql(BOOTSTRAP)
    sql((ROOT / 'supabase/migrations/20261112011710_portal_account_link_reconciliation.sql').read_text())
    repaired = f"(select supabase_user_id='{USER}' and status='credentials_viewed' and enrollment_status='ready' and portal_account_status='ready' and finalization_status='ready' and failure_code is null and failure_detail is null and onboarding_completed_at='2026-07-01T00:00:00Z' and preserved_payload='preserve original data' from onboarding_records where id='{RECORD}')"
    unlinked = f"(select supabase_user_id is null from onboarding_records where id='{RECORD}')"
    run_case('verified legacy repair preserves original completion and Auth role', '', f'do $$ begin perform {CALL}; end $$;',
             repaired + f" and (select raw_app_meta_data->>'role'='agent' from auth.users where id='{USER}') and (select count(*)=1 from admin_audit_log)")
    run_case('repeat repair is idempotent and adds no second audit', '', f'do $$ begin perform {CALL}; perform {CALL}; end $$;',
             repaired + ' and (select count(*)=1 from admin_audit_log)')
    for name, setup, reason in [
        ('incomplete onboarding', "update onboarding_records set onboarding_completed_at=null,contract_status='signed';", 'onboarding_incomplete'),
        ('outstanding Google verification', "update onboarding_records set google_account_status='verification_required';", 'onboarding_incomplete'),
        ('pending v3 activation', f"update auth.users set raw_app_meta_data='{{\"enrollment_version\":3,\"enrollment_ready\":false}}' where id='{USER}';", 'onboarding_incomplete'),
        ('released enrollment', 'update onboarding_records set released_at=now();', 'onboarding_released'),
        ('active provisioning attempt', "update onboarding_records set provisioning_lock_expires_at=now()+interval '1 minute';", 'onboarding_in_progress'),
        ('different Google subject', "update auth.identities set provider_id='other-google',identity_data=jsonb_set(identity_data,'{sub}','\"other-google\"');", 'identity_conflict'),
        ('conflicting server-owned onboarding identity', f"update auth.users set raw_app_meta_data=jsonb_build_object('onboarding_id','{SECOND}') where id='{USER}';", 'identity_conflict'),
        ('conflicting existing link', f"insert into onboarding_records(id,workspace_email,supabase_user_id) values('{SECOND}','other@thepncl.com','{USER}');", 'identity_conflict'),
        ('duplicate active email enrollment', f"insert into onboarding_records(id,workspace_email) values('{SECOND}','{EMAIL}');", 'identity_conflict'),
        ('pending email change', f"update auth.users set email_change='other@thepncl.com' where id='{USER}';", 'work_email_unverified'),
        ('disabled existing user', f"update auth.users set banned_until=now()+interval '1 day' where id='{USER}';", 'work_email_unverified'),
        ('unconfirmed existing user', f"update auth.users set email_confirmed_at=null where id='{USER}';", 'work_email_unverified'),
        ('different outstanding setup error', "update onboarding_records set failure_code='another_failure';", 'other_failure_requires_review'),
    ]:
        run_case(name, setup, rejected(CALL, reason), unlinked + ' and (select count(*)=0 from admin_audit_log)')
    run_case('missing account does not invent an identity', '', '',
             f"public.portal_link_repair_status('{RECORD}',null)->>'reason'='no_existing_account' and {unlinked}")
    run_case('ordinary agent cannot request an admin repair', '', rejected(CALL.replace(ADMIN, USER), 'forbidden'), unlinked)
    run_case('no service claims cannot call definer routines', "set local request.jwt.claims='{}';", rejected(CALL, 'forbidden'), unlinked)
    run_case('browser roles have no RPC execute privilege', '', '',
             "not has_function_privilege('anon','public.reconcile_portal_account_link(uuid,uuid,uuid)','execute') and not has_function_privilege('authenticated','public.persist_portal_account_link(uuid,uuid,text)','execute') and has_function_privilege('service_role','public.reconcile_portal_account_link(uuid,uuid,uuid)','execute')")
    run_case('provisioning persists provenance without completing onboarding',
             f"update onboarding_records set status='creating_email',enrollment_status='provisioning_portal',onboarding_completed_at=null; update auth.users set raw_app_meta_data=jsonb_build_object('onboarding_id','{RECORD}','enrollment_version',3,'enrollment_ready',false) where id='{USER}';",
             f'do $$ begin perform {PERSIST}; end $$;',
             f"(select supabase_user_id='{USER}' and enrollment_status='provisioning_portal' and onboarding_completed_at is null from onboarding_records) and (select count(*)=0 from admin_audit_log)")
    run_case('mail resend cannot connect incomplete legacy verification',
             "update onboarding_records set google_account_status='verification_required',onboarding_completed_at=null;",
             rejected(PERSIST, 'onboarding_incomplete'), unlinked)
    run_case('audit failure rolls back the repair', "alter table admin_audit_log add constraint force_audit_failure check (action <> 'onboarding_link_reconciled');",
             f"do $$ begin begin perform {CALL}; raise exception 'Unexpected success'; exception when check_violation then null; end; end $$;", unlinked)

    # Two real connections race the same repair. Exactly one mutation/audit wins.
    sql(FIXTURE)
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _: sql(f'begin; {CLAIMS} select {CALL}->>\'repaired\'; commit;'), range(2)))
    assert sorted(outcomes) == ['false', 'true'], outcomes
    assert sql('select count(*) from admin_audit_log;') == '1'
    print('PASS concurrent repair: one mutation and one audit', flush=True)
    print('23 isolated PostgreSQL checks passed', flush=True)
finally:
    docker('rm', '-f', NAME, check=False)
