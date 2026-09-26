import os
import tempfile
import unittest
from pathlib import Path

from camera_source import build_camera_source, describe_camera_source, load_local_camera_env


class CameraSourceTests(unittest.TestCase):
    def test_explicit_source_takes_precedence(self):
        env = {
            'YOLO_CAMERA_SOURCE': '2',
            'YOLO_CAMERA_HOST': '192.0.2.10',
        }
        self.assertEqual(build_camera_source(env), 2)

    def test_builds_encoded_rtsp_url(self):
        env = {
            'YOLO_CAMERA_HOST': '192.0.2.10',
            'YOLO_CAMERA_PORT': '554',
            'YOLO_CAMERA_PATH': 'stream1',
            'YOLO_CAMERA_USERNAME': 'camera user',
            'YOLO_CAMERA_PASSWORD': 'p@ss/word',
        }
        self.assertEqual(
            build_camera_source(env),
            'rtsp://camera%20user:p%40ss%2Fword@192.0.2.10:554/stream1',
        )

    def test_password_requires_username(self):
        with self.assertRaisesRegex(ValueError, 'USERNAME'):
            build_camera_source({
                'YOLO_CAMERA_HOST': '192.0.2.10',
                'YOLO_CAMERA_PASSWORD': 'secret',
            })

    def test_description_redacts_credentials_and_query_secrets(self):
        source = 'rtsp://admin:secret@camera/stream1?token=private&mode=live'
        self.assertEqual(
            describe_camera_source(source),
            'rtsp://***@camera/stream1?token=***&mode=live',
        )

    def test_local_env_does_not_override_process_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '.env.yolo.local'
            path.write_text(
                'YOLO_CAMERA_HOST=192.0.2.10\n'
                'YOLO_CAMERA_USERNAME="camera-user"\n'
                'INVALID-KEY=nope\n',
                encoding='utf-8',
            )
            env = {'YOLO_CAMERA_HOST': 'existing-host'}
            self.assertTrue(load_local_camera_env(path, env))
            self.assertEqual(env['YOLO_CAMERA_HOST'], 'existing-host')
            self.assertEqual(env['YOLO_CAMERA_USERNAME'], 'camera-user')
            self.assertNotIn('INVALID-KEY', env)


if __name__ == '__main__':
    unittest.main()
