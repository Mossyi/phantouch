/**
 * 幻触 (Phantouch) 自托管更新服务地址（单一配置源）。
 *
 * 所有更新相关地址都在这里定义，避免多处硬编码导致漂移。
 * 部署 Cloudflare Worker 后，把下面的地址换成你自己的；
 * 也可以在构建时用环境变量覆盖：VITE_UPDATE_ORIGIN
 *
 * 对应服务端实现见 cloudflare/updater-worker/
 */

const FALLBACK_ORIGIN = 'https://phantouch-updates.example.workers.dev';

const normalizeOrigin = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '');
};

/** 更新服务根地址，例如 https://your-worker.your-subdomain.workers.dev */
export const UPDATE_SERVICE_ORIGIN =
  normalizeOrigin(import.meta.env?.VITE_UPDATE_ORIGIN) || FALLBACK_ORIGIN;

/** APK 全量更新清单（客户端「检查新版本」读取）。 */
export const APP_UPDATE_MANIFEST_URL = `${UPDATE_SERVICE_ORIGIN}/app/version.json`;

/** Web 层热更新接口（CapacitorUpdater 上报 AppInfos）。 */
export const OTA_UPDATE_URL = `${UPDATE_SERVICE_ORIGIN}/updates`;
