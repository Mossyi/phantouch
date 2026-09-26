import math

import numpy as np


KEYPOINT_CONFIDENCE = 0.5
MIN_TORSO_PIXELS = 20.0


def calc_angle(a, b, c):
    """Return the angle ABC in degrees, or -1 when it cannot be calculated."""
    if a is None or b is None or c is None:
        return -1.0
    ba = np.asarray(a, dtype=float) - np.asarray(b, dtype=float)
    bc = np.asarray(c, dtype=float) - np.asarray(b, dtype=float)
    ba_norm = np.linalg.norm(ba)
    bc_norm = np.linalg.norm(bc)
    if ba_norm == 0 or bc_norm == 0:
        return -1.0
    cosine = np.dot(ba, bc) / (ba_norm * bc_norm)
    return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))


def _point(keypoints, confidences, index):
    if confidences[index] <= KEYPOINT_CONFIDENCE:
        return None
    point = np.asarray(keypoints[index], dtype=float)
    if point.shape != (2,) or not np.all(np.isfinite(point)):
        return None
    return point


def _center(keypoints, confidences, left_index, right_index):
    points = [
        point
        for point in (
            _point(keypoints, confidences, left_index),
            _point(keypoints, confidences, right_index),
        )
        if point is not None
    ]
    if not points:
        return None
    return np.mean(points, axis=0)


def _bilateral_angle(keypoints, confidences, left_indices, right_indices):
    angles = []
    for indices in (left_indices, right_indices):
        points = [_point(keypoints, confidences, index) for index in indices]
        angle = calc_angle(*points)
        if angle >= 0:
            angles.append(angle)
    return float(np.mean(angles)) if angles else -1.0


def _pose_confidence(confidences, indices, ceiling):
    visible = [float(confidences[index]) for index in indices if confidences[index] > KEYPOINT_CONFIDENCE]
    if not visible:
        return 0.0
    # Geometry is a gate, not a probability boost; weak keypoints must remain weak.
    return min(float(ceiling), float(np.mean(visible)))


def _valid_pose_arrays(keypoints, confidences):
    keypoints = np.asarray(keypoints, dtype=float)
    confidences = np.asarray(confidences, dtype=float)
    return (
        keypoints.shape == (17, 2)
        and confidences.shape == (17,)
        and np.all(np.isfinite(confidences))
    )


def check_pose(keypoints, confidences):
    """Classify a COCO-17 skeleton using conservative 2D geometry rules."""
    if not _valid_pose_arrays(keypoints, confidences):
        return 'unknown', 0.0

    keypoints = np.asarray(keypoints, dtype=float)
    confidences = np.asarray(confidences, dtype=float)

    nose = _point(keypoints, confidences, 0)
    shoulder = _center(keypoints, confidences, 5, 6)
    elbow = _center(keypoints, confidences, 7, 8)
    wrist = _center(keypoints, confidences, 9, 10)
    hip = _center(keypoints, confidences, 11, 12)
    knee = _center(keypoints, confidences, 13, 14)
    ankle = _center(keypoints, confidences, 15, 16)

    if shoulder is None or hip is None:
        return 'unknown', 0.1

    torso_length = math.dist(shoulder, hip)
    if not math.isfinite(torso_length) or torso_length < MIN_TORSO_PIXELS:
        return 'unknown', 0.1

    left_wrist = _point(keypoints, confidences, 9)
    right_wrist = _point(keypoints, confidences, 10)
    left_ankle = _point(keypoints, confidences, 15)
    right_ankle = _point(keypoints, confidences, 16)

    angle_hip = _bilateral_angle(keypoints, confidences, (5, 11, 13), (6, 12, 14))
    angle_knee = _bilateral_angle(keypoints, confidences, (11, 13, 15), (12, 14, 16))
    angle_shoulder = _bilateral_angle(keypoints, confidences, (11, 5, 7), (12, 6, 8))

    # Begging: both hands together between the face and upper torso.
    if nose is not None and left_wrist is not None and right_wrist is not None:
        hands_together = math.dist(left_wrist, right_wrist) < torso_length * 0.5
        average_wrist_y = (left_wrist[1] + right_wrist[1]) / 2
        hands_near_face = nose[1] < average_wrist_y < shoulder[1] + torso_length * 0.3
        if hands_together and hands_near_face:
            return 'begging', _pose_confidence(confidences, (0, 5, 6, 9, 10, 11, 12), 0.95)

    # Kowtow must be checked before dog because both can have hands and knees low.
    if nose is not None and wrist is not None and knee is not None and 0 <= angle_hip < 60:
        all_on_floor = (
            abs(nose[1] - wrist[1]) < torso_length * 0.3
            and abs(nose[1] - knee[1]) < torso_length * 0.3
        )
        if all_on_floor:
            return 'kowtow', _pose_confidence(confidences, (0, 5, 6, 9, 10, 11, 12, 13, 14), 0.93)

    # Surrender: both hands clearly above the head while the legs are straight.
    if nose is not None and left_wrist is not None and right_wrist is not None and angle_knee > 150:
        if max(left_wrist[1], right_wrist[1]) < nose[1] - torso_length * 0.15:
            return 'surrender', _pose_confidence(confidences, (0, 9, 10, 11, 12, 13, 14, 15, 16), 0.96)

    # Hands-up/holding-head: both wrists are beside the head, not far above it.
    if nose is not None and left_wrist is not None and right_wrist is not None:
        wrists_near_head = all(abs(point[1] - nose[1]) < torso_length * 0.35 for point in (left_wrist, right_wrist))
        if wrists_near_head:
            return 'hands_up', _pose_confidence(confidences, (0, 5, 6, 9, 10, 11, 12), 0.95)

    # Dog/all-fours: require a real support structure, not merely a bent torso.
    support_indices = [index for index in (9, 10, 13, 14) if confidences[index] > KEYPOINT_CONFIDENCE]
    visible_wrists = sum(confidences[index] > KEYPOINT_CONFIDENCE for index in (9, 10))
    visible_knees = sum(confidences[index] > KEYPOINT_CONFIDENCE for index in (13, 14))
    complete_side = any(
        all(confidences[index] > KEYPOINT_CONFIDENCE for index in side)
        for side in ((5, 7, 9, 11, 13, 15), (6, 8, 10, 12, 14, 16))
    )
    if (
        wrist is not None
        and knee is not None
        and ankle is not None
        and elbow is not None
        and len(support_indices) >= 3
        and visible_wrists >= 1
        and visible_knees >= 1
        and complete_side
        and 55 < angle_hip < 135
        and 35 < angle_knee < 145
        and 35 < angle_shoulder < 155
    ):
        torso_vertical_ratio = abs(shoulder[1] - hip[1]) / torso_length
        hands_below_shoulders = wrist[1] > shoulder[1] + torso_length * 0.25
        knees_below_hips = knee[1] > hip[1] + torso_length * 0.2
        supports_level = abs(wrist[1] - knee[1]) < torso_length * 0.6
        support_y = (wrist[1] + knee[1]) / 2
        supports_below_body = support_y > max(shoulder[1], hip[1]) + torso_length * 0.2
        support_points = [keypoints[index] for index in support_indices]
        support_width = max(point[0] for point in support_points) - min(point[0] for point in support_points)
        has_stable_footprint = support_width > torso_length * 0.35
        if (
            torso_vertical_ratio < 0.55
            and hands_below_shoulders
            and knees_below_hips
            and supports_level
            and supports_below_body
            and has_stable_footprint
        ):
            required = (5, 6, 7, 8, 11, 12, 15, 16, *support_indices)
            return 'dog', _pose_confidence(confidences, required, 0.94)

    if knee is not None and angle_hip > 140:
        is_vertical = (hip[1] - shoulder[1]) > torso_length * 0.7
        if is_vertical:
            return 'kneel', _pose_confidence(confidences, (5, 6, 11, 12, 13, 14), 0.88)

    if knee is not None and 60 < angle_hip < 120 and 60 < angle_knee < 120:
        is_vertical = (hip[1] - shoulder[1]) > torso_length * 0.7
        if is_vertical:
            return 'wall_sit', _pose_confidence(confidences, (5, 6, 11, 12, 13, 14, 15, 16), 0.90)

    if elbow is not None and ankle is not None and angle_hip > 140:
        is_horizontal = abs(shoulder[1] - hip[1]) < torso_length * 0.4
        body_above_floor = elbow[1] > shoulder[1] + torso_length * 0.2 and ankle[1] > hip[1] + torso_length * 0.2
        if is_horizontal and body_above_floor:
            return 'plank', _pose_confidence(confidences, (5, 6, 7, 8, 11, 12, 13, 14, 15, 16), 0.91)

    if wrist is not None and ankle is not None and angle_hip > 120:
        hip_is_highest = hip[1] < shoulder[1] - torso_length * 0.2 and hip[1] < ankle[1] - torso_length * 0.5
        if hip_is_highest:
            return 'bridge', _pose_confidence(confidences, (5, 6, 9, 10, 11, 12, 13, 14, 15, 16), 0.94)

    if knee is not None and wrist is not None and 0 <= angle_hip < 60:
        if math.dist(knee, shoulder) < torso_length * 0.6:
            return 'fetal', _pose_confidence(confidences, (5, 6, 9, 10, 11, 12, 13, 14), 0.89)

    if left_wrist is not None and right_wrist is not None and left_ankle is not None and right_ankle is not None:
        arm_spread = math.dist(left_wrist, right_wrist)
        leg_spread = math.dist(left_ankle, right_ankle)
        if arm_spread > torso_length * 1.5 and leg_spread > torso_length * 1.2:
            return 'spread_eagle', _pose_confidence(confidences, (5, 6, 9, 10, 11, 12, 15, 16), 0.92)

    return 'unknown', 0.1


class KeypointTracker:
    """Smooth visible keypoints and report mean per-joint movement in pixels."""

    def __init__(self, alpha=0.3):
        self.alpha = float(alpha)
        self.history_kp = None
        self.history_conf = None
        self.velocity = 0.0

    def reset(self):
        self.history_kp = None
        self.history_conf = None
        self.velocity = 0.0

    def update(self, current_kp, conf):
        current_kp = np.asarray(current_kp, dtype=float)
        conf = np.asarray(conf, dtype=float)
        if current_kp.shape != (17, 2) or conf.shape != (17,):
            raise ValueError('Expected COCO-17 keypoints with shape (17, 2) and confidences with shape (17,)')

        if self.history_kp is None:
            self.history_kp = current_kp.copy()
            self.history_conf = conf.copy()
            self.velocity = 0.0
            return self.history_kp.copy()

        current_visible = conf > KEYPOINT_CONFIDENCE
        previous_visible = self.history_conf > KEYPOINT_CONFIDENCE
        comparable = current_visible & previous_visible
        if np.any(comparable):
            movement = np.linalg.norm(current_kp[comparable] - self.history_kp[comparable], axis=1)
            mean_movement = float(np.mean(movement))
            self.velocity = self.velocity * 0.8 + mean_movement * 0.2
        else:
            self.velocity *= 0.8

        smoothed = current_kp * self.alpha + self.history_kp * (1 - self.alpha)
        newly_visible = current_visible & ~previous_visible
        next_history = self.history_kp.copy()
        next_history[current_visible] = smoothed[current_visible]
        next_history[newly_visible] = current_kp[newly_visible]
        self.history_kp = next_history
        self.history_conf = conf.copy()
        return self.history_kp.copy()


class PoseStabilizer:
    """Require consecutive positive frames while failing closed on unknown frames."""

    def __init__(self, required_frames=3):
        self.required_frames = max(1, int(required_frames))
        self.candidate = 'unknown'
        self.candidate_frames = 0

    def reset(self):
        self.candidate = 'unknown'
        self.candidate_frames = 0

    def update(self, pose, confidence):
        if pose == 'unknown':
            self.reset()
            return 'unknown', 0.0
        if pose == self.candidate:
            self.candidate_frames += 1
        else:
            self.candidate = pose
            self.candidate_frames = 1
        if self.candidate_frames < self.required_frames:
            return 'unknown', 0.0
        return pose, float(confidence)

def dist(a, b):
    if a is None or b is None:
        return 9999.0
    return float(math.dist(a, b))

def evaluate_skeleton_priors(keypoints, confidences, min_conf=0.25):
    """
    完全基于人体运动学生物力学与接触面的几何先验与物理否决门禁器：
    输出 (priors, veto) 字典对。
    采用“正向阳性确认机制”：特殊姿势默认极低先验 (0.005)，日常动作默认高先验 (0.85)。
    只有当骨骼几何呈现清晰无误的标志性特征时，才赋予特殊姿势高概率 (0.95+)。
    """
    CLASSES = ['dog', 'fetal', 'hands_up', 'kneel', 'kowtow', 'surrender', 'unknown']
    priors = {c: 0.005 for c in CLASSES}
    priors['unknown'] = 0.85
    veto = {c: False for c in CLASSES}

    keypoints = np.asarray(keypoints, dtype=float)
    confidences = np.asarray(confidences, dtype=float)
    if keypoints.shape != (17, 2) or confidences.shape != (17,):
        priors['unknown'] = 0.95
        return priors, veto

    def pt(idx):
        return keypoints[idx] if confidences[idx] >= min_conf else None

    def center(idx1, idx2):
        p1, p2 = pt(idx1), pt(idx2)
        if p1 is not None and p2 is not None:
            return (p1 + p2) / 2.0
        return p1 if p1 is not None else p2

    nose = pt(0)
    head = nose if nose is not None else center(1, 2)
    if head is None:
        head = center(3, 4)

    l_sho, r_sho = pt(5), pt(6)
    l_elb, r_elb = pt(7), pt(8)
    l_wri, r_wri = pt(9), pt(10)
    l_hip, r_hip = pt(11), pt(12)
    l_kne, r_kne = pt(13), pt(14)
    l_ank, r_ank = pt(15), pt(16)

    shoulder = center(5, 6)
    hip = center(11, 12)
    wrist = center(9, 10)
    knee = center(13, 14)
    ankle = center(15, 16)

    if shoulder is None or hip is None:
        priors['unknown'] = 0.95
        return priors, veto

    torso_len = dist(shoulder, hip)
    if torso_len < 10 or not math.isfinite(torso_len):
        priors['unknown'] = 0.95
        return priors, veto

    # 左右肘关节屈伸角
    l_elb_ang = calc_angle(l_sho, l_elb, l_wri)
    r_elb_ang = calc_angle(r_sho, r_elb, r_wri)
    valid_elb_angs = [a for a in (l_elb_ang, r_elb_ang) if a >= 0]
    max_elb_ang = max(valid_elb_angs) if valid_elb_angs else -1.0

    # 左右膝关节屈伸角
    l_knee_ang = calc_angle(l_hip, l_kne, l_ank)
    r_knee_ang = calc_angle(r_hip, r_kne, r_ank)
    valid_knee_angs = [a for a in (l_knee_ang, r_knee_ang) if a >= 0]
    mean_kne_ang = float(np.mean(valid_knee_angs)) if valid_knee_angs else -1.0

    # 左右髋关节屈伸角
    l_hip_ang = calc_angle(l_sho, l_hip, l_kne)
    r_hip_ang = calc_angle(r_sho, r_hip, r_kne)
    valid_hip_angs = [a for a in (l_hip_ang, r_hip_ang) if a >= 0]
    mean_hip_ang = float(np.mean(valid_hip_angs)) if valid_hip_angs else -1.0

    # 脊柱轴与垂直法向投影 (用于衡量手臂是否充当支撑身体的垂直立柱)
    v_torso = shoulder - hip
    u_torso = v_torso / torso_len
    n_torso = np.array([-u_torso[1], u_torso[0]])
    perp_wri = 0.0
    if wrist is not None:
        perp_wri = abs(float(np.dot(wrist - shoulder, n_torso))) / torso_len

    wri_sho_dist = dist(wrist, shoulder) if wrist is not None else 0.0

    # 1. 投降正向判定 (surrender): 双手高举超过肩膀与头部
    hands_high = 0
    if l_wri is not None and l_sho is not None and l_wri[1] < l_sho[1] - torso_len * 0.15:
        hands_high += 1
    if r_wri is not None and r_sho is not None and r_wri[1] < r_sho[1] - torso_len * 0.15:
        hands_high += 1

    if hands_high == 2:
        priors['surrender'] = 0.98
        priors['unknown'] = 0.05
    elif hands_high == 1:
        priors['surrender'] = 0.60

    # 2. 抱头正向判定 (hands_up): 双手同时贴近头部/耳侧，手腕在肩膀上方
    if head is not None and (l_wri is not None or r_wri is not None):
        hw_dists = [dist(w, head) for w in (l_wri, r_wri) if w is not None]
        wri_min_y = min([p[1] for p in (l_wri, r_wri) if p is not None])
        sho_min_y = min([p[1] for p in (l_sho, r_sho) if p is not None])
        if hw_dists and max(hw_dists) < torso_len * 0.70 and np.mean(hw_dists) < torso_len * 0.60 and wri_min_y < sho_min_y + torso_len * 0.15:
            priors['hands_up'] = 0.96
            priors['unknown'] = 0.05

    # 3. 趴跪正向判定 (dog): 必须满足四肢支撑立柱特征
    is_hands_tucked = (
        (perp_wri < 0.60)
        or (wri_sho_dist < torso_len * 0.65)
        or (0 < max_elb_ang < 115 and (l_wri is not None and r_wri is not None and dist(l_wri, r_wri) < torso_len * 0.45))
    )
    is_supporting = (max_elb_ang >= 120 and perp_wri >= 0.70) or perp_wri >= 1.0
    if is_supporting and not is_hands_tucked:
        priors['dog'] = 0.95
        priors['unknown'] = 0.05
    else:
        veto['dog'] = True

    # 4. 叩拜正向判定 (kowtow): 骨盆后坐贴脚跟，面部和双手贴地
    if 0 < mean_hip_ang < 65 and head is not None and wrist is not None and dist(head, wrist) < torso_len * 0.70:
        priors['kowtow'] = 0.95
        priors['unknown'] = 0.05
    else:
        if mean_hip_ang > 85:
            veto['kowtow'] = True

    # 5. 侧卧蜷缩正向判定 (fetal): 髋膝双重屈曲抱团
    if 0 < mean_hip_ang < 80 and (0 < mean_kne_ang < 110 or (knee is not None and shoulder is not None and dist(knee, shoulder) < torso_len * 0.85)):
        priors['fetal'] = 0.95
        priors['unknown'] = 0.05
    else:
        if mean_hip_ang > 95 and mean_kne_ang > 120:
            veto['fetal'] = True

    # 6. 双膝跪地直立正向判定 (kneel): 双膝跪地 (膝角45-130) 且躯干挺立 (髋角>130)
    if 45 <= mean_kne_ang <= 130 and (mean_hip_ang > 130 or mean_hip_ang < 0):
        priors['kneel'] = 0.94
        priors['unknown'] = 0.05
    else:
        if mean_kne_ang > 150:
            veto['kneel'] = True

    return priors, veto


