import unittest

import numpy as np

from pose_rules import KeypointTracker, PoseStabilizer, check_pose


def skeleton(points, confidence=0.95):
    keypoints = np.zeros((17, 2), dtype=float)
    confidences = np.zeros(17, dtype=float)
    for index, point in points.items():
        keypoints[index] = point
        confidences[index] = confidence
    return keypoints, confidences


def dog_skeleton():
    return skeleton({
        0: (155, 135),
        5: (190, 145),
        6: (210, 155),
        7: (175, 205),
        8: (195, 215),
        9: (170, 250),
        10: (190, 260),
        11: (310, 150),
        12: (330, 170),
        13: (310, 250),
        14: (330, 270),
        15: (390, 250),
        16: (410, 270),
    })


class PoseRuleTests(unittest.TestCase):
    def test_kowtow_pose_required_by_barbie_ritual_is_supported(self):
        keypoints, confidences = skeleton({
            0: (200, 150),
            5: (180, 100),
            6: (220, 100),
            9: (100, 150),
            10: (300, 150),
            11: (180, 200),
            12: (220, 200),
            13: (130, 130),
            14: (270, 130),
        })

        pose, confidence = check_pose(keypoints, confidences)

        self.assertEqual(pose, 'kowtow')
        self.assertGreaterEqual(confidence, 0.7)

    def test_kneel_pose_required_by_barbie_ritual_is_supported(self):
        keypoints, confidences = skeleton({
            5: (180, 100),
            6: (220, 100),
            11: (180, 200),
            12: (220, 200),
            13: (180, 300),
            14: (220, 300),
        })

        pose, confidence = check_pose(keypoints, confidences)

        self.assertEqual(pose, 'kneel')
        self.assertGreaterEqual(confidence, 0.7)

    def test_hands_up_pose_required_by_barbie_ritual_is_supported(self):
        keypoints, confidences = skeleton({
            0: (200, 100),
            5: (180, 150),
            6: (220, 150),
            9: (165, 110),
            10: (235, 110),
            11: (180, 260),
            12: (220, 260),
        })

        pose, confidence = check_pose(keypoints, confidences)

        self.assertEqual(pose, 'hands_up')
        self.assertGreaterEqual(confidence, 0.7)

    def test_all_fours_is_classified_as_dog(self):
        keypoints, confidences = dog_skeleton()

        pose, confidence = check_pose(keypoints, confidences)

        self.assertEqual(pose, 'dog')
        self.assertGreaterEqual(confidence, 0.6)
        self.assertLessEqual(confidence, 1.0)

    def test_one_occluded_wrist_still_allows_a_complete_visible_side(self):
        keypoints, confidences = dog_skeleton()
        confidences[9] = 0.1

        pose, _ = check_pose(keypoints, confidences)

        self.assertEqual(pose, 'dog')

    def test_weak_keypoints_do_not_receive_inflated_confidence(self):
        keypoints, confidences = dog_skeleton()
        confidences[confidences > 0] = 0.55

        pose, confidence = check_pose(keypoints, confidences)

        self.assertEqual(pose, 'dog')
        self.assertAlmostEqual(confidence, 0.55)

    def test_bending_forward_on_straight_legs_is_not_dog(self):
        keypoints, confidences = dog_skeleton()
        keypoints[15] = (310, 380)
        keypoints[16] = (330, 400)

        pose, _ = check_pose(keypoints, confidences)

        self.assertNotEqual(pose, 'dog')

    def test_missing_leg_support_chain_is_not_dog(self):
        keypoints, confidences = dog_skeleton()
        confidences[15] = 0.1
        confidences[16] = 0.1

        pose, _ = check_pose(keypoints, confidences)

        self.assertNotEqual(pose, 'dog')

    def test_plank_is_not_dog(self):
        keypoints, confidences = skeleton({
            5: (190, 145),
            6: (210, 155),
            7: (175, 190),
            8: (195, 200),
            9: (170, 230),
            10: (190, 240),
            11: (310, 150),
            12: (330, 160),
            13: (390, 155),
            14: (410, 165),
            15: (450, 195),
            16: (470, 205),
        })

        pose, _ = check_pose(keypoints, confidences)

        self.assertNotEqual(pose, 'dog')

    def test_bilateral_joint_angles_do_not_cancel_each_other(self):
        keypoints, confidences = skeleton({
            5: (170, 100),
            6: (230, 100),
            11: (170, 200),
            12: (230, 200),
            13: (100, 200),
            14: (300, 200),
            15: (100, 300),
            16: (300, 300),
        })

        pose, _ = check_pose(keypoints, confidences)

        self.assertEqual(pose, 'wall_sit')

    def test_surrender_is_not_intercepted_by_hands_up(self):
        keypoints, confidences = skeleton({
            0: (200, 100),
            5: (180, 150),
            6: (220, 150),
            9: (170, 50),
            10: (230, 50),
            11: (180, 260),
            12: (220, 260),
            13: (180, 370),
            14: (220, 370),
            15: (180, 480),
            16: (220, 480),
        })

        pose, _ = check_pose(keypoints, confidences)

        self.assertEqual(pose, 'surrender')

    def test_malformed_skeleton_fails_closed(self):
        pose, confidence = check_pose(np.zeros((16, 2)), np.ones(16))

        self.assertEqual((pose, confidence), ('unknown', 0.0))


class TrackerTests(unittest.TestCase):
    def test_fidget_is_mean_joint_movement_not_total_skeleton_norm(self):
        tracker = KeypointTracker(alpha=0.3)
        keypoints = np.full((17, 2), 100.0)
        confidences = np.full(17, 0.95)
        tracker.update(keypoints, confidences)

        tracker.update(keypoints + np.array([5.0, 0.0]), confidences)

        self.assertAlmostEqual(tracker.velocity, 1.0)

    def test_newly_visible_point_does_not_jump_from_stale_history(self):
        tracker = KeypointTracker(alpha=0.3)
        keypoints = np.zeros((17, 2), dtype=float)
        confidences = np.zeros(17, dtype=float)
        tracker.update(keypoints, confidences)
        keypoints[9] = (200, 250)
        confidences[9] = 0.95

        smoothed = tracker.update(keypoints, confidences)

        np.testing.assert_array_equal(smoothed[9], keypoints[9])
        self.assertEqual(tracker.velocity, 0.0)


class StabilizerTests(unittest.TestCase):
    def test_positive_pose_requires_consecutive_frames(self):
        stabilizer = PoseStabilizer(required_frames=3)

        self.assertEqual(stabilizer.update('dog', 0.9), ('unknown', 0.0))
        self.assertEqual(stabilizer.update('dog', 0.9), ('unknown', 0.0))
        self.assertEqual(stabilizer.update('dog', 0.9), ('dog', 0.9))
        self.assertEqual(stabilizer.update('unknown', 0.0), ('unknown', 0.0))


if __name__ == '__main__':
    unittest.main()
