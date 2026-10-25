"""Installer helper: copy credentials privately and back up SQLite without exposing rows."""
from contextlib import closing
import argparse
import json
from pathlib import Path
import shutil
import sqlite3


def prepare(source, target):
    source, target = Path(source).resolve(), Path(target).resolve()
    config = json.loads((source / 'devices.json').read_text(encoding='utf-8-sig'))
    if not config.get('devices'):
        raise ValueError('Device configuration required')
    state = target / 'state'
    state.mkdir(exist_ok=True)
    previous = (source / config.get('queue_path', 'queue.sqlite3')).resolve()
    destination = state / 'queue.sqlite3'
    # Reinstall/update keeps installed state authoritative.
    if previous.exists() and not destination.exists():
        with closing(sqlite3.connect(f'{previous.as_uri()}?mode=ro', uri=True)) as origin:
            with closing(sqlite3.connect(destination)) as backup:
                origin.backup(backup)
    config['queue_path'] = 'state/queue.sqlite3'
    config['log_path'] = 'state/connector.log'
    (target / 'devices.json').write_text(json.dumps(config, indent=2)+'\n',encoding='utf-8')
    shutil.copyfile(source / '.env', target / '.env')
    print('Configuration and protected credential copied. Existing installed queue preserved.')

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('source'); p.add_argument('target')
    a = p.parse_args()
    try:
        prepare(a.source, a.target)
    except Exception as e:
        print('Setup failed ('+type(e).__name__+'); no credential was printed.')
        raise SystemExit(1)
