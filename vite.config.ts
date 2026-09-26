import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    // Ark Agent Plan does not allow the Authorization header in browser preflight.
    // Keep this proxy narrowly scoped to the documented official endpoint.
    proxy: {
      '/__ycy_ark_agent_plan_proxy': {
        target: 'https://ark.cn-beijing.volces.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/__ycy_ark_agent_plan_proxy/, ''),
      },
      '/__ycy_volc_tts_proxy': {
        target: 'https://openspeech.bytedance.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/__ycy_volc_tts_proxy/, ''),
      },
      '/__ycy_comfyui_proxy': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/__ycy_comfyui_proxy/, ''),
      },
    },
    watch: {
      ignored: ['**/android/**', '**/*.apk'],
    },
  }
});
