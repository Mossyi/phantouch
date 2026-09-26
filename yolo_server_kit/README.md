# YOLO Pose Server

`4_yolo_pose_server.py` uses the COCO-17 keypoints from an Ultralytics pose model. It does not use the three-class object-detection model trained by `2_train_model.py`.

## Setup

```powershell
python -m pip install -r yolo_server_kit\requirements.txt
python yolo_server_kit\4_yolo_pose_server.py
```

The first run can download `yolov8n-pose.pt`. The app connects to `ws://<server-lan-ip>:8000/ws`.

Configuration is available through environment variables:

- `YOLO_CAMERA_SOURCE`: USB camera index, RTSP URL, or HTTP video URL. Default: `0`.
- `YOLO_CAMERA_HOST`, `YOLO_CAMERA_PORT`, `YOLO_CAMERA_PATH`: build a network camera URL when `YOLO_CAMERA_SOURCE` is not set.
- `YOLO_CAMERA_USERNAME`, `YOLO_CAMERA_PASSWORD`: network camera device account. Credentials are masked in logs.
- `YOLO_CAMERA_PROTOCOL`: `rtsp`, `http`, or `https`. Default: `rtsp`.
- `YOLO_CAMERA_TRANSPORT`: RTSP transport, `tcp` or `udp`. Default: `tcp`.
- `YOLO_CAMERA_LOW_LATENCY`: disable FFmpeg buffering and frame reordering for RTSP. Default: `1`.
- `YOLO_CAMERA_BACKEND`: `auto`, `pyav`, or `opencv`. `auto` uses PyAV for RTSP and falls back to OpenCV. Default: `auto`.
- `YOLO_CAMERA_DECODE_THREADS`: PyAV video decoder threads. Default: `1`.
- `YOLO_CAMERA_HW_ACCELERATION`: `none`, `auto`, or `d3d11`. D3D11 requires the OpenCV FFmpeg backend on Windows. Default: `none`.
- `YOLO_CAMERA_OPEN_TIMEOUT_MS`, `YOLO_CAMERA_READ_TIMEOUT_MS`: network stream timeouts. Default: `5000`.
- `YOLO_MODEL_PATH`: pose model path. Default: `yolov8n-pose.pt`.
- `YOLO_MODEL_INPUT_SIZE`: square model input size, from 320 to 1280. Default: `320`.
- `YOLO_EXECUTION_PROVIDER`: `auto`, `directml`, or `cpu`. On Windows, `auto` uses DirectML when installed.
- `YOLO_DML_DEVICE_ID`: DirectML adapter index. Default: `0`.
- `YOLO_ONNX_THREADS`: ONNX Runtime CPU inference threads. Default: `2`.
- `YOLO_PERSON_CONFIDENCE`: person threshold. Default: `0.6`.
- `YOLO_SHOW_PREVIEW`: set to `0` on a headless server. Default: `1`.
- `YOLO_MAX_CONNECTIONS`: maximum WebSocket clients. Default: `8`.
- `YOLO_FRAME_POLL_MS`: wait used while the camera has not produced a new frame. Default: `5`.
- `YOLO_VIDEO_FPS`: App preview frame rate, limited to 1-20. Default: `10`.
- `YOLO_VIDEO_WIDTH`: App preview width, limited to 320-1280. Default: `640`.
- `YOLO_VIDEO_QUALITY`: JPEG quality, limited to 40-90. Default: `70`.

The server automatically reads `yolo_server_kit/.env.yolo.local` before opening the camera. This ignored local file is the preferred place for network camera credentials. Explicit process environment variables take precedence. For TP-Link cameras, `/stream1` is the high-quality stream and `/stream2` is the lower-bandwidth stream. Use `/stream1` with GPU inference when small or distant keypoints matter; use `/stream2` only when network bandwidth or decoder performance is constrained. The username must be the camera device account, which may differ from the TP-Link cloud account.

For faster CPU inference without quantization or a smaller input, export the same pose model once and set `YOLO_MODEL_PATH=yolov8n-pose.onnx`:

```powershell
python -m pip install "onnx>=1.17,<2"
python -c "from ultralytics import YOLO; YOLO('yolov8n-pose.pt').export(format='onnx', imgsz=320, dynamic=False, simplify=False, opset=17)"
```

For a fixed 640-pixel DirectML model, copy the source weights to a distinct name before export so the 320-pixel model is not overwritten, then set `YOLO_MODEL_INPUT_SIZE=640` and `YOLO_EXECUTION_PROVIDER=directml`.

After connecting, the App can send `{"type":"video","enabled":true}` to subscribe to annotated JPEG frames. Video frames are binary WebSocket messages; pose results remain JSON text messages. Turning the preview off stops frame encoding and transmission.

## Dog/all-fours camera placement

The `dog` rule verifies a bent hip and knee, at least three visible hand/knee support points, a complete visible limb chain, level supports, and a near-horizontal torso. Put the whole body in frame and place the camera roughly side-on at a 30-60 degree angle. Avoid a straight front, rear, or overhead view.

This is a conservative 2D geometry rule, not a trained all-fours action classifier. Clothing, occlusion, unusual body proportions, and camera perspective can still affect it. For production-grade accuracy, collect consented labeled clips from the real camera position and evaluate precision/recall before enabling any hardware reaction.

## Tests

The pure pose rules do not require FastAPI or Ultralytics:

```powershell
python -m unittest discover -s yolo_server_kit -p "test_*.py"
```
