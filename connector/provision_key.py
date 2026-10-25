"""Generate a per-device credential without printing it or passing it in arguments."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile

def secure_write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.key-', dir=path.parent)
    try:
        if os.name == 'nt':
            identity = subprocess.run(['powershell.exe','-NoProfile','-Command','[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],capture_output=True,text=True,check=True).stdout.strip()
            if not re.fullmatch(r'S-1-[0-9-]+',identity):
                raise RuntimeError('Cannot determine Windows account SID')
            subprocess.run(['icacls',temporary,'/inheritance:r','/grant:r',f'*{identity}:(F)'],capture_output=True,check=True)
        else:
            os.fchmod(fd,0o600)
        with os.fdopen(fd,'w',encoding='utf-8',newline='\n') as stream:
            fd = None
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary,path)
    finally:
        if fd is not None: os.close(fd)
        if os.path.exists(temporary): os.unlink(temporary)

def provision(directory: Path, variable: str, rotate=False):
    if not re.fullmatch(r'[A-Z][A-Z0-9_]*',variable): raise ValueError('Invalid environment variable name')
    env=directory/'.env'
    previous=env.read_text(encoding='utf-8-sig') if env.exists() else ''
    pattern=re.compile(r'^'+re.escape(variable)+r'=.*$',re.MULTILINE)
    existing=pattern.search(previous)
    if existing and existing.group().split('=',1)[1].strip() and not rotate:
        raise ValueError('Credential already exists; use --rotate explicitly')
    token=secrets.token_urlsafe(48)
    digest=hashlib.sha256(token.encode()).hexdigest()
    replacement=f'{variable}={token}'
    contents=pattern.sub(replacement,previous) if existing else previous.rstrip()+'\n'+replacement+'\n'
    secure_write(env,contents.lstrip('\n'))
    # Only a public one-way hash and variable name go into the enrollment file.
    enrollment=directory/'.secrets'/(variable+'.json')
    secure_write(enrollment,json.dumps({'token_env':variable,'connector_key_hash':digest},indent=2)+'\n')
    return enrollment

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--token-env',default='DEVICE_ONE_TOKEN')
    parser.add_argument('--directory',type=Path,default=Path(__file__).resolve().parent)
    parser.add_argument('--rotate',action='store_true')
    args=parser.parse_args()
    try:
        enrollment=provision(args.directory,args.token_env,args.rotate)
        print('Credential saved to protected local .env; raw value was not printed.')
        print('Hash-only enrollment file:',enrollment)
    except Exception as error:
        print('Provisioning failed ('+type(error).__name__+'). No credential was printed.')
        raise SystemExit(1)
