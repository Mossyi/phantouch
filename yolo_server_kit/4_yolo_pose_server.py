import cv2
import json
import asyncio
import os
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from ultralytics import YOLO
import uvicorn
import logging
import threading
import time
from contextlib import suppress

try:
    from pose_rules import KeypointTracker, PoseStabilizer, check_pose
    from vision_protocol import MAX_CONTROL_MESSAGE_BYTES, parse_video_subscription
    from camera_source import build_camera_source, describe_camera_source, load_local_camera_env
except ImportError:
    from yolo_server_kit.pose_rules import KeypointTracker, PoseStabilizer, check_pose
    from yolo_server_kit.vision_protocol import MAX_CONTROL_MESSAGE_BYTES, parse_video_subscription
    from yolo_server_kit.camera_source import build_camera_source, describe_camera_source, load_local_camera_env

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()

# ================= 配置区 =================
load_local_camera_env()
CAMERA_SOURCE = build_camera_source()
MODEL_PATH = os.getenv('YOLO_MODEL_PATH', 'yolov8n-pose.pt')
MODEL_INPUT_SIZE = min(1280, max(320, int(os.getenv('YOLO_MODEL_INPUT_SIZE', '320'))))
EXECUTION_PROVIDER = os.getenv('YOLO_EXECUTION_PROVIDER', 'auto').strip().lower()
DML_DEVICE_ID = max(0, int(os.getenv('YOLO_DML_DEVICE_ID', '0')))
PERSON_CONF_THRESHOLD = min(1.0, max(0.0, float(os.getenv('YOLO_PERSON_CONFIDENCE', '0.6'))))
SHOW_PREVIEW = os.getenv('YOLO_SHOW_PREVIEW', '1').strip().lower() not in {'0', 'false', 'no'}
MAX_CONNECTIONS = max(1, int(os.getenv('YOLO_MAX_CONNECTIONS', '8')))
SEND_TIMEOUT_SECONDS = max(0.05, float(os.getenv('YOLO_SEND_TIMEOUT', '0.5')))
VIDEO_FPS = min(20.0, max(1.0, float(os.getenv('YOLO_VIDEO_FPS', '10'))))
VIDEO_MAX_WIDTH = min(1280, max(320, int(os.getenv('YOLO_VIDEO_WIDTH', '640'))))
VIDEO_JPEG_QUALITY = min(90, max(40, int(os.getenv('YOLO_VIDEO_QUALITY', '70'))))
CAMERA_OPEN_TIMEOUT_MS = max(1000, int(os.getenv('YOLO_CAMERA_OPEN_TIMEOUT_MS', '5000')))
CAMERA_READ_TIMEOUT_MS = max(1000, int(os.getenv('YOLO_CAMERA_READ_TIMEOUT_MS', '5000')))
CAMERA_RECONNECT_SECONDS = max(0.5, float(os.getenv('YOLO_CAMERA_RECONNECT_SECONDS', '2')))
FRAME_POLL_SECONDS = min(0.05, max(0.001, float(os.getenv('YOLO_FRAME_POLL_MS', '5')) / 1000))
CAMERA_LOW_LATENCY = os.getenv('YOLO_CAMERA_LOW_LATENCY', '1').strip().lower() not in {'0', 'false', 'no'}
CAMERA_BACKEND = os.getenv('YOLO_CAMERA_BACKEND', 'auto').strip().lower()
CAMERA_DECODE_THREADS = min(8, max(1, int(os.getenv('YOLO_CAMERA_DECODE_THREADS', '1'))))
CAMERA_HW_ACCELERATION = os.getenv('YOLO_CAMERA_HW_ACCELERATION', 'none').strip().lower()
ONNX_INTRA_OP_THREADS = min(8, max(1, int(os.getenv('YOLO_ONNX_THREADS', '2'))))
# ==========================================

active_connections = set()
video_connections = set()
processing_task = None
model = None

@app.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket):
    if len(active_connections) >= MAX_CONNECTIONS:
        await websocket.close(code=1013, reason='Too many clients')
        return
    await websocket.accept()
    active_connections.add(websocket)
    logger.info('📱 App 已连接到视觉监控系统')
    try:
        while True:
            message = await websocket.receive_text()
            if len(message.encode('utf-8')) > MAX_CONTROL_MESSAGE_BYTES:
                await websocket.close(code=1009, reason='Control message too large')
                return
            video_enabled = parse_video_subscription(message)
            if video_enabled is True:
                video_connections.add(websocket)
                logger.info('🎞️ App 已打开 YOLO 视频预览')
            elif video_enabled is False:
                video_connections.discard(websocket)
                logger.info('🎞️ App 已关闭 YOLO 视频预览')
    except WebSocketDisconnect:
        logger.info('📱 App 断开连接')
    except Exception as exc:
        logger.warning(f'📱 WebSocket 连接异常: {exc}')
    finally:
        active_connections.discard(websocket)
        video_connections.discard(websocket)

class PyAvCapture:
    """Minimal VideoCapture-compatible RTSP reader with explicit low-latency options."""

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
                'reorder_queue_size': '0',
                'analyzeduration': '0',
                'probesize': '32768',
            })
        timeout = (CAMERA_OPEN_TIMEOUT_MS / 1000, CAMERA_READ_TIMEOUT_MS / 1000)
        self.container = av.open(src, options=options, timeout=timeout)
        self.video_stream = self.container.streams.video[0]
        # Slice threading preserves frame order and avoids decode-ahead buffering.
        self.video_stream.thread_type = 'SLICE'
        self.video_stream.codec_context.thread_count = CAMERA_DECODE_THREADS
        self.frames = self.container.decode(self.video_stream)

    def read(self):
        try:
            frame = next(self.frames)
            return True, frame.to_ndarray(format='bgr24')
        except (StopIteration, OSError):
            return False, None

    def release(self):
        with suppress(Exception):
            self.container.close()


class ThreadedCamera:
    def __init__(self, src):
        self.src = src
        self.stream = self.open_stream()
        self.ret, self.frame = self.stream.read()
        self.frame_id = 1 if self.ret and self.frame is not None else 0
        self.stop_event = threading.Event()
        self.lock = threading.Lock()
        self.last_reconnect_log = 0.0
        self.thread = threading.Thread(target=self.update, args=())
        self.thread.daemon = True
        self.thread.start()

    def open_stream(self):
        is_network_stream = isinstance(self.src, str) and self.src.lower().startswith(('rtsp://', 'http://', 'https://'))
        is_rtsp = isinstance(self.src, str) and self.src.lower().startswith('rtsp://')
        if is_rtsp and CAMERA_BACKEND in {'auto', 'pyav'}:
            try:
                stream = PyAvCapture(self.src)
                logger.info('RTSP 取流后端: PyAV/FFmpeg (%s)', os.getenv('YOLO_CAMERA_TRANSPORT', 'tcp'))
                return stream
            except Exception:
                if CAMERA_BACKEND == 'pyav':
                    raise
                logger.warning('PyAV 取流初始化失败，自动回退到 OpenCV', exc_info=True)

        if is_rtsp:
            transport = os.getenv('YOLO_CAMERA_TRANSPORT', 'tcp').strip().lower()
            if transport in {'tcp', 'udp'}:
                capture_options = f'rtsp_transport;{transport}'
                if CAMERA_LOW_LATENCY:
                    capture_options += (
                        '|fflags;nobuffer|flags;low_delay|max_delay;0|reorder_queue_size;0'
                        f'|threads;{CAMERA_DECODE_THREADS}'
                    )
                os.environ.setdefault('OPENCV_FFMPEG_CAPTURE_OPTIONS', capture_options)

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

    def update(self):
        while not self.stop_event.is_set():
            try:
                ret, frame = self.stream.read()
            except Exception:
                if self.stop_event.is_set():
                    break
                logger.exception('摄像头读取异常，准备重连')
                ret, frame = False, None
            if not ret:
                with self.lock:
                    self.ret = False
                    self.frame = None
                self.stream.release()
                now = time.monotonic()
                if now - self.last_reconnect_log >= 10:
                    logger.warning('摄像头视频流不可用，正在重连: %s', describe_camera_source(self.src))
                    self.last_reconnect_log = now
                if self.stop_event.wait(CAMERA_RECONNECT_SECONDS):
                    break
                self.stream = self.open_stream()
                continue
            with self.lock:
                self.ret = ret
                self.frame = frame
                self.frame_id += 1

    def read(self, after_frame_id=None):
        with self.lock:
            if after_frame_id == self.frame_id:
                return self.ret, None, self.frame_id
            # Published frames are immutable; replacing the reference is safe and avoids a full-frame copy.
            return self.ret, self.frame, self.frame_id

    def stop(self):
        self.stop_event.set()
        self.stream.release()
        self.thread.join(timeout=2.0)

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


def encode_video_frame(frame):
    height, width = frame.shape[:2]
    if width > VIDEO_MAX_WIDTH:
        scale = VIDEO_MAX_WIDTH / width
        frame = cv2.resize(frame, (VIDEO_MAX_WIDTH, max(1, round(height * scale))), interpolation=cv2.INTER_AREA)
    encoded, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, VIDEO_JPEG_QUALITY])
    return buffer.tobytes() if encoded else None


def load_pose_model():
    pose_model = YOLO(MODEL_PATH)
    if not MODEL_PATH.lower().endswith('.onnx'):
        return pose_model

    # Ultralytics does not currently expose ONNX Runtime session options. Configure
    # only the one-time session creation, then restore the global constructor.
    import onnxruntime as ort

    original_session = ort.InferenceSession
    available_providers = ort.get_available_providers()
    use_directml = (
        EXECUTION_PROVIDER in {'auto', 'directml', 'dml'}
        and 'DmlExecutionProvider' in available_providers
    )
    if EXECUTION_PROVIDER in {'directml', 'dml'} and not use_directml:
        raise RuntimeError(
            'DirectML was requested but DmlExecutionProvider is unavailable. '
            'Install onnxruntime-directml on Windows.'
        )

    def create_tuned_session(path_or_bytes, sess_options=None, *args, **kwargs):
        if sess_options is None:
            sess_options = ort.SessionOptions()
        sess_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        if use_directml:
            # Required by DirectML and avoids hidden CPU fallback caused by invalid options.
            sess_options.enable_mem_pattern = False
            kwargs['providers'] = [
                ('DmlExecutionProvider', {'device_id': str(DML_DEVICE_ID)}),
                'CPUExecutionProvider',
            ]
        else:
            sess_options.intra_op_num_threads = ONNX_INTRA_OP_THREADS
            sess_options.inter_op_num_threads = 1
        return original_session(path_or_bytes, sess_options, *args, **kwargs)

    ort.InferenceSession = create_tuned_session
    try:
        # Warmup builds the runtime session before live frames begin arriving.
        if use_directml:
            # Ultralytics labels every non-CUDA ONNX provider as CPU before it creates
            # the session. Suppress that misleading line and verify the real session below.
            from ultralytics.utils import LOGGER as ultralytics_logger

            previous_level = ultralytics_logger.level
            ultralytics_logger.setLevel(logging.WARNING)
        try:
            pose_model(
                np.zeros((360, 640, 3), dtype=np.uint8),
                verbose=False,
                imgsz=MODEL_INPUT_SIZE,
            )
        finally:
            if use_directml:
                ultralytics_logger.setLevel(previous_level)
    finally:
        ort.InferenceSession = original_session

    backend = getattr(getattr(pose_model, 'predictor', None), 'model', None)
    runtime_session = getattr(backend, 'session', None)
    actual_providers = runtime_session.get_providers() if runtime_session is not None else []
    if use_directml:
        if not actual_providers or actual_providers[0] != 'DmlExecutionProvider':
            raise RuntimeError(f'DirectML session verification failed: {actual_providers}')
        logger.info(
            'ONNX Runtime 实际后端已验证: DirectML GPU %d（providers=%s）',
            DML_DEVICE_ID,
            actual_providers,
        )
    else:
        logger.info(
            'ONNX Runtime 实际后端: CPU %d 线程（providers=%s）',
            ONNX_INTRA_OP_THREADS,
            actual_providers,
        )
    return pose_model


async def video_processing_loop():
    logger.info(f'🎥 正在打开摄像头源: {describe_camera_source(CAMERA_SOURCE)}')
    cap = await asyncio.to_thread(ThreadedCamera, CAMERA_SOURCE)
    tracker = KeypointTracker(alpha=0.3)
    stabilizer = PoseStabilizer(required_frames=3)
    missing_person_frames = 0
    preview_enabled = SHOW_PREVIEW
    last_video_frame_at = 0.0
    last_frame_id = -1

    try:
        while True:
            ret, frame, frame_id = cap.read(last_frame_id)
            if not ret:
                missing_person_frames += 1
                stabilizer.reset()
                if missing_person_frames >= 10:
                    tracker.reset()
                await asyncio.sleep(0.1)
                continue
            if frame is None:
                await asyncio.sleep(FRAME_POLL_SECONDS)
                continue
            last_frame_id = frame_id
            frame_received_at = time.monotonic()

            # The camera thread drops old frames and inference runs outside FastAPI's event loop.
            try:
                results = await asyncio.to_thread(
                    model,
                    frame,
                    verbose=False,
                    imgsz=MODEL_INPUT_SIZE,
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception('YOLO 推理失败，将在下一帧重试')
                stabilizer.reset()
                await asyncio.sleep(0.5)
                continue

            result = results[0] if results else None
            raw_pose, raw_confidence = 'unknown', 0.0
            nose_y = -1.0
            shoulder_y = -1.0

            keypoints = getattr(result, 'keypoints', None)
            boxes = getattr(result, 'boxes', None)
            box_confidences = getattr(boxes, 'conf', None)
            keypoint_confidences = getattr(keypoints, 'conf', None)
            if (
                keypoints is not None
                and keypoint_confidences is not None
                and box_confidences is not None
                and len(keypoints) > 0
                and len(box_confidences) > 0
            ):
                person_idx = int(box_confidences.argmax().item())
                person_confidence = float(box_confidences[person_idx].item())
                if person_idx < len(keypoints) and person_confidence >= PERSON_CONF_THRESHOLD:
                    kp = keypoints.xy[person_idx].cpu().numpy()
                    kp_conf = keypoint_confidences[person_idx].cpu().numpy()
                    if kp.shape == (17, 2) and kp_conf.shape == (17,):
                        missing_person_frames = 0
                        smoothed_kp = tracker.update(kp, kp_conf)
                        raw_pose, raw_confidence = check_pose(smoothed_kp, kp_conf)
                        raw_confidence = min(raw_confidence, person_confidence)
                        nose_y = float(smoothed_kp[0][1]) if kp_conf[0] > 0.5 else -1.0
                        shoulder_values = [
                            float(smoothed_kp[index][1])
                            for index in (5, 6)
                            if kp_conf[index] > 0.5
                        ]
                        shoulder_y = sum(shoulder_values) / len(shoulder_values) if shoulder_values else -1.0
                    else:
                        missing_person_frames += 1
                else:
                    missing_person_frames += 1
            else:
                missing_person_frames += 1

            if missing_person_frames >= 10:
                tracker.reset()

            current_pose, confidence = stabilizer.update(raw_pose, raw_confidence)
            payload_data = {
                'pose': current_pose,
                'confidence': confidence,
                'raw_pose': raw_pose,
                'raw_confidence': raw_confidence,
                'stability_frames': stabilizer.candidate_frames,
                'required_frames': stabilizer.required_frames,
                'fidget': float(tracker.velocity),
                'nose_y': nose_y,
                'shoulder_y': shoulder_y,
            }
            await broadcast_payload(json.dumps(payload_data, separators=(',', ':')))

            should_stream_video = bool(video_connections) and (
                VIDEO_FPS >= 20 or frame_received_at - last_video_frame_at >= 1 / VIDEO_FPS
            )
            if preview_enabled or should_stream_video:
                annotated_frame = result.plot() if result is not None else frame.copy()
                live_color = (0, 255, 255) if raw_pose != 'unknown' else (0, 0, 255)
                safe_color = (0, 255, 0) if current_pose != 'unknown' else (0, 165, 255)
                cv2.putText(
                    annotated_frame,
                    f'Live: {raw_pose} ({raw_confidence * 100:.0f}%)',
                    (20, 50),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.9,
                    live_color,
                    2,
                )
                cv2.putText(
                    annotated_frame,
                    f'Safe: {current_pose} ({stabilizer.candidate_frames}/{stabilizer.required_frames})',
                    (20, 85),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    safe_color,
                    2,
                )
                if should_stream_video:
                    frame_bytes = await asyncio.to_thread(encode_video_frame, annotated_frame)
                    if frame_bytes is not None:
                        await broadcast_video(frame_bytes)
                    last_video_frame_at = frame_received_at
                if preview_enabled:
                    try:
                        cv2.imshow('YCY Bone Tracker', annotated_frame)
                        if cv2.waitKey(1) & 0xFF == ord('q'):
                            break
                    except cv2.error:
                        logger.warning('当前环境不支持 OpenCV 预览窗口，已自动切换为无界面模式')
                        preview_enabled = False

    finally:
        await asyncio.to_thread(cap.stop)
        if preview_enabled:
            cv2.destroyAllWindows()


def report_processing_failure(task):
    if task.cancelled():
        return
    exception = task.exception()
    if exception is not None:
        logger.error(
            '视频处理任务意外退出',
            exc_info=(type(exception), exception, exception.__traceback__),
        )

@app.on_event('startup')
async def startup_event():
    global model, processing_task
    logger.info(f'⏳ 正在加载预训练骨骼模型: {MODEL_PATH}')
    model = await asyncio.to_thread(load_pose_model)
    logger.info('✅ 模型加载完毕！')
    processing_task = asyncio.create_task(video_processing_loop())
    processing_task.add_done_callback(report_processing_failure)

@app.on_event('shutdown')
async def shutdown_event():
    global model, processing_task
    if processing_task is not None:
        processing_task.cancel()
        with suppress(asyncio.CancelledError):
            await processing_task
        processing_task = None
    model = None

if __name__ == '__main__':
    logger.info('🚀 YOLO 全视之眼服务即将启动')
    logger.info('>> App 填写的地址应为: ws://电脑局域网IP:8000/ws')
    # JPEG frames are already compressed; per-message deflate only adds latency and CPU work.
    uvicorn.run(app, host='0.0.0.0', port=8000, ws_per_message_deflate=False)
