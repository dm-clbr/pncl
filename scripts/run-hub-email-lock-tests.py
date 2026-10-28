"""Disposable GoTrue integration tests. Requires Docker Compose and Python 3.

No production credentials, published ports, or external mail delivery. The
internal Docker network and SMTP sink are removed along with local test secrets.
"""
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
DOCKER = shutil.which('docker') or '/usr/local/bin/docker'
work = Path(tempfile.mkdtemp(prefix='pncl-email-lock-'))
project = 'pncl-email-lock-' + secrets.token_hex(4)
password, jwt = secrets.token_urlsafe(40), secrets.token_urlsafe(48)
os.chmod(work, 0o700)

def save(name, content):
    path = work / name
    path.write_text(content)
    path.chmod(0o600)

save('secrets.json', json.dumps({'password': password, 'jwt': jwt}))
save('bootstrap.sql', f"""
create role pncl_email_test_auth login password '{password}';
grant pncl_email_test_auth to postgres;
alter role pncl_email_test_auth set search_path = auth, public;
create database hub_email_test owner pncl_email_test_auth;
\\connect hub_email_test
create schema auth authorization pncl_email_test_auth;
grant usage on schema auth to authenticated;
""")
save('migrations.sql', '\n'.join((ROOT / 'supabase/migrations' / f).read_text() for f in [
    '20261027165650_hub_work_email_lock.sql',
    '20261027170056_hub_email_onboarding_id_type.sql',
]))
auth_env = {
    'GOTRUE_API_HOST': '0.0.0.0', 'GOTRUE_API_PORT': '9999',
    'API_EXTERNAL_URL': 'http://auth:9999', 'GOTRUE_SITE_URL': 'http://localhost:3000',
    'GOTRUE_DB_DRIVER': 'postgres',
    'GOTRUE_DB_DATABASE_URL': f'postgres://pncl_email_test_auth:{password}@db:5432/hub_email_test',
    'GOTRUE_JWT_SECRET': jwt, 'GOTRUE_JWT_ADMIN_ROLES': 'service_role',
    'GOTRUE_JWT_AUD': 'authenticated', 'GOTRUE_JWT_DEFAULT_GROUP_NAME': 'authenticated',
    'GOTRUE_JWT_EXP': '3600', 'GOTRUE_EXTERNAL_EMAIL_ENABLED': 'true',
    'GOTRUE_MAILER_AUTOCONFIRM': 'false', 'GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED': 'true',
    'GOTRUE_SMTP_HOST': 'mail', 'GOTRUE_SMTP_PORT': '1025',
    'GOTRUE_SMTP_ADMIN_EMAIL': 'noreply@thepncl.com',
    'GOTRUE_SMTP_SENDER_NAME': 'Local test', 'GOTRUE_SMTP_MAX_FREQUENCY': '1s',
}
save('compose.json', json.dumps({
    'services': {
        'db': {'image': 'public.ecr.aws/supabase/postgres:15.8.1.060',
               'environment': {'POSTGRES_PASSWORD': password, 'POSTGRES_DB': 'postgres'},
               'networks': ['isolated'], 'volumes': [
                   f'{work}/secrets.json:/tmp/hub-auth-test-secrets.json:ro',
                   f'{work}/bootstrap.sql:/tmp/bootstrap.sql:ro',
                   f'{work}/migrations.sql:/tmp/hub-email-lock.sql:ro',
                   f'{ROOT}/scripts/test-hub-email-lock-api.py:/tmp/test-hub-email-lock-api.py:ro',
               ]},
        'mail': {'image': 'public.ecr.aws/supabase/mailpit:v1.22.3', 'networks': ['isolated']},
        'auth': {'image': 'supabase/gotrue:v2.197.0', 'environment': auth_env, 'networks': ['isolated']},
    },
    'networks': {'isolated': {'internal': True}},
}))
compose = [DOCKER, 'compose', '-p', project, '-f', str(work / 'compose.json')]

def run(*args, required=True):
    result = subprocess.run(compose + list(args), text=True, capture_output=True)
    if required and result.returncode:
        raise RuntimeError('Disposable test service command failed: ' + args[0])
    return result

def wait_for(*args):
    for _ in range(60):
        if run(*args, required=False).returncode == 0:
            return
        time.sleep(1)
    raise RuntimeError('Disposable test service did not become ready')

try:
    print('Starting isolated Postgres, GoTrue and SMTP sink...', flush=True)
    run('up', '-d', 'db', 'mail')
    wait_for('exec', '-T', 'db', 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres')
    run('exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/bootstrap.sql')
    run('up', '-d', 'auth')
    wait_for('exec', '-T', 'db', 'python3', '-c', "from urllib.request import urlopen; urlopen('http://auth:9999/health',timeout=2)")
    result = run('exec', '-T', 'db', 'python3', '/tmp/test-hub-email-lock-api.py', required=False)
    print(result.stdout, end='')
    if result.returncode:
        print(result.stderr, end='')
        raise RuntimeError('Email-lock integration checks failed')
finally:
    result = run('down', '--volumes', '--remove-orphans', required=False)
    shutil.rmtree(work)
    if result.returncode:
        print('Docker cleanup needs attention for project ' + project)
