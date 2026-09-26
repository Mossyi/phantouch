import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 自托管更新服务根地址（Cloudflare Worker）。
 *
 * 与 src/core/updater/updateEndpoints.ts 使用同一个环境变量 VITE_UPDATE_ORIGIN，
 * 部署后只需设置一处即可保持前后端一致：
 *
 *   VITE_UPDATE_ORIGIN=https://你的地址.workers.dev
 *
 * 部署说明见 cloudflare/updater-worker/README.md
 */
const UPDATE_ORIGIN = (process.env.VITE_UPDATE_ORIGIN || 'https://phantouch-updates.example.workers.dev').replace(/\/+$/, '');

const config: CapacitorConfig = {
  appId: 'com.yiciyuan.aicontroller',
  appName: '幻触 Phantouch',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    // The bundled app uses an HTTPS origin, while trusted LAN YOLO servers use ws://.
    allowMixedContent: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorUpdater: {
      // 手动模式：只在用户在设置里点击或前台检查时才拉取，避免无感知换包。
      autoUpdate: 'off',
      // 自托管更新源，固定写入构建产物，运行时不接受修改。
      updateUrl: `${UPDATE_ORIGIN}/updates`,
      // 关闭 Capgo 云端统计上报，所有请求只发往自建 Worker。
      statsUrl: '',
      // 禁止 JS 侧修改更新源：可修改的更新地址等于对外开放一个能指向任意热更新包的入口。
      allowModifyUrl: false,
      // 不持久化运行时修改，确保每次启动都回到构建时写入的固定地址。
      persistModifyUrl: false,
      // 新包启动后 10 秒内必须调用 notifyAppReady()，否则自动回滚到上一个可用包。
      appReadyTimeout: 10000,
      responseTimeout: 30,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      resetWhenUpdate: true,
      directUpdate: false,
    },
  },
};

export default config;
