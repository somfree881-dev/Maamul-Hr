"""Read compatible ZKTeco devices. No template retrieval or log deletion."""
from __future__ import annotations
import argparse
import hashlib
import json
import logging
from contextlib import contextmanager
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import random
import sqlite3
import time
from datetime import datetime
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler
from zoneinfo import ZoneInfo

LOG = logging.getLogger('maamul.connector')

class Queue:
    def __init__(self, path: str):
        self.db = sqlite3.connect(path)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('CREATE TABLE IF NOT EXISTS events (device TEXT NOT NULL, source_key TEXT NOT NULL, payload TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(device,source_key))')
        self.db.execute('CREATE INDEX IF NOT EXISTS pending ON events(device,sent)')
        self.db.execute('CREATE TABLE IF NOT EXISTS user_imports (request_id TEXT PRIMARY KEY, device TEXT NOT NULL, payload TEXT NOT NULL, next_offset INTEGER NOT NULL DEFAULT 0)')

    def put(self, device: str, event: dict):
        with self.db:
            self.db.execute('INSERT OR IGNORE INTO events(device,source_key,payload) VALUES(?,?,?)', (device,event['source_key'],json.dumps(event)))

    def batch(self, device: str, size=500):
        return [json.loads(r[0]) for r in self.db.execute('SELECT payload FROM events WHERE device=? AND sent=0 ORDER BY rowid LIMIT ?', (device,size))]

    def acknowledge(self, device: str, events: list[dict]):
        with self.db:
            self.db.executemany('UPDATE events SET sent=1 WHERE device=? AND source_key=?', [(device,e['source_key']) for e in events])

    def save_users(self, request_id, device, users):
        with self.db:
            self.db.execute('INSERT OR IGNORE INTO user_imports(request_id,device,payload) VALUES(?,?,?)',(request_id,device,json.dumps(users)))

    def pending_users(self, device):
        row=self.db.execute('SELECT request_id,payload,next_offset FROM user_imports WHERE device=? ORDER BY rowid LIMIT 1',(device,)).fetchone()
        return (row[0],json.loads(row[1]),row[2]) if row else None

    def acknowledge_users(self, request_id, offset, done):
        with self.db:
            if done: self.db.execute('DELETE FROM user_imports WHERE request_id=?',(request_id,))
            else: self.db.execute('UPDATE user_imports SET next_offset=? WHERE request_id=?',(offset,request_id))

    def close(self):
        self.db.close()

def event_from_record(record, device: dict) -> dict:
    zone=ZoneInfo(device['timezone'])
    timestamp=record.timestamp
    if timestamp.tzinfo is None:
        # Reject ambiguous/nonexistent wall clocks rather than guessing a payroll timestamp.
        first=timestamp.replace(tzinfo=zone,fold=0)
        second=timestamp.replace(tzinfo=zone,fold=1)
        if first.utcoffset()!=second.utcoffset():
            raise ValueError('Ambiguous/nonexistent device timestamp; correct clock or use vendor UTC logs')
        timestamp=first
    stamp=timestamp.isoformat(timespec='seconds')
    uid=str(record.user_id)
    raw_punch=int(getattr(record,'punch',255))
    # Vendor punch semantics vary. Configure mapping per device; unknown is inferred/reviewed.
    mapping=device.get('punch_map',{})
    punch=mapping.get(str(raw_punch),255)
    identity=f"{device['id']}|{uid}|{stamp}|{raw_punch}|{getattr(record,'status',0)}"
    return {'device_user_id':uid,'occurred_at':stamp,'punch':punch,'source_key':hashlib.sha256(identity.encode()).hexdigest()}

def retrieve(device: dict, queue: Queue | None, test=False):
    if device.get('protocol','pyzk')!='pyzk':
        raise ValueError('This connector supports pyzk only. Use a model-specific ADMS/vendor adapter for this device.')
    from zk import ZK
    key=int(os.environ.get(device.get('password_env','ZK_PASSWORD'),'0'))
    client=ZK(device['ip'],port=int(device.get('port',4370)),timeout=15,password=key,force_udp=device.get('force_udp',False),ommit_ping=True)
    connection=None
    try:
        connection=client.connect()
        if test:
            LOG.info('Connectivity test succeeded for device %s',device['id'])
            return
        # Always read historical logs. Queue/DB keys make repeated reads idempotent.
        for record in connection.get_attendance():
            queue.put(device['id'],event_from_record(record,device))
    finally:
        if connection is not None:
            connection.disconnect()

def user_metadata(record):
    # Explicit allowlist. Never access password, card, privilege, fingerprint or face fields.
    return {'device_user_id':str(record.user_id),
            'name':str(record.name or '').strip(),
            'device_group':str(getattr(record,'group_id','') or '').strip()}

def retrieve_users(device):
    if device.get('protocol','pyzk')!='pyzk':
        raise ValueError('Device user import requires a supported pyzk model')
    from zk import ZK
    client=ZK(device['ip'],port=int(device.get('port',4370)),timeout=15,
              password=int(os.environ.get(device.get('password_env','ZK_PASSWORD'),'0')),
              force_udp=device.get('force_udp',False),ommit_ping=True)
    connection=None
    try:
        connection=client.connect()
        users=[user_metadata(user) for user in connection.get_users()]
        if len(users)>20000: raise ValueError('Device roster exceeds import limit')
        return users
    finally:
        if connection is not None: connection.disconnect()

def process_user_import(endpoint, token, device, queue):
    poll=send_payload(endpoint,token,{'device_id':device['id'],'mode':'users_poll'})
    request_id=poll.get('request_id')
    pending=queue.pending_users(device['id'])
    if pending is not None and pending[0]!=request_id:
        # A sealed, failed or cancelled request is no longer accepting uploads.
        queue.acknowledge_users(pending[0],pending[2],True)
        pending=None
    if not request_id: return
    if pending is None:
        try:
            users=retrieve_users(device)
        except Exception:
            send_payload(endpoint,token,{'device_id':device['id'],'mode':'users_error','request_id':request_id,'error':'read_failed'})
            raise
        queue.save_users(request_id,device['id'],users)
        pending=queue.pending_users(device['id'])
    request_id,users,offset=pending
    while True:
        chunk=users[offset:offset+500]
        done=offset+len(chunk)>=len(users)
        try:
            result=send_payload(endpoint,token,{'device_id':device['id'],'mode':'users_batch','request_id':request_id,'offset':offset,'users':chunk,'final':done})
        except HTTPError as error:
            if error.code in (400,413,422):
                send_payload(endpoint,token,{'device_id':device['id'],'mode':'users_error','request_id':request_id,'error':'read_failed'})
                queue.acknowledge_users(request_id,offset,True)
            raise
        if result.get('cancelled'):
            queue.acknowledge_users(request_id,offset,True)
            return
        expected=offset+len(chunk)
        if result.get('received')!=expected: raise RuntimeError('User roster batch was not acknowledged')
        queue.acknowledge_users(request_id,expected,done)
        if done:
            LOG.info('Employee roster staged for device %s; administrator confirmation required',device['id'])
            return
        offset=expected


class NoCredentialRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise RuntimeError('Connector endpoint redirects are not allowed')

def send_payload(endpoint: str, token: str, payload: dict):
    parsed=urlparse(endpoint)
    if parsed.username or parsed.password or parsed.query or parsed.fragment or (parsed.scheme!='https' and not (parsed.scheme=='http' and parsed.hostname in ('localhost','127.0.0.1','::1'))):
        raise ValueError('Use an HTTPS endpoint without URL credentials, query strings or fragments')
    request=Request(endpoint,data=json.dumps(payload).encode(),headers={'Authorization':f'Bearer {token}','Content-Type':'application/json'},method='POST')
    with build_opener(NoCredentialRedirects()).open(request,timeout=45) as response:
        result=json.load(response)
    return result

def post_batch(endpoint: str, token: str, device: str, events: list[dict]):
    result=send_payload(endpoint,token,{'device_id':device,'events':events})
    if result.get('accepted')!=len(events):
        raise RuntimeError('Server did not acknowledge the complete batch')

def flush(endpoint: str, token: str, device: str, queue: Queue):
    while events:=queue.batch(device):
        post_batch(endpoint,token,device,events)
        queue.acknowledge(device,events)

@contextmanager
def single_instance(path: Path):
    """OS-owned lock released on exit/crash; lock file is not a stale PID marker."""
    path.parent.mkdir(parents=True, exist_ok=True)
    stream = open(path, 'a+b')
    try:
        stream.seek(0)
        if not stream.read(1):
            stream.write(b'0'); stream.flush()
        stream.seek(0)
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        stream.close()

def synchronize(endpoint, token, device, queue):
    # API downtime must not prevent collecting device history into the durable queue.
    try:
        flush(endpoint, token, device['id'], queue)
    except Exception:
        pass  # Final flush below reports failure without leaking response bodies.
    retrieve(device, queue)
    flush(endpoint, token, device['id'], queue)
    # Certify coverage only after both physical read and delivery succeeded.
    post_batch(endpoint, token, device['id'], [])


def load_config(path: str):
    config=json.loads(Path(path).read_text(encoding='utf-8-sig'))
    base=Path(path).resolve().parent
    for key, default in [('queue_path','queue.sqlite3'),('log_path','connector.log')]:
        config[key]=str((base / config.get(key,default)).resolve())
    endpoint=config['endpoint']
    parsed=urlparse(endpoint)
    if parsed.scheme!='https' and not (parsed.scheme=='http' and parsed.hostname in ('localhost','127.0.0.1')):
        raise ValueError('HTTPS is required except for local development')
    if not config['devices']:
        raise ValueError('At least one device is required')
    for device in config['devices']:
        ZoneInfo(device['timezone'])
        token=os.environ.get(device['token_env'],'')
        if len(token)<32:
            raise ValueError(f"Set a strong token in {device['token_env']}")
    return config

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--config',default='devices.json')
    parser.add_argument('--test',action='store_true')
    parser.add_argument('--test-api',action='store_true',help='Verify API authentication without ingesting punches or updating sync coverage')
    parser.add_argument('--once',action='store_true')
    args=parser.parse_args()
    from dotenv import load_dotenv
    load_dotenv(Path(args.config).resolve().parent/'.env',override=True)
    config=load_config(args.config)
    Path(config['log_path']).parent.mkdir(parents=True,exist_ok=True)
    if not logging.getLogger().handlers:
        handlers=[RotatingFileHandler(config['log_path'],maxBytes=2_000_000,backupCount=5)]
        if __import__('sys').stderr is not None: handlers.append(logging.StreamHandler())
        logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s',handlers=handlers)
    Path(config['queue_path']).parent.mkdir(parents=True,exist_ok=True)
    # Hold the lock for the entire process, including retries and sleep.
    lock=single_instance(Path(config['queue_path']+'.lock'))
    try: lock.__enter__()
    except OSError:
        LOG.error('Connector already running for this queue')
        raise SystemExit(2)
    queue=Queue(config['queue_path'])
    failures=0
    try:
        while True:
            any_failure=False
            for device in config['devices']:
                token=os.environ[device['token_env']]
                try:
                    if args.test_api:
                        result=send_payload(config['endpoint'],token,{'device_id':device['id'],'mode':'verify'})
                        if result.get('authenticated') is not True: raise RuntimeError('API authentication not acknowledged')
                        LOG.info('API authentication verified for device %s',device['id'])
                        continue
                    if args.test:
                        retrieve(device,None,test=True)
                        continue
                    synchronize(config['endpoint'],token,device,queue)
                    LOG.info('Device %s synchronized',device['id'])
                except Exception as exc:
                    any_failure=True
                    # Never log bearer tokens, raw punches, names or response bodies.
                    if isinstance(exc, HTTPError):
                        hints = {401: 'Check device UUID and matching connector key hash.',
                                 503: 'Configure SUPABASE_SERVICE_ROLE_KEY on the server and restart it.',
                                 404: 'Check the API endpoint URL.'}
                        LOG.error('Device %s failed (HTTP %s). %s', device['id'], exc.code,
                                  hints.get(exc.code, 'Check server configuration.'))
                    else:
                        LOG.error('Device %s failed (%s)',device['id'],type(exc).__name__)
                if not args.test and not args.test_api:
                    try:
                        process_user_import(config['endpoint'],token,device,queue)
                    except Exception as exc:
                        # Keep names, response bodies and tokens out of logs. Attendance sync is independent.
                        LOG.error('Employee import check failed for device %s (%s)',device['id'],type(exc).__name__)
            if args.once or args.test or args.test_api:
                if any_failure: raise SystemExit(1)
                break
            failures=min(failures+1,6) if any_failure else 0
            time.sleep(min(3600,config.get('poll_seconds',60)*2**failures)+random.uniform(0,5))
    except KeyboardInterrupt:
        LOG.info('Connector stopped; unsent queue retained')
    finally:
        queue.close()
        lock.__exit__(None,None,None)

if __name__=='__main__':
    main()
