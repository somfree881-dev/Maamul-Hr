import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from provision_key import provision
from connector import NoCredentialRedirects, send_payload
import json

class KeyTests(unittest.TestCase):
    def test_provision_and_rotate(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            enrollment=provision(root,'TEST_DEVICE_TOKEN')
            token=(root/'.env').read_text().strip().split('=',1)[1]
            self.assertGreaterEqual(len(token),64)
            self.assertEqual(json.loads(enrollment.read_text())['connector_key_hash'],hashlib.sha256(token.encode()).hexdigest())
            self.assertNotIn(token,enrollment.read_text())
            with self.assertRaises(ValueError): provision(root,'TEST_DEVICE_TOKEN')
            provision(root,'TEST_DEVICE_TOKEN',True)
            self.assertNotIn(token,(root/'.env').read_text())
    def test_no_redirect_forwarding(self):
        with self.assertRaises(RuntimeError): NoCredentialRedirects().redirect_request(None,None,307,'redirect',{},'https://another-host.test')
    def test_insecure_destination_rejected_before_network(self):
        for endpoint in ['http://remote.example/api/connector','https://user:password@host/api/connector','https://host/api/connector?key=secret']:
            with patch('connector.build_opener') as opener:
                with self.assertRaises(ValueError): send_payload(endpoint,'test-secret',{})
                opener.assert_not_called()
