import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from connector import Queue,user_metadata,retrieve_users,process_user_import

class RestrictedUser:
    user_id='003'
    name='Fixture Employee'
    group_id='2'
    def __getattr__(self,key):
        raise AssertionError('Sensitive/unapproved field accessed: '+key)

class ImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.queue=Queue(str(Path(self.tmp.name)/'queue.sqlite3'))
        self.addCleanup(self.tmp.cleanup);self.addCleanup(self.queue.close)
        self.device={'id':'device-fixture','ip':'192.0.2.1'}
    def test_explicit_non_biometric_allowlist(self):
        self.assertEqual(user_metadata(RestrictedUser()),{'device_user_id':'003','name':'Fixture Employee','device_group':'2'})
    def test_user_id_preserved_for_historical_matching(self):
        self.assertEqual(user_metadata(SimpleNamespace(user_id=' 003 ',name='Name',group_id=''))['device_user_id'],' 003 ')
    def test_read_users_uses_no_template_or_write_operations(self):
        class ReadOnlyConnection:
            closed=False
            def get_users(self): return [RestrictedUser()]
            def disconnect(self): self.closed=True
            def __getattr__(self,key): raise AssertionError('Forbidden device call: '+key)
        conn=ReadOnlyConnection()
        with patch('zk.ZK') as client:
            client.return_value.connect.return_value=conn
            self.assertEqual(len(retrieve_users(self.device)),1)
        self.assertTrue(conn.closed)
    def test_partial_upload_is_durable_and_resumes_without_reading_again(self):
        users=[{'device_user_id':str(i),'name':'Fixture '+str(i)} for i in range(501)]
        self.queue.save_users('request','device-fixture',users)
        with patch('connector.send_payload',side_effect=[{'request_id':'request'},{'received':500},OSError()]):
            with self.assertRaises(OSError):process_user_import('https://example.test','secret',self.device,self.queue)
        self.assertEqual(self.queue.pending_users('device-fixture')[2],500)
        with patch('connector.retrieve_users') as read,patch('connector.send_payload',side_effect=[{'request_id':'request'},{'received':501}]):
            process_user_import('https://example.test','secret',self.device,self.queue)
            read.assert_not_called()
        self.assertIsNone(self.queue.pending_users('device-fixture'))
    def test_unreachable_device_reports_error_without_employee_data(self):
        with patch('connector.retrieve_users',side_effect=OSError()),patch('connector.send_payload',side_effect=[{'request_id':'request'},{'reported':True}]) as send:
            with self.assertRaises(OSError):process_user_import('https://example.test','secret',self.device,self.queue)
            self.assertEqual(send.call_args.args[2]['mode'],'users_error')
            self.assertNotIn('users',send.call_args.args[2])
    def test_cancelled_request_drops_only_its_local_roster(self):
        self.queue.save_users('old','device-fixture',[{'device_user_id':'3','name':'Fixture'}])
        with patch('connector.send_payload',return_value={'request_id':None}):process_user_import('https://example.test','secret',self.device,self.queue)
        self.assertIsNone(self.queue.pending_users('device-fixture'))

if __name__=='__main__':unittest.main()
