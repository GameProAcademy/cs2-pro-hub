"""Fail-closed tests for the local-only R11 Storage bootstrap."""
import importlib.util
import json
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch


SOURCE = Path(__file__).resolve().parents[1] / 'f553-r11-execution-engine.py'
spec = importlib.util.spec_from_file_location('r11_disposable_engine', SOURCE)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


class DisposableBucketTest(TestCase):
    bucket = 'cs2-raw-evidence'
    details = {'id': bucket, 'public': False, 'file_size_limit': 104857600}

    def test_missing_bucket_400_creates_then_verifies(self):
        missing = engine.LocalHTTPError(400, 'GET', '/storage/v1/bucket/cs2-raw-evidence',
                                        '{"code":"NoSuchBucket","message":"Bucket not found"}')
        with patch.object(engine, 'request', side_effect=[
                missing, (200, b'{}'), (200, json.dumps(self.details).encode())]) as request:
            self.assertEqual(engine.ensure_bucket('http://localhost:54321', 'local', self.bucket), self.details)
            self.assertEqual(request.call_count, 3)
            self.assertEqual(request.call_args_list[1].args[3], 'POST')

    def test_other_400_does_not_create(self):
        error = engine.LocalHTTPError(400, 'GET', '/storage/v1/bucket/cs2-raw-evidence',
                                      '{"code":"InvalidRequest"}')
        with patch.object(engine, 'request', side_effect=error) as request:
            with self.assertRaises(engine.LocalHTTPError):
                engine.ensure_bucket('http://localhost:54321', 'local', self.bucket)
            self.assertEqual(request.call_count, 1)

    def test_unexpected_bucket_configuration_rejected(self):
        with patch.object(engine, 'request', return_value=(200, json.dumps({**self.details, 'public': True}).encode())):
            with self.assertRaisesRegex(RuntimeError, 'configuration invalid'):
                engine.ensure_bucket('http://localhost:54321', 'local', self.bucket)