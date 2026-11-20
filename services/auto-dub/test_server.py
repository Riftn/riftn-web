"""The dub line: a few jobs wait inside the worker, the rest are turned away."""
import os
import sys
import threading
import unittest
from unittest.mock import MagicMock, patch

sys.modules.setdefault('torch', MagicMock())
from fastapi.testclient import TestClient

import server

JOB = {'dubId': 'dub', 'lang': 'es', 'videoUrl': 'https://example.test/v.mp4', 'uploadUrl': 'https://example.test/up',
       'callbackUrl': 'https://example.test/cb', 'path': 'dub/job.m4a'}


class DubLineTests(unittest.TestCase):
    def test_jobs_wait_their_turn_and_only_the_overflow_is_refused(self):
        places = 1 + server.DUB_QUEUE
        release = threading.Event()
        seen = []

        def render(event):
            seen.append(event['input'])
            release.wait(5)

        with patch.dict(os.environ, {'DUB_WORKER_SECRET': 'secret'}), patch.object(server, 'handler', side_effect=render):
            client = TestClient(server.app)
            auth = {'Authorization': 'Bearer secret'}
            codes = [
                client.post('/jobs', json={'input': {**JOB, 'jobId': f'job-{i}'}}, headers=auth).status_code
                for i in range(places + 1)
            ]
            self.assertEqual(codes, [202] * places + [503])
            self.assertEqual(client.get('/').json()['dubFree'], 0)
            release.set()
            server.executor.submit(lambda: None).result(5)
            self.assertEqual(client.get('/').json()['dubFree'], places)
        self.assertEqual([job['jobId'] for job in seen], [f'job-{i}' for i in range(places)])
        self.assertTrue(all(job['acceptedAt'] > 0 and job['secret'] == 'secret' for job in seen))

    def test_jobs_need_the_worker_secret(self):
        with patch.dict(os.environ, {'DUB_WORKER_SECRET': 'secret'}):
            response = TestClient(server.app).post('/jobs', json={'input': {**JOB, 'jobId': 'job'}})
        self.assertEqual(response.status_code, 403)


if __name__ == '__main__':
    unittest.main()
