import tempfile
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch
from connector import Queue,event_from_record,flush,synchronize,single_instance
from pathlib import Path

class ConnectorTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=self.tmp.name+'/queue.sqlite3'
        self.queue=Queue(self.path)
        self.addCleanup(self.tmp.cleanup)
        self.addCleanup(lambda:self.queue.close())
        self.device={'id':'device-a','timezone':'Africa/Nairobi','punch_map':{'0':0}}
        self.event=event_from_record(SimpleNamespace(user_id='7',timestamp=datetime(2026,10,1,8),punch=0,status=1),self.device)
    def test_deduplication(self):
        self.queue.put('a',self.event);self.queue.put('a',self.event)
        self.assertEqual(len(self.queue.batch('a')),1)
    def test_persists_restart(self):
        self.queue.put('a',self.event);self.queue.close();self.queue=Queue(self.path)
        self.assertEqual(len(self.queue.batch('a')),1)
    def test_failure_retains_unsent(self):
        self.queue.put('a',self.event)
        with patch('connector.post_batch',side_effect=OSError('offline')):
            with self.assertRaises(OSError):flush('https://example.test','secret','a',self.queue)
        self.assertEqual(len(self.queue.batch('a')),1)
    def test_success_acknowledges(self):
        self.queue.put('a',self.event)
        with patch('connector.post_batch'):flush('https://example.test','secret','a',self.queue)
        self.assertEqual(self.queue.batch('a'),[])
        self.queue.put('a',self.event)
        self.assertEqual(self.queue.batch('a'),[])
    def test_devices_isolated(self):
        self.queue.put('a',self.event)
        self.assertEqual(self.queue.batch('b'),[])
    def test_timezone_and_unknown_punch(self):
        self.assertTrue(self.event['occurred_at'].endswith('+03:00'))
        self.assertEqual(len(self.event['source_key']),64)
        self.device['punch_map']={}
        event=event_from_record(SimpleNamespace(user_id='7',timestamp=datetime(2026,10,1,8),punch=3,status=1),self.device)
        self.assertEqual(event['punch'],255)
    def test_dst_ambiguous_rejected(self):
        self.device['timezone']='America/New_York'
        with self.assertRaises(ValueError):event_from_record(SimpleNamespace(user_id='7',timestamp=datetime(2026,11,1,1,30),punch=0,status=1),self.device)

class BackgroundTests(unittest.TestCase):
    def test_os_lock_blocks_second_instance_and_releases(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'sync.lock'
            with single_instance(path):
                with self.assertRaises(OSError):
                    with single_instance(path): pass
            with single_instance(path): pass

    def test_api_failure_does_not_stop_device_collection(self):
        with patch('connector.flush',side_effect=OSError), patch('connector.retrieve') as read, patch('connector.post_batch') as heartbeat:
            with self.assertRaises(OSError): synchronize('https://example.test','secret',{'id':'d'},object())
            read.assert_called_once()
            heartbeat.assert_not_called()

    def test_device_failure_cannot_certify_sync(self):
        with patch('connector.flush'), patch('connector.retrieve',side_effect=OSError), patch('connector.post_batch') as heartbeat:
            with self.assertRaises(OSError): synchronize('https://example.test','secret',{'id':'d'},object())
            heartbeat.assert_not_called()

    def test_recovered_api_flushes_queue_before_heartbeat(self):
        with patch('connector.flush',side_effect=[OSError(),None]) as upload, patch('connector.retrieve') as read, patch('connector.post_batch') as heartbeat:
            synchronize('https://example.test','secret',{'id':'d'},object())
            self.assertEqual(upload.call_count,2)
            read.assert_called_once()
            heartbeat.assert_called_once_with('https://example.test','secret','d',[])

if __name__=='__main__':unittest.main()
