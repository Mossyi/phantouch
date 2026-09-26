import cv2
import os
import time

# 设置你想拍摄的姿势，例如 'dog', 'kneel'
POSE_NAME = 'dog'
SAVE_DIR = f'dataset/images/{POSE_NAME}'
os.makedirs(SAVE_DIR, exist_ok=True)

cap = cv2.VideoCapture(0)
print(f'准备拍摄姿势: {POSE_NAME}')
print('按下 [空格] 开始自动连拍 50 张，按下 [Q] 退出。')

while True:
    ret, frame = cap.read()
    if not ret: break
    
    cv2.putText(frame, f'Pose: {POSE_NAME} - Press SPACE to auto-capture', (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.imshow('Capture', frame)
    
    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'):
        break
    elif key == ord(' '):
        print('3秒后开始连拍...')
        for i in range(3, 0, -1):
            print(i)
            time.sleep(1)
        
        print('开始连拍！保持姿势！')
        for i in range(50):
            ret, f = cap.read()
            filename = os.path.join(SAVE_DIR, f'{POSE_NAME}_{int(time.time()*1000)}_{i}.jpg')
            cv2.imwrite(filename, f)
            print(f'Saved {filename}')
            time.sleep(0.1)
        print('连拍完成！换个角度再按空格，或者按Q退出并修改代码拍摄下一个姿势。')

cap.release()
cv2.destroyAllWindows()
