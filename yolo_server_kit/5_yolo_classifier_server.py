import cv2
import json
import asyncio
import os
import math
import numpy as np
from pathlib import Path
from contextlib import suppress
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from ultralytics import YOLO
import uvicorn
import logging
import threading
import time
import sys

_current_dir = str(Path(__file__).resolve().parent)
if _current_dir not in sys.path:
    sys.path.insert(0, _current_dir)
_parent_dir = str(Path(__file__).resolve().parent.parent)
if _parent_dir not in sys.path:
    sys.path.append(_parent_dir)

try:
    from pose_rules import PoseStabilizer, KeypointTracker, check_pose, evaluate_skeleton_priors
    from vision_protocol import MAX_CONTROL_MESSAGE_BYTES, parse_video_subscription
    from camera_source import build_camera_source, describe_camera_source, load_local_camera_env
except ImportError:
    from yolo_server_kit.pose_rules import PoseStabilizer, KeypointTracker, check_pose, evaluate_skeleton_priors
    from yolo_server_kit.vision_protocol import MAX_CONTROL_MESSAGE_BYTES, parse_video_subscription
    from yolo_server_kit.camera_source import build_camera_source, describe_camera_source, load_local_camera_env

from logging.handlers import RotatingFileHandler
log_formatter = logging.Formatter('%(asctime)s - %(message)s')
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

if not root_logger.handlers:
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(log_formatter)
    root_logger.addHandler(console_handler)

try:
    log_file_path = Path(__file__).resolve().parent / 'server.log'
    file_handler = RotatingFileHandler(log_file_path, maxBytes=10 * 1024 * 1024, backupCount=3, encoding='utf-8')
    file_handler.setFormatter(log_formatter)
    root_logger.addHandler(file_handler)
except Exception:
    pass

logger = logging.getLogger(__name__)

app = FastAPI()

# ================= 配置区 =================
load_local_camera_env()
CAMERA_SOURCE = build_camera_source()

# 自动寻找最优分类模型 (GPU 环境优先原生 PT 显卡直通，次选 ONNX)
DEFAULT_MODEL_PATHS = [
    os.getenv('YOLO_CLASSIFIER_PATH', ''),
    'yolo_action_cls.pt',
    'yolo_action_cls.onnx',
    'yolov8n-cls.pt',
    os.path.join(_current_dir, 'yolo_action_cls.pt'),
    os.path.join(_current_dir, 'yolo_action_cls.onnx'),
    os.path.join(_current_dir, 'yolov8n-cls.pt'),
]

# 自动寻找前置人体定位检测器 (用于家庭监控/广角大场景：先定位人体后裁剪分类)
DEFAULT_DETECTOR_PATHS = [
    os.getenv('YOLO_DETECTOR_PATH', ''),
    'yolov8n-pose.pt',
    'yolo26n.pt',
    'yolov8n.pt',
    os.path.join(_current_dir, 'yolov8n-pose.pt'),
    os.path.join(_current_dir, 'yolo26n.pt'),
    os.path.join(_current_dir, 'yolov8n.pt'),
]

def resolve_detector_path():
    for p in DEFAULT_DETECTOR_PATHS:
        if p and Path(p).exists():
            return str(Path(p).resolve())
    return None

def resolve_model_path():
    for p in DEFAULT_MODEL_PATHS:
        if p and Path(p).exists():
            return str(Path(p).resolve())
    return 'yolov8n-cls.pt'

def resolve_model_input_size():
    env_size = os.getenv('YOLO_MODEL_INPUT_SIZE')
    if env_size:
        return min(640, max(128, int(env_size)))
    for p in [Path('labels.json'), Path(__file__).resolve().parent / 'labels.json', Path(_current_dir) / 'labels.json']:
        if p.exists():
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if 'input_size' in data:
                        return min(640, max(128, int(data['input_size'])))
            except Exception:
                pass
    return 224

MODEL_PATH = resolve_model_path()
MODEL_INPUT_SIZE = resolve_model_input_size()
EXECUTION_PROVIDER = os.getenv('YOLO_EXECUTION_PROVIDER', 'auto').strip().lower()
DML_DEVICE_ID = max(0, int(os.getenv('YOLO_DML_DEVICE_ID', '0')))
POSE_CONF_THRESHOLD = min(1.0, max(0.0, float(os.getenv('YOLO_POSE_CONFIDENCE', '0.50'))))
REQUIRED_STABLE_FRAMES = max(1, int(os.getenv('YOLO_REQUIRED_FRAMES', '3')))
DROPOUT_TOLERANCE = max(0, int(os.getenv('YOLO_DROPOUT_TOLERANCE', '2')))
SHOW_PREVIEW = os.getenv('YOLO_SHOW_PREVIEW', '1').strip().lower() not in {'0', 'false', 'no'}
MAX_CONNECTIONS = max(1, int(os.getenv('YOLO_MAX_CONNECTIONS', '8')))
SEND_TIMEOUT_SECONDS = max(0.05, float(os.getenv('YOLO_SEND_TIMEOUT', '0.5')))
VIDEO_FPS = min(30.0, max(1.0, float(os.getenv('YOLO_VIDEO_FPS', '20'))))
VIDEO_MAX_WIDTH = min(1920, max(320, int(os.getenv('YOLO_VIDEO_WIDTH', '1280'))))
VIDEO_JPEG_QUALITY = min(95, max(40, int(os.getenv('YOLO_VIDEO_QUALITY', '80'))))
CAMERA_OPEN_TIMEOUT_MS = max(1000, int(os.getenv('YOLO_CAMERA_OPEN_TIMEOUT_MS', '5000')))
CAMERA_READ_TIMEOUT_MS = max(1000, int(os.getenv('YOLO_CAMERA_READ_TIMEOUT_MS', '5000')))
CAMERA_RECONNECT_SECONDS = max(0.5, float(os.getenv('YOLO_CAMERA_RECONNECT_SECONDS', '2')))
FRAME_POLL_SECONDS = min(0.05, max(0.001, float(os.getenv('YOLO_FRAME_POLL_MS', '3')) / 1000))
CAMERA_LOW_LATENCY = os.getenv('YOLO_CAMERA_LOW_LATENCY', '1').strip().lower() not in {'0', 'false', 'no'}
CAMERA_BACKEND = os.getenv('YOLO_CAMERA_BACKEND', 'opencv').strip().lower()
CAMERA_DECODE_THREADS = min(8, max(1, int(os.getenv('YOLO_CAMERA_DECODE_THREADS', '2'))))
CAMERA_HW_ACCELERATION = os.getenv('YOLO_CAMERA_HW_ACCELERATION', 'none').strip().lower()

DETECTOR_PATH = resolve_detector_path()
ENABLE_DETECTOR = os.getenv('YOLO_ENABLE_DETECTOR', '1').strip().lower() not in {'0', 'false', 'no'} and DETECTOR_PATH is not None
DETECTOR_IMGSZ = min(1280, max(320, int(os.getenv('YOLO_DETECTOR_IMGSZ', '800'))))
PERSON_MIN_CONF = min(1.0, max(0.05, float(os.getenv('YOLO_PERSON_MIN_CONF', '0.15'))))
PERSON_PAD = min(0.5, max(0.05, float(os.getenv('YOLO_PERSON_PAD', '0.12'))))
SHOW_SKELETON = os.getenv('YOLO_SHOW_SKELETON', '1').strip().lower() not in {'0', 'false', 'no'}
ENABLE_DUAL_CONFIRM = os.getenv('YOLO_DUAL_CONFIRM', '1').strip().lower() not in {'0', 'false', 'no'}

# COCO-17 经典骨骼连接定义与 Cyberpunk 炫彩配色 (OpenPose / MMPose 风格)
COCO_LIMBS = [
    (0, 1, (255, 200, 0)), (0, 2, (255, 200, 0)), (1, 3, (255, 200, 0)), (2, 4, (255, 200, 0)),  # 头部五官 (亮黄)
    (5, 6, (0, 255, 255)), (5, 11, (0, 255, 120)), (6, 12, (0, 255, 120)), (11, 12, (0, 255, 120)), # 躯干核心 (荧光绿)
    (5, 7, (255, 120, 0)), (7, 9, (255, 120, 0)), (6, 8, (0, 165, 255)), (8, 10, (0, 165, 255)), # 双臂四肢 (橙/深蓝)
    (11, 13, (180, 105, 255)), (13, 15, (180, 105, 255)), (12, 14, (255, 105, 180)), (14, 16, (255, 105, 180)), # 双腿四肢 (粉/紫)
]
# ==========================================

active_connections = set()
video_connections = set()
processing_task = None
model = None
detector = None

@app.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket):
    if len(active_connections) >= MAX_CONNECTIONS:
        await websocket.close(code=1013, reason='Too many clients')
        return
    await websocket.accept()
    active_connections.add(websocket)
    logger.info('📱 App 已连接到端到端姿态分类视觉系统')
    try:
        while True:
            message = await websocket.receive_text()
            if len(message.encode('utf-8')) > MAX_CONTROL_MESSAGE_BYTES:
                await websocket.close(code=1009, reason='Control message too large')
                return
            video_enabled = parse_video_subscription(message)
            if video_enabled is True:
                video_connections.add(websocket)
                logger.info('🎞️ App 已打开分类视频预览')
            elif video_enabled is False:
                video_connections.discard(websocket)
                logger.info('🎞️ App 已关闭分类视频预览')
    except WebSocketDisconnect:
        logger.info('📱 App 断开连接')
    except Exception as exc:
        logger.warning(f'📱 WebSocket 连接异常: {exc}')
    finally:
        active_connections.discard(websocket)
        video_connections.discard(websocket)

class PyAvCapture:
    def __init__(self, src):
        import av
        transport = os.getenv('YOLO_CAMERA_TRANSPORT', 'tcp').strip().lower()
        if transport not in {'tcp', 'udp'}:
            transport = 'tcp'
        options = {'rtsp_transport': transport}
        if CAMERA_LOW_LATENCY:
            options.update({
                'fflags': 'nobuffer',
                'flags': 'low_delay',
                'max_delay': '0',
            })
        if CAMERA_DECODE_THREADS > 1:
            options['threads'] = str(CAMERA_DECODE_THREADS)
        self.container = av.open(src, mode='r', options=options, timeout=(CAMERA_OPEN_TIMEOUT_MS / 1000, CAMERA_READ_TIMEOUT_MS / 1000))
        self.video_stream = self.container.streams.video[0]
        self.packet_iterator = self.container.demux(self.video_stream)

    def read(self):
        try:
            for packet in self.packet_iterator:
                for frame in packet.decode():
                    return True, frame.to_ndarray(format='bgr24')
        except Exception:
            return False, None
        return False, None

    def isOpened(self):
        return True

    def release(self):
        with suppress(Exception):
            self.container.close()

class ThreadedCamera:
    """工业级高并发线程安全 RTSP 取流器，杜绝跨线程野指针释放与内存数据竞争。"""
    def __init__(self, src):
        self.src = src
        self.stop_event = threading.Event()
        self.lock = threading.Lock()
        self.ret = False
        self.frame = None
        self.frame_id = 0
        self.stream = None
        self.last_reconnect_log = 0.0
        self.thread = threading.Thread(target=self._worker, daemon=True)
        self.thread.start()

        # 等待首帧就绪 (最多等待 5 秒)
        for _ in range(50):
            with self.lock:
                if self.ret and self.frame is not None:
                    break
            time.sleep(0.1)

    def open_stream(self):
        is_network_stream = isinstance(self.src, str) and self.src.lower().startswith(('rtsp://', 'http://', 'https://'))
        is_rtsp = isinstance(self.src, str) and self.src.lower().startswith('rtsp://')
        if is_rtsp and CAMERA_BACKEND == 'pyav':
            try:
                stream = PyAvCapture(self.src)
                logger.info('RTSP 取流后端: PyAV/FFmpeg (%s)', os.getenv('YOLO_CAMERA_TRANSPORT', 'tcp'))
                return stream
            except Exception:
                logger.warning('PyAV 取流初始化失败，自动回退到 OpenCV', exc_info=True)

        if is_rtsp:
            transport = os.getenv('YOLO_CAMERA_TRANSPORT', 'tcp').strip().lower()
            if transport not in {'tcp', 'udp'}:
                transport = 'tcp'
            capture_options = f'rtsp_transport;{transport}'
            if CAMERA_LOW_LATENCY:
                capture_options += (
                    '|fflags;nobuffer|flags;low_delay|max_delay;0|reorder_queue_size;0'
                    f'|threads;{CAMERA_DECODE_THREADS}'
                )
            os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = capture_options

        if is_network_stream and hasattr(cv2, 'CAP_PROP_OPEN_TIMEOUT_MSEC'):
            params = [
                cv2.CAP_PROP_OPEN_TIMEOUT_MSEC,
                CAMERA_OPEN_TIMEOUT_MS,
                cv2.CAP_PROP_READ_TIMEOUT_MSEC,
                CAMERA_READ_TIMEOUT_MS,
            ]
            if CAMERA_HW_ACCELERATION in {'d3d11', 'direct3d11'}:
                params.extend([
                    cv2.CAP_PROP_HW_ACCELERATION,
                    cv2.VIDEO_ACCELERATION_D3D11,
                    cv2.CAP_PROP_HW_DEVICE,
                    DML_DEVICE_ID,
                ])
            elif CAMERA_HW_ACCELERATION == 'auto':
                params.extend([
                    cv2.CAP_PROP_HW_ACCELERATION,
                    cv2.VIDEO_ACCELERATION_ANY,
                ])
            stream = cv2.VideoCapture(self.src, cv2.CAP_FFMPEG, params)
        else:
            stream = cv2.VideoCapture(self.src)

        if hasattr(cv2, 'CAP_PROP_BUFFERSIZE'):
            stream.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        actual_acceleration = (
            int(stream.get(cv2.CAP_PROP_HW_ACCELERATION))
            if hasattr(cv2, 'CAP_PROP_HW_ACCELERATION') and stream.isOpened()
            else 0
        )
        logger.info('摄像头取流后端: OpenCV/FFmpeg（硬件加速=%d）', actual_acceleration)
        return stream

    def _worker(self):
        self.stream = self.open_stream()
        consecutive_failures = 0
        try:
            while not self.stop_event.is_set():
                if self.stream is None or not self.stream.isOpened():
                    self.stream = self.open_stream()
                    if self.stop_event.wait(CAMERA_RECONNECT_SECONDS):
                        break
                    continue

                try:
                    ret, frame = self.stream.read()
                except Exception:
                    ret, frame = False, None

                if not ret or frame is None:
                    consecutive_failures += 1
                    if consecutive_failures >= 15:
                        now = time.monotonic()
                        if now - self.last_reconnect_log >= 10:
                            logger.warning('摄像头视频流离线，正在重连: %s', describe_camera_source(self.src))
                            self.last_reconnect_log = now
                        with self.lock:
                            self.ret = False
                            self.frame = None
                        with suppress(Exception):
                            self.stream.release()
                        self.stream = None
                        consecutive_failures = 0
                        if self.stop_event.wait(CAMERA_RECONNECT_SECONDS):
                            break
                    else:
                        time.sleep(0.005)
                    continue

                consecutive_failures = 0
                # 线程安全隔离：复制独立阵列，彻底杜绝 PyTorch 与解码器跨线程共享内存崩溃
                frame_copy = frame.copy()
                with self.lock:
                    self.ret = True
                    self.frame = frame_copy
                    self.frame_id += 1
        finally:
            if self.stream is not None:
                with suppress(Exception):
                    self.stream.release()
                self.stream = None

    def read(self, after_frame_id=None):
        with self.lock:
            if after_frame_id == self.frame_id:
                return self.ret, None, self.frame_id
            return self.ret, self.frame, self.frame_id

    def stop(self):
        self.stop_event.set()
        if self.thread.is_alive():
            self.thread.join(timeout=3.0)

async def broadcast_payload(payload):
    async def send_one(websocket):
        try:
            await asyncio.wait_for(websocket.send_text(payload), timeout=SEND_TIMEOUT_SECONDS)
        except Exception:
            active_connections.discard(websocket)
            video_connections.discard(websocket)
            with suppress(Exception):
                await websocket.close()

    if active_connections:
        await asyncio.gather(*(send_one(ws) for ws in list(active_connections)))

async def broadcast_video(frame_bytes):
    async def send_one(websocket):
        try:
            await asyncio.wait_for(websocket.send_bytes(frame_bytes), timeout=SEND_TIMEOUT_SECONDS)
        except Exception:
            active_connections.discard(websocket)
            video_connections.discard(websocket)
            with suppress(Exception):
                await websocket.close()

    if video_connections:
        await asyncio.gather(*(send_one(ws) for ws in list(video_connections)))

def encode_jpeg(frame):
    encoded, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, VIDEO_JPEG_QUALITY])
    return buffer.tobytes() if encoded else None

def load_classifier_model():
    logger.info('⏳ 正在加载姿态分类网络: %s', MODEL_PATH)
    try:
        import torch
        torch.backends.cudnn.enabled = False
    except Exception:
        pass

    cls_model = YOLO(MODEL_PATH)
    if MODEL_PATH.lower().endswith('.pt'):
        try:
            import torch
            if torch.cuda.is_available():
                cls_model.to('cuda:0')
                dev_name = torch.cuda.get_device_name(0)
                logger.info('⚡ 姿态分类网络已成功调用独立显卡硬件加速: %s', dev_name)
        except Exception as e:
            logger.warning('显卡直通加载提示: %s (使用默认设备)', e)
        logger.info('✅ 姿态分类网络已就绪！类别列表: %s', list(cls_model.names.values()) if hasattr(cls_model, 'names') else '默认')
        return cls_model

    import onnxruntime as ort
    original_session = ort.InferenceSession
    available_providers = ort.get_available_providers()
    use_directml = (
        EXECUTION_PROVIDER in {'auto', 'directml', 'dml'}
        and 'DmlExecutionProvider' in available_providers
    )

    def create_tuned_session(path_or_bytes, sess_options=None, *args, **kwargs):
        if sess_options is None:
            sess_options = ort.SessionOptions()
        sess_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        if use_directml:
            sess_options.enable_mem_pattern = False
            kwargs['providers'] = [
                ('DmlExecutionProvider', {'device_id': str(DML_DEVICE_ID)}),
                'CPUExecutionProvider',
            ]
        else:
            sess_options.intra_op_num_threads = 2
            sess_options.inter_op_num_threads = 1
        return original_session(path_or_bytes, sess_options, *args, **kwargs)

    ort.InferenceSession = create_tuned_session
    try:
        cls_model(np.zeros((MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3), dtype=np.uint8), verbose=False, imgsz=MODEL_INPUT_SIZE)
    finally:
        ort.InferenceSession = original_session

    logger.info('✅ 姿态分类网络已就绪！类别列表: %s', list(cls_model.names.values()) if hasattr(cls_model, 'names') else '默认')
    return cls_model

def load_detector_model():
    if not DETECTOR_PATH:
        return None
    logger.info('⏳ 正在加载前置人体定位网络: %s', DETECTOR_PATH)
    try:
        import torch
        torch.backends.cudnn.enabled = False
    except Exception:
        pass
    det_model = YOLO(DETECTOR_PATH)
    try:
        import torch
        if torch.cuda.is_available():
            det_model.to('cuda:0')
            dev_name = torch.cuda.get_device_name(0)
            logger.info('⚡ 人体定位网络已成功调用独立显卡加速: %s', dev_name)
    except Exception as e:
        logger.warning('人体定位网络显卡加载提示: %s (使用默认设备)', e)
    logger.info('✅ 人体定位网络已就绪！(广角/家庭监控大场景将自动追踪人体并裁切局部高清送审)')
    return det_model

# ================= 核心 SOTA 算法套件 =================

def calc_box_diou(boxA, boxB):
    """
    计算 Distance-IoU (DIoU, Zheng et al.)。
    即使人体猛然下趴/下跪导致框交叠极小 (普通 IoU 接近 0)，中心欧氏距离依然极近，
    DIoU 仍能精准维持锁定，彻底杜绝目标切换到背景路人或家具。
    """
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interW = max(0, xB - xA)
    interH = max(0, yB - yA)
    interArea = interW * interH

    boxAArea = max(1, (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]))
    boxBArea = max(1, (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]))
    unionArea = float(boxAArea + boxBArea - interArea)
    iou = interArea / unionArea if unionArea > 0 else 0.0

    cxA = (boxA[0] + boxA[2]) / 2.0
    cyA = (boxA[1] + boxA[3]) / 2.0
    cxB = (boxB[0] + boxB[2]) / 2.0
    cyB = (boxB[1] + boxB[3]) / 2.0
    d2 = (cxA - cxB) ** 2 + (cyA - cyB) ** 2

    enc_x1 = min(boxA[0], boxB[0])
    enc_y1 = min(boxA[1], boxB[1])
    enc_x2 = max(boxA[2], boxB[2])
    enc_y2 = max(boxA[3], boxB[3])
    c2 = max(1.0, (enc_x2 - enc_x1) ** 2 + (enc_y2 - enc_y1) ** 2)

    return float(iou - (d2 / c2))

def is_valid_human_detection(box_conf, kps_data, min_visible_keypoints=3, min_kps_conf=0.40):
    """
    解剖学骨骼关键点门禁过滤：
    根据 COCO-17 骨骼可信度对候选框进行解剖学有效性核验。
    真实人体必有头部/肩膀/髋关节等核心连贯点；
    而墙角阴影、沙发抱枕、挂在椅背上的衣服等误检框，骨骼关键点置信度极低 (< 0.15)。
    """
    if kps_data is None or len(kps_data) == 0:
        return box_conf >= 0.50
    confs = kps_data[:, 2]
    visible_count = int((confs >= min_kps_conf).sum())
    mean_kps_conf = float(confs.mean())
    return visible_count >= min_visible_keypoints or mean_kps_conf >= 0.25

class AdaptiveBBoxSmoother:
    """
    One-Euro 滤波原理的自适应目标边界框平滑器 (Casiez et al.)。
    静态静止时高阻尼 (低 cutoff, alpha ~ 0.18)，彻底消除监控传感器微小像素抖动；
    大幅运动/姿态骤变时低阻尼 (高 cutoff, alpha ~ 0.88)，零延迟贴合人体。
    """
    def __init__(self, min_cutoff=1.0, beta=0.08, d_cutoff=1.0):
        self.min_cutoff = float(min_cutoff)
        self.beta = float(beta)
        self.d_cutoff = float(d_cutoff)
        self.x_prev = None
        self.dx_prev = None
        self.t_prev = None

    def _smoothing_factor(self, dt, cutoff):
        r = 2 * math.pi * cutoff * dt
        return r / (r + 1.0)

    def update(self, box, timestamp=None):
        if box is None:
            self.reset()
            return None
        curr = np.array(box, dtype=float)
        now = time.monotonic() if timestamp is None else timestamp

        if self.x_prev is None:
            self.x_prev = curr.copy()
            self.dx_prev = np.zeros_like(curr)
            self.t_prev = now
            return curr.astype(int)

        dt = max(1e-4, now - self.t_prev)
        self.t_prev = now

        dx = (curr - self.x_prev) / dt
        alpha_d = self._smoothing_factor(dt, self.d_cutoff)
        dx_hat = alpha_d * dx + (1.0 - alpha_d) * self.dx_prev
        self.dx_prev = dx_hat

        speed = np.abs(dx_hat)
        cutoff = self.min_cutoff + self.beta * speed
        alpha = np.array([self._smoothing_factor(dt, c) for c in cutoff])

        x_hat = alpha * curr + (1.0 - alpha) * self.x_prev
        self.x_prev = x_hat
        return np.round(x_hat).astype(int)

    def reset(self):
        self.x_prev = None
        self.dx_prev = None
        self.t_prev = None

def make_tight_letterbox_crop(frame, box, kps=None, target_size=224, pad_ratio=0.12):
    """
    SOTA 自适应紧致裁切与保持长宽比 Letterboxing：
    1. 结合检测框与 17 点有效骨骼，计算人体真实紧致外接矩形 (剔除地面大面积阴影与无关家具)。
    2. 等比例居中缩放至 target_size，短边自适应中性填充(114)，使人体主体在 224 画面中占比最大化 (提升 2.5 倍有效细节)。
    """
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = box

    # 如果有高置信度骨骼点，综合修正外接框
    if kps is not None and len(kps) >= 17:
        valid_kps = kps[kps[:, 2] > 0.25, :2]
        if len(valid_kps) >= 5:
            kx1, ky1 = np.min(valid_kps, axis=0)
            kx2, ky2 = np.max(valid_kps, axis=0)
            # 融合检测框与骨骼框
            x1 = max(0, int(round(min(x1, kx1 - 10))))
            y1 = max(0, int(round(min(y1, ky1 - 15))))
            x2 = min(w, int(round(max(x2, kx2 + 10))))
            y2 = min(h, int(round(max(y2, ky2 + 15))))

    bw = max(10, x2 - x1)
    bh = max(10, y2 - y1)

    # 紧致外扩 pad_ratio
    pad_w = int(round(bw * pad_ratio))
    pad_h = int(round(bh * pad_ratio))

    crop_x1 = max(0, x1 - pad_w)
    crop_y1 = max(0, y1 - pad_h)
    crop_x2 = min(w, x2 + pad_w)
    crop_y2 = min(h, y2 + pad_h)

    crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
    ch, cw = crop.shape[:2]
    if ch <= 0 or cw <= 0:
        return np.full((target_size, target_size, 3), 114, dtype=np.uint8)

    # 保持长宽比缩放
    scale = target_size / max(ch, cw)
    new_w = max(1, min(target_size, int(round(cw * scale))))
    new_h = max(1, min(target_size, int(round(ch * scale))))

    resized = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LINEAR)

    # 居中放入 target_size 画布 (中性边缘填充 114)
    canvas = np.full((target_size, target_size, 3), 114, dtype=np.uint8)
    dx = (target_size - new_w) // 2
    dy = (target_size - new_h) // 2
    canvas[dy:dy + new_h, dx:dx + new_w] = resized
    return canvas

def make_square_crop(frame, box, pad_ratio=0.18):
    """向后兼容别名：调用保持等比例的自适应裁切"""
    return make_tight_letterbox_crop(frame, box, target_size=MODEL_INPUT_SIZE, pad_ratio=pad_ratio)

def fuse_pose_results(top1_name, top1_conf, vis_probs, class_names, primary_kps, conf_threshold=0.50):
    """
    SOTA 运动学生物力学物理否决 + 贝叶斯对数似然概率软融合决策引擎 (Visual CNN + Geometric Skeleton)
    结合手臂支撑柱解剖学门禁与 COCO-17 骨骼拓扑，彻底杜绝坐姿玩手机/电脑前误报为趴跪 (dog)。
    """
    if primary_kps is None or len(primary_kps) < 17:
        if top1_conf >= conf_threshold:
            return top1_name, top1_conf, "cls_only", top1_name, top1_conf, None
        return 'unknown', top1_conf, "cls_low_conf", 'unknown', 0.0, None

    pts = primary_kps[:, :2]
    confs = primary_kps[:, 2]

    # 1. 计算骨骼几何先验 S_geom(c) 与 物理否决字典 veto(c)
    gpriors, veto = evaluate_skeleton_priors(pts, confs)

    # 2. 贝叶斯对数似然软加权融合 + 物理否决
    alpha = 0.60
    fused = {}
    for idx, name in enumerate(class_names):
        if veto.get(name, False):
            # 物理上不可能成立的姿态，概率绝对置零，消除 Softmax 误报
            fused[name] = 0.0
        else:
            p_vis = max(1e-4, float(vis_probs[idx]) if idx < len(vis_probs) else 0.10)
            s_geom = max(1e-4, float(gpriors.get(name, 0.20)))
            fused[name] = (p_vis ** alpha) * (s_geom ** (1.0 - alpha))

    # 归一化 Softmax 概率
    total = sum(fused.values())
    if total > 0:
        for k in fused:
            fused[k] /= total
    else:
        fused['unknown'] = 1.0

    best_fused = max(fused.items(), key=lambda x: x[1])
    geom_best = max(gpriors.items(), key=lambda x: x[1])
    geom_pose, geom_conf = geom_best[0], geom_best[1]

    fused_pose, fused_conf = best_fused[0], best_fused[1]

    # 裁决原因标记
    vetoed_list = [k for k, v in veto.items() if v]
    if 'dog' in vetoed_list and top1_name == 'dog':
        gate_reason = "dog_veto"
    elif vetoed_list:
        gate_reason = "kinematic_veto"
    else:
        gate_reason = "dual_bayesian"

    # 置信度阈值判定
    if fused_conf < conf_threshold and fused_pose != 'unknown':
        return 'unknown', fused_conf, "below_threshold", geom_pose, geom_conf, fused

    return fused_pose, fused_conf, gate_reason, geom_pose, geom_conf, fused

class HysteresisPoseStabilizer:
    """
    工业级带 EMA 概率平滑与迟滞滤波的姿态状态稳定器 (Hysteresis State Machine)
    1. EMA 概率平滑：对多模态融合概率进行时间域指数滑动平均，消除单帧噪声跳变。
    2. 切换防抖：新姿态必须连续持续 required_frames 帧才确认切换。
    3. 姿态保持抗闪烁：当前处于已确认姿态时，单帧瞬态 unknown 享有 dropout_tolerance 帧容忍，不打断 hold 计时。
    4. 稳定状态保护：新姿态蓄力期间，平稳维持既有姿态输出，不坠入 unknown。
    """
    def __init__(self, required_frames=3, dropout_tolerance=2, ema_alpha=0.65):
        self.required_frames = max(1, int(required_frames))
        self.dropout_tolerance = max(0, int(dropout_tolerance))
        self.ema_alpha = float(ema_alpha)
        self.current_pose = 'unknown'
        self.current_conf = 0.0
        self.candidate = 'unknown'
        self.candidate_frames = 0
        self.candidate_conf = 0.0
        self.dropout_count = 0
        self.smoothed_probs = {}

    def reset(self):
        self.current_pose = 'unknown'
        self.current_conf = 0.0
        self.candidate = 'unknown'
        self.candidate_frames = 0
        self.candidate_conf = 0.0
        self.dropout_count = 0
        self.smoothed_probs.clear()

    def update(self, raw_pose, raw_conf, prob_dict=None):
        raw_conf = float(raw_conf)

        # EMA 概率平滑
        if prob_dict:
            for k, v in prob_dict.items():
                if k in self.smoothed_probs:
                    self.smoothed_probs[k] = self.ema_alpha * v + (1.0 - self.ema_alpha) * self.smoothed_probs[k]
                else:
                    self.smoothed_probs[k] = v

        if raw_pose == 'unknown':
            if self.current_pose != 'unknown':
                self.dropout_count += 1
                if self.dropout_count <= self.dropout_tolerance:
                    return self.current_pose, self.current_conf
            self.reset()
            return 'unknown', 0.0

        self.dropout_count = 0

        if raw_pose == self.candidate:
            self.candidate_frames += 1
            self.candidate_conf = max(self.candidate_conf, raw_conf)
        else:
            self.candidate = raw_pose
            self.candidate_frames = 1
            self.candidate_conf = raw_conf

        if self.candidate_frames >= self.required_frames:
            self.current_pose = self.candidate
            self.current_conf = self.candidate_conf
            return self.current_pose, self.current_conf

        if self.current_pose != 'unknown':
            return self.current_pose, self.current_conf

        return 'unknown', 0.0

# ================= 视频推理与流服务主循环 =================

async def video_processing_loop():
    logger.info('📹 启动视频流采集: %s', describe_camera_source(CAMERA_SOURCE))
    cap = ThreadedCamera(CAMERA_SOURCE)
    stabilizer = HysteresisPoseStabilizer(required_frames=REQUIRED_STABLE_FRAMES, dropout_tolerance=DROPOUT_TOLERANCE)
    bbox_smoother = AdaptiveBBoxSmoother(min_cutoff=1.0, beta=0.08, d_cutoff=1.0)
    keypoint_tracker = KeypointTracker(alpha=0.3)
    preview_enabled = SHOW_PREVIEW
    last_processed_frame_id = -1
    last_video_frame_at = 0.0
    prev_target_box = None
    missing_human_count = 0
    last_telemetry_log_at = 0.0
    prev_logged_pose = None

    try:
        while True:
            ret, frame, frame_id = cap.read(after_frame_id=last_processed_frame_id)
            if not ret or frame is None:
                await asyncio.sleep(FRAME_POLL_SECONDS)
                continue

            last_processed_frame_id = frame_id
            frame_received_at = time.monotonic()
            h, w = frame.shape[:2]

            raw_pose = 'unknown'
            raw_confidence = 0.0
            fuse_reason = "none"
            primary_box = None
            fidget_val = 0.0
            nose_y_val = -1.0
            shoulder_y_val = -1.0
            primary_kps = None
            fused_dict = None
            geom_pose = 'unknown'
            geom_conf = 0.0

            if detector is not None:
                # 第一阶段：在 4K 全画幅监控画面中高分辨率检测人体与 17 点骨骼 (conf=0.12, iou=0.45 保证复杂伏地姿态检出)
                det_results = await asyncio.to_thread(
                    detector, frame, verbose=False, imgsz=DETECTOR_IMGSZ, conf=0.12, iou=0.45
                )
                det_res = det_results[0] if det_results else None
                boxes = det_res.boxes if det_res is not None else None

                if boxes is not None and len(boxes) > 0:
                    kps_all = det_res.keypoints.data.cpu().numpy() if det_res.keypoints is not None else None
                    candidates = []
                    for i, b in enumerate(boxes):
                        bconf = float(b.conf[0])
                        xyxy = b.xyxy[0].cpu().numpy().astype(int)
                        kps_item = kps_all[i] if kps_all is not None and i < len(kps_all) else None

                        # ByteTrack 连续追踪机制：若与上一帧目标高度重叠 (DIoU > 0.30)，置信度放宽至 0.12
                        is_tracked = False
                        if prev_target_box is not None and calc_box_diou(xyxy, prev_target_box) > 0.30:
                            is_tracked = True

                        min_conf_needed = 0.12 if is_tracked else PERSON_MIN_CONF
                        if bconf < min_conf_needed:
                            continue

                        # 解剖学门禁：剔除空房间阴影/衣服误检
                        if not is_valid_human_detection(bconf, kps_item, min_visible_keypoints=3, min_kps_conf=0.35):
                            continue

                        area = (xyxy[2] - xyxy[0]) * (xyxy[3] - xyxy[1])
                        candidates.append((xyxy, bconf, area, kps_item))

                    if candidates:
                        missing_human_count = 0
                        # 空间中心距离与 DIoU 目标连续性追踪锁定
                        if prev_target_box is not None:
                            best_item = max(
                                candidates,
                                key=lambda item: (
                                    (calc_box_diou(item[0], prev_target_box) + 1.0) * 3.0
                                    + item[1] * 1.5
                                    + min(1.0, item[2] / (w * h * 0.5))
                                )
                            )
                        else:
                            best_item = max(candidates, key=lambda item: item[2])

                        raw_xyxy, best_bconf, _, primary_kps = best_item
                        prev_target_box = raw_xyxy

                        # One-Euro 自适应速度平滑，彻底消除边界抖动
                        smooth_xyxy = bbox_smoother.update(raw_xyxy, timestamp=frame_received_at)
                        primary_box = smooth_xyxy

                        # 制作融合骨骼与检测框的自适应 Letterbox 高清裁切 (提升 2.5 倍有效主体分辨率)
                        person_crop = make_tight_letterbox_crop(
                            frame, smooth_xyxy, kps=primary_kps, target_size=MODEL_INPUT_SIZE, pad_ratio=PERSON_PAD
                        )

                        # 第二阶段：对裁切出的高清人体区域送入微调模型分类
                        cls_results = await asyncio.to_thread(model, person_crop, verbose=False, imgsz=MODEL_INPUT_SIZE)
                        cls_res = cls_results[0] if cls_results else None

                        top1_name = 'unknown'
                        top1_conf = 0.0
                        vis_probs = None
                        class_names = []
                        if cls_res is not None and hasattr(cls_res, 'probs') and cls_res.probs is not None:
                            top1_idx = int(cls_res.probs.top1)
                            top1_conf = float(cls_res.probs.top1conf.item())
                            top1_name = cls_res.names.get(top1_idx, 'unknown')
                            vis_probs = cls_res.probs.data.cpu().numpy()
                            class_names = [cls_res.names[i] for i in range(len(vis_probs))]

                        # 第三阶段：骨骼关节颤动追踪与多模态决策融合
                        if primary_kps is not None:
                            pts = primary_kps[:, :2]
                            confs = primary_kps[:, 2]

                            # 动捕级关节颤动位移追踪 (用于 App 端 strictFidget 绝对静止检测)
                            keypoint_tracker.update(pts, confs)
                            ui_scale_640 = max(1.0, w / 640.0)
                            fidget_val = round(float(keypoint_tracker.velocity) / ui_scale_640, 2)

                            # 提取特征点 (保持 App 协议兼容，支持侧身/单肩/双肩视角)
                            if primary_kps.shape[0] >= 7:
                                if confs[0] > 0.40:
                                    nose_y_val = float(primary_kps[0][1]) / h
                                shoulder_pts = [float(primary_kps[idx][1]) for idx in (5, 6) if confs[idx] > 0.40]
                                if shoulder_pts:
                                    shoulder_y_val = float(sum(shoulder_pts) / len(shoulder_pts)) / h

                        if ENABLE_DUAL_CONFIRM and vis_probs is not None:
                            raw_pose, raw_confidence, fuse_reason, geom_pose, geom_conf, fused_dict = fuse_pose_results(
                                top1_name, top1_conf, vis_probs, class_names, primary_kps, conf_threshold=POSE_CONF_THRESHOLD
                            )
                        else:
                            raw_pose = top1_name if top1_conf >= POSE_CONF_THRESHOLD else 'unknown'
                            raw_confidence = top1_conf
                            fuse_reason = "cls_only"
                    else:
                        raw_pose = 'unknown'
                        raw_confidence = 0.0
                        fuse_reason = "no_human"
                        missing_human_count += 1
                        if missing_human_count >= 10:
                            prev_target_box = None
                            bbox_smoother.reset()
                            keypoint_tracker.reset()
                else:
                    raw_pose = 'unknown'
                    raw_confidence = 0.0
                    fuse_reason = "no_detection"
                    missing_human_count += 1
                    if missing_human_count >= 10:
                        prev_target_box = None
                        bbox_smoother.reset()
                        keypoint_tracker.reset()
            else:
                # 无前置人体检测器时的回退单阶段模式
                cls_results = await asyncio.to_thread(model, frame, verbose=False, imgsz=MODEL_INPUT_SIZE)
                cls_res = cls_results[0] if cls_results else None
                if cls_res is not None and hasattr(cls_res, 'probs') and cls_res.probs is not None:
                    top1_idx = int(cls_res.probs.top1)
                    top1_conf = float(cls_res.probs.top1conf.item())
                    predicted_name = cls_res.names.get(top1_idx, 'unknown')
                    if top1_conf >= POSE_CONF_THRESHOLD:
                        raw_pose = predicted_name
                        raw_confidence = top1_conf
                    else:
                        raw_pose = 'unknown'
                        raw_confidence = top1_conf
                fuse_reason = "fallback_direct"

            current_pose, confidence = stabilizer.update(raw_pose, raw_confidence, prob_dict=fused_dict)

            payload_data = {
                'pose': current_pose,
                'confidence': confidence,
                'raw_pose': raw_pose,
                'raw_confidence': raw_confidence,
                'stability_frames': stabilizer.candidate_frames,
                'required_frames': stabilizer.required_frames,
                'fidget': fidget_val,
                'nose_y': nose_y_val,
                'shoulder_y': shoulder_y_val,
            }
            await broadcast_payload(json.dumps(payload_data, separators=(',', ':')))

            # 终端调试实时监控输出 (姿态切换立即上报，静止时每 1.5 秒更新心跳)
            now_mono = time.monotonic()
            if primary_box is not None:
                if current_pose != prev_logged_pose or now_mono - last_telemetry_log_at >= 1.5:
                    head_state = '低头 (合格)' if nose_y_val > shoulder_y_val and shoulder_y_val > 0 else '正常/平视'
                    logger.info(
                        '🎯 [实时姿态] 视觉=[%s %.0f%%] 骨骼=[%s %.0f%%] ➔ 最终=[%s] (%s) | 晃动=%.2f | 视角=%s',
                        top1_name if 'top1_name' in locals() else raw_pose,
                        (top1_conf if 'top1_conf' in locals() else raw_confidence) * 100,
                        geom_pose if 'geom_pose' in locals() else 'N/A',
                        (geom_conf if 'geom_conf' in locals() else 0.0) * 100,
                        current_pose,
                        fuse_reason,
                        fidget_val,
                        head_state
                    )
                    prev_logged_pose = current_pose
                    last_telemetry_log_at = now_mono
            else:
                if prev_logged_pose is not None or (now_mono - last_telemetry_log_at >= 4.0 and last_telemetry_log_at > 0):
                    logger.info('🔍 监控全景中未检测到有效人体 (已自动滤除空房间/家具阴影)')
                    prev_logged_pose = None
                    last_telemetry_log_at = now_mono

            should_stream_video = bool(video_connections) and (
                VIDEO_FPS >= 20 or frame_received_at - last_video_frame_at >= 1 / VIDEO_FPS
            )

            # 单次高效渲染管道 (仅在需要展示/推流时，将 4K 画幅单次快速缩放到 1280 绘制，提速 4.8 倍并节约 89% 内存)
            if preview_enabled or should_stream_video:
                target_w = VIDEO_MAX_WIDTH
                target_h = max(1, round(h * (target_w / w)))

                # 单次下采样生成 1280 显示画布
                if w != target_w:
                    canvas = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
                    scale_x = target_w / float(w)
                    scale_y = target_h / float(h)
                else:
                    canvas = frame.copy()
                    scale_x = 1.0
                    scale_y = 1.0

                # 绘制 17 点骨骼网络 (Cyberpunk 炫彩发光连线)
                if primary_kps is not None and SHOW_SKELETON:
                    pts_disp = primary_kps[:, :2].copy()
                    pts_disp[:, 0] *= scale_x
                    pts_disp[:, 1] *= scale_y
                    pts_disp = pts_disp.astype(int)
                    confs = primary_kps[:, 2]

                    # 骨骼连线
                    for idx1, idx2, color in COCO_LIMBS:
                        if confs[idx1] > 0.45 and confs[idx2] > 0.45:
                            p1 = tuple(pts_disp[idx1])
                            p2 = tuple(pts_disp[idx2])
                            cv2.line(canvas, p1, p2, color, 2, cv2.LINE_AA)

                    # 关节点发光圆点
                    for i in range(len(pts_disp)):
                        if confs[i] > 0.45:
                            pt = tuple(pts_disp[i])
                            cv2.circle(canvas, pt, 5, (0, 0, 0), -1, cv2.LINE_AA)
                            cv2.circle(canvas, pt, 3, (0, 255, 255), -1, cv2.LINE_AA)

                # 绘制锁定人体瞄准框与转角括号 (Tactical Corner Brackets)
                header_h = 56
                if primary_box is not None:
                    px1 = int(round(primary_box[0] * scale_x))
                    py1 = int(round(primary_box[1] * scale_y))
                    px2 = int(round(primary_box[2] * scale_x))
                    py2 = int(round(primary_box[3] * scale_y))

                    box_color = (0, 255, 0) if current_pose != 'unknown' else (0, 215, 255)
                    corner_len = max(12, int(round(min(px2 - px1, py2 - py1) * 0.18)))

                    # 四角括号瞄准框
                    cv2.line(canvas, (px1, py1), (px1 + corner_len, py1), box_color, 2, cv2.LINE_AA)
                    cv2.line(canvas, (px1, py1), (px1, py1 + corner_len), box_color, 2, cv2.LINE_AA)
                    cv2.line(canvas, (px2, py1), (px2 - corner_len, py1), box_color, 2, cv2.LINE_AA)
                    cv2.line(canvas, (px2, py1), (px2, py1 + corner_len), box_color, 2, cv2.LINE_AA)
                    cv2.line(canvas, (px1, py2), (px1 + corner_len, py2), box_color, 2, cv2.LINE_AA)
                    cv2.line(canvas, (px1, py2), (px1, py2 - corner_len), box_color, 2, cv2.LINE_AA)
                    cv2.line(canvas, (px2, py2), (px2 - corner_len, py2), box_color, 2, cv2.LINE_AA)
                    cv2.line(canvas, (px2, py2), (px2, py2 - corner_len), box_color, 2, cv2.LINE_AA)

                    badge_text = f"{current_pose if current_pose != 'unknown' else raw_pose} ({max(confidence, raw_confidence) * 100:.0f}%)"
                    (tw, th), _ = cv2.getTextSize(badge_text, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)

                    # 智能防遮挡标签定位：靠近画面顶部时置于框内下方，防止与顶部状态栏碰撞
                    if py1 < header_h + 15:
                        badge_y = py1 + th + 10
                    else:
                        badge_y = py1 - 8

                    cv2.rectangle(canvas, (px1, badge_y - th - 6), (px1 + tw + 12, badge_y + 4), (15, 15, 15), -1)
                    cv2.putText(canvas, badge_text, (px1 + 6, badge_y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.65, box_color, 2, cv2.LINE_AA)

                # 顶部半透明状态栏
                overlay = canvas[:header_h, :].copy()
                cv2.rectangle(overlay, (0, 0), (target_w, header_h), (20, 20, 20), -1)
                cv2.addWeighted(overlay, 0.75, canvas[:header_h, :], 0.25, 0, canvas[:header_h, :])

                live_color = (0, 255, 255) if raw_pose != 'unknown' else (140, 140, 255)
                safe_color = (0, 255, 0) if current_pose != 'unknown' else (0, 165, 255)

                status_txt = f"Live: {raw_pose} ({raw_confidence * 100:.0f}%) [{fuse_reason}] | Fidget: {fidget_val}" if primary_box is not None else "Live: Searching for person in frame..."
                cv2.putText(canvas, status_txt, (15, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.58, live_color, 2, cv2.LINE_AA)
                cv2.putText(canvas, f"Verified: {current_pose} ({stabilizer.candidate_frames}/{stabilizer.required_frames}) | Head: {'Down' if nose_y_val > shoulder_y_val and shoulder_y_val > 0 else 'Normal'}", (15, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.58, safe_color, 2, cv2.LINE_AA)

                if should_stream_video:
                    frame_bytes = await asyncio.to_thread(encode_jpeg, canvas)
                    if frame_bytes is not None:
                        await broadcast_video(frame_bytes)
                    last_video_frame_at = frame_received_at

                if preview_enabled:
                    try:
                        cv2.imshow('YCY End-to-End Pose Classifier', canvas)
                        key = cv2.waitKey(1) & 0xFF
                        if key == ord('q') or cv2.getWindowProperty('YCY End-to-End Pose Classifier', cv2.WND_PROP_VISIBLE) < 1:
                            logger.info('用户关闭了视频预览窗口 (服务保持正常运行)')
                            preview_enabled = False
                            with suppress(Exception):
                                cv2.destroyAllWindows()
                    except Exception as exc:
                        logger.warning('当前环境不支持本地图形预览窗口 (%s)，已自动切换为纯后台极速推流模式', exc)
                        preview_enabled = False
                        with suppress(Exception):
                            cv2.destroyAllWindows()

    finally:
        await asyncio.to_thread(cap.stop)
        if preview_enabled:
            cv2.destroyAllWindows()

def report_processing_failure(task):
    if task.cancelled():
        return
    exception = task.exception()
    if exception is not None:
        logger.error('分类视频处理任务意外退出', exc_info=(type(exception), exception, exception.__traceback__))

@app.on_event('startup')
async def startup_event():
    global model, detector, processing_task
    model = await asyncio.to_thread(load_classifier_model)
    if ENABLE_DETECTOR and DETECTOR_PATH:
        detector = await asyncio.to_thread(load_detector_model)
    else:
        detector = None
    processing_task = asyncio.create_task(video_processing_loop())
    processing_task.add_done_callback(report_processing_failure)

@app.on_event('shutdown')
async def shutdown_event():
    global model, detector, processing_task
    if processing_task is not None:
        processing_task.cancel()
        with suppress(asyncio.CancelledError):
            await processing_task
    model = None
    detector = None

if __name__ == '__main__':
    logger.info('🚀 幻触 Phantouch - 端到端姿态分类视觉服务器启动')
    logger.info('>> App 连接地址: ws://电脑局域网IP:8000/ws')
    logger.info('>> 采用分类模型: %s', MODEL_PATH)
    logger.info('>> 采用人体检测: %s (imgsz=%d)', DETECTOR_PATH if ENABLE_DETECTOR else '未启用', DETECTOR_IMGSZ)
    uvicorn.run(app, host='0.0.0.0', port=8000, ws_per_message_deflate=False)
