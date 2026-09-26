const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('====================================================');
console.log('       役次元 AI 智控 App - Android APK 打包构建器');
console.log('====================================================\n');

const projectRoot = __dirname;
const androidDir = path.join(projectRoot, 'android');

// 1. 构建前端
console.log('📦 [1/3] 正在编译前端生产代码 (Vite build)...');
try {
  execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });
  console.log('✅ 前端生产代码编译成功！\n');
} catch (err) {
  console.error('❌ 前端编译失败，请检查报错！');
  process.exit(1);
}

// 2. 同步资源到 Android 原生工程
console.log('🔄 [2/3] 正在同步代码与原生蓝牙权限到 Android 工程 (Capacitor sync)...');
try {
  execSync('npx cap sync android', { cwd: projectRoot, stdio: 'inherit' });
  console.log('✅ 资源与原生权限同步完成！\n');
} catch (err) {
  console.error('❌ Capacitor 同步失败！');
  process.exit(1);
}

// 3. 构建 APK
console.log('🤖 [3/3] 正在调用 Gradle 编译 Android 原生 APK 安装包...');
const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

try {
  execSync(`${gradlewCmd} assembleDebug`, { cwd: androidDir, stdio: 'inherit' });
  
  const apkPath = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  console.log('\n====================================================');
  console.log('🎉 恭喜！Android 原生 APK 安装包已成功编译生成！');
  console.log('📁 安装包位置: ' + apkPath);
  console.log('📲 您可以直接将该 APK 安装包发送到手机进行安装！');
  console.log('====================================================');
} catch (err) {
  console.log('\n----------------------------------------------------');
  console.log('💡 说明: 如果您的电脑尚未配置本地 Android SDK:');
  console.log('1. 最简单方式: 直接打开 Android Studio -> Open -> 选择 android 文件夹');
  console.log('2. 点击顶部菜单: Build -> Build Bundle(s)/APK(s) -> Build APK(s)');
  console.log('3. 即可瞬间打包出 app-debug.apk！');
  console.log('----------------------------------------------------');
}
