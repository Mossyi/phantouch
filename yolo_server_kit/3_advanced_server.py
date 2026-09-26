import cv2
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from ultralytics import YOLO
import uvicorn
import logging
from contextlib import suppress

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()

# ====== 配置区 ======
MODEL_PATH = 'runs/detect/ycy_pose_model/weights/best.pt' # 替换为你训练好的模型
# MODEL_PATH = 'yolov8n.pt' # 测试时可以用这个
CONFIDENCE_THRESHOLD = 0.65 # 置信度阈值 (65% 以上才算)
# ====================

try:
    model = YOLO(MODEL_PATH)
    logger.info(f'✅ 成功加载模型: {MODEL_PATH}')
except Exception as e:
    logger.error(f'❌ 加载模型失败: {e}')
    exit(1)

active_connections = set()
processing_task = None

@app.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)
    logger.info(f'📱 手机 App 已连接! 当前连接数: {len(active_connections)}')
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info(f'📱 手机 App 已断开。')
    except Exception as exc:
        logger.warning(f'📱 WebSocket 连接异常: {exc}')
    finally:
        active_connections.discard(websocket)

async def video_processing_loop():
    cap = cv2.VideoCapture(0)
    logger.info('📷 摄像头已开启，开始全视之眼监控...')
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                await asyncio.sleep(0.1)
                continue

            # CPU/GPU 推理不占用 FastAPI 事件循环。
            results = await asyncio.to_thread(model, frame, verbose=False)

            current_pose = 'unknown'
            max_conf = 0.0

            if len(results[0].boxes) > 0:
                boxes = results[0].boxes
                best_box = max(boxes, key=lambda b: float(b.conf[0].item()))
                max_conf = float(best_box.conf[0].item())
                class_id = int(best_box.cls[0].item())

                if max_conf >= CONFIDENCE_THRESHOLD:
                    current_pose = model.names[class_id]

            payload = json.dumps({'pose': current_pose, 'confidence': max_conf})

            disconnected = set()
            for ws in list(active_connections):
                try:
                    await ws.send_text(payload)
                except Exception:
                    disconnected.add(ws)
            for ws in disconnected:
                active_connections.discard(ws)

            annotated_frame = results[0].plot()
            cv2.putText(annotated_frame, f'Target: {current_pose} ({max_conf:.2f})', (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            cv2.imshow('YCY Vision Enforcer', annotated_frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

            await asyncio.sleep(0.3) # 降低帧率减少手机发热
    finally:
        cap.release()
        cv2.destroyAllWindows()

@app.on_event('startup')
async def startup_event():
    global processing_task
    processing_task = asyncio.create_task(video_processing_loop())

@app.on_event('shutdown')
async def shutdown_event():
    global processing_task
    if processing_task is not None:
        processing_task.cancel()
        with suppress(asyncio.CancelledError):
            await processing_task
        processing_task = None

if __name__ == '__main__':
    logger.info('🚀 服务器启动中...')
    uvicorn.run(app, host='0.0.0.0', port=8000)
