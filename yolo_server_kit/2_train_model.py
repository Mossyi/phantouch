from ultralytics import YOLO

# 1. 加载预训练模型 (yolov8n 是最轻量最快的，适合 CPU/普通显卡)
model = YOLO('yolov8n.pt')

if __name__ == '__main__':
    # 2. 开始训练
    # data='dataset.yaml' 是配置文件路径
    # epochs=50 表示训练 50 轮 (如果效果不好可以加到 100)
    # imgsz=640 是图片大小
    print('🚀 开始深度训练你的专属惩罚模型...')
    results = model.train(
        data='dataset.yaml',
        epochs=50,
        imgsz=640,
        batch=8,
        device='0', # 如果你有N卡写'0'，没有显卡写'cpu'
        name='ycy_pose_model'
    )
    print('✅ 训练完成！你的专属模型保存在: runs/detect/ycy_pose_model/weights/best.pt')
