"""Provision the dedicated LS SSO signer without exposing private material.

Uses the already authenticated Supabase CLI. Never prints subprocess output,
keys, JWTs, session data or secret values. This script leaves the Hub gate OFF.
Configure the public-key-only LeadSpply receiver separately through operator SQL.
"""
import hashlib, json, os, shutil, subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLI = shutil.which('supabase') or '/opt/homebrew/bin/supabase'
HUB = 'dpnajpojbxgsckwrmvnm'
LS = 'lhxvbtiepsuohunfmnkm'
folder = ROOT / '.secrets/pncl-leadspply-sso'
private = folder / 'partner-private.pem'
public = ROOT / 'docs/keys/pnclhub-leadspply-public.pem'

def run(args, data=None):
    r = subprocess.run(args, input=data, capture_output=True)
    if r.returncode: raise RuntimeError('Secure provisioning command failed; output suppressed')
    return r.stdout

def metadata(project):
    result = json.loads(run([CLI, 'secrets', 'list', '--project-ref', project, '--output', 'json']))
    if not isinstance(result, list): raise RuntimeError('Unexpected secret metadata format; output suppressed')
    return {r['name']: r.get('digest', r.get('value')) for r in result}

existing = metadata(HUB)
if not private.exists():
    if public.exists() or 'PNCL_LEADSPPLY_PRIVATE_KEY_PEM' in existing:
        raise RuntimeError('Existing SSO key found; refusing an uncoordinated replacement')
    ignored = subprocess.run(['git','check-ignore','--quiet',str(private)],cwd=ROOT).returncode == 0
    if not ignored: raise RuntimeError('Private key path must be Git-ignored')
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    folder.chmod(0o700)
    previous = os.umask(0o077)
    try: run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:3072','-out',str(private)])
    finally: os.umask(previous)
    private.chmod(0o600)
if private.stat().st_mode & 0o077: raise RuntimeError('Private key permissions are too broad')
derived = run(['openssl','pkey','-in',str(private),'-pubout'])
if public.exists() and public.read_bytes() != derived: raise RuntimeError('Existing public key does not match; refusing replacement')
public.parent.mkdir(parents=True, exist_ok=True)
public.write_bytes(derived)
fingerprint = hashlib.sha256(run(['openssl','pkey','-pubin','-in',str(public),'-outform','DER'])).hexdigest()
message = b'PNCL dedicated LeadSpply SSO signer verification'
signature = run(['openssl','dgst','-sha256','-sign',str(private)], message)
with tempfile.TemporaryDirectory(prefix='pncl-sso-sign-check-') as tmp:
    sig = Path(tmp)/'signature'; sig.write_bytes(signature)
    run(['openssl','dgst','-sha256','-verify',str(public),'-signature',str(sig)],message)

# LeadSpply receives only the public PEM through its authorized connector's
# private receiver-settings table. This CLI account manages Hub only.
for project, key_name, value in [(HUB,'PNCL_LEADSPPLY_PRIVATE_KEY_PEM',private.read_text())]:
    values={key_name:value, 'PNCL_LEADSPPLY_SSO_ENABLED':'false', 'PNCL_LEADSPPLY_TEST_EXPIRES_AT':'2020-01-01T00:00:00Z'}
    digest = hashlib.sha256(value.encode()).hexdigest()
    current = metadata(project)
    if key_name in current and current[key_name] != digest: raise RuntimeError('Stored SSO key differs; refusing replacement')
    fd, name = tempfile.mkstemp(prefix='pncl-sso-secrets-',suffix='.env')
    try:
        os.fchmod(fd,0o600)
        with os.fdopen(fd,'w') as f:
            f.write('\n'.join(k+'='+json.dumps(v) for k,v in values.items())+'\n')
        run([CLI,'secrets','set','--project-ref',project,'--env-file',name])
    finally: os.unlink(name)
    stored = metadata(project)
    if any(stored.get(k) != hashlib.sha256(v.encode()).hexdigest() for k,v in values.items()): raise RuntimeError('Secret digest verification failed; values suppressed')
    print(json.dumps({'project':project,'key_digest_verified':True,'general_sso_enabled':False,'test_gate_expired':True}))
print(json.dumps({'public_spki_sha256':fingerprint,'key_bits':3072,'local_sign_verify':'passed'}))
