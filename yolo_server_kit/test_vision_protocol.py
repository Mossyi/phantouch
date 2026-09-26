import unittest

from vision_protocol import MAX_CONTROL_MESSAGE_BYTES, parse_video_subscription


class VisionProtocolTests(unittest.TestCase):
    def test_video_subscription_messages(self):
        self.assertIs(parse_video_subscription('{"type":"video","enabled":true}'), True)
        self.assertIs(parse_video_subscription('{"type":"video","enabled":false}'), False)

    def test_invalid_messages_are_ignored(self):
        invalid = (
            '',
            'not-json',
            '[]',
            '{"type":"unknown","enabled":true}',
            '{"type":"video","enabled":1}',
            '{"type":"video"}',
            'x' * (MAX_CONTROL_MESSAGE_BYTES + 1),
        )
        for message in invalid:
            with self.subTest(message=message[:40]):
                self.assertIsNone(parse_video_subscription(message))


if __name__ == '__main__':
    unittest.main()
