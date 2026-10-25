from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from service_setup import prepare

class InstallerBackupTests(unittest.TestCase):
    def test_preserves_unsent_rows_and_existing_installed_queue(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'source'; target=Path(folder)/'target'
            source.mkdir(); target.mkdir()
            (source/'devices.json').write_text(json.dumps({'endpoint':'http://localhost:3000/api/connector','devices':[{'id':'fixture'}]}))
            (source/'.env').write_text('DEVICE_ONE_TOKEN=fixture-only-not-a-real-secret')
            with closing(sqlite3.connect(source/'queue.sqlite3')) as db:
                db.execute('create table pending (id integer)'); db.execute('insert into pending values(1)'); db.commit()
            prepare(source,target)
            config=json.loads((target/'devices.json').read_text())
            self.assertEqual(config['queue_path'],'state/queue.sqlite3')
            self.assertEqual((target/'.env').read_text(),(source/'.env').read_text())
            with closing(sqlite3.connect(target/'state/queue.sqlite3')) as db:
                self.assertEqual(db.execute('select id from pending').fetchone()[0],1)
                db.execute('insert into pending values(2)'); db.commit()
            prepare(source,target)
            with closing(sqlite3.connect(target/'state/queue.sqlite3')) as db:
                self.assertEqual(db.execute('select count(*) from pending').fetchone()[0],2)

if __name__=='__main__':unittest.main()
