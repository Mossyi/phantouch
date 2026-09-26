#!/usr/bin/env node

/**
 * 幻触 (Phantouch) 发布物上传器
 *
 * 把所有对外发布的东西统一推到 Cloudflare R2：
 *
 *   app/version.json        ← APK 全量更新清单（客户端检查更新读取）
 *   app/Phantouch.apk       ← APK 安装包
 *   manifest.json           ← 热更新清单（Worker 读取）
 *   bundles/<zip>           ← 热更新完整包（差分失败兜底）
 *   files/<sha256>          ← 热更新差分文件（按内容哈希去重）
 *
 * 这样代码仓库可以保持私有，发布物依然能对外分发。
 *
 * 用法：
 *   node scripts/upload-release.mjs --bucket phantouch-update
 *   node scripts/upload-release.mjs --bucket phantouch-update --apk release/Phantouch.apk
 *   node scripts/upload-release.mjs --bucket phantouch-update --dry-run
 *
 * 需要 wrangler 已认证（CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID）。
 */

import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
};

const args = parseArgs(process.argv.slice(2));
const bucket = typeof args.bucket === 'string' ? args.bucket : 'phantouch-update';
const manifestPath = resolve(ROOT, typeof args.manifest === 'string' ? args.manifest : 'ota_manifest.json');
const versionPath = resolve(ROOT, typeof args.version === 'string' ? args.version : 'version.json');
const resolveApkPath = () => {
  if (typeof args.apk === 'string') return resolve(ROOT, args.apk);
  const fallbacks = [
    resolve(ROOT, '幻触-Phantouch-debug.apk'),
    resolve(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk'),
    resolve(ROOT, 'release/Phantouch.apk'),
  ];
  for (const f of fallbacks) {
    if (existsSync(f)) return f;
  }
  return null;
};
const apkPath = resolveApkPath();
const apkKey = typeof args['apk-key'] === 'string' ? args['apk-key'] : 'app/Phantouch.apk';
const distDir = resolve(ROOT, typeof args.path === 'string' ? args.path : 'dist');
const dryRun = Boolean(args['dry-run']);
const workerUrl = typeof args['worker-url'] === 'string' ? args['worker-url'].replace(/\/+$/, '') : 'https://phantouch-updates.example.workers.dev';

const resolveWrangler = () => {
  const candidates = [
    resolve(ROOT, 'cloudflare/updater-worker/node_modules/wrangler/bin/wrangler.js'),
    resolve(ROOT, 'node_modules/wrangler/bin/wrangler.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

const wranglerEntry = resolveWrangler();

const put = async (key, file) => {
  if (dryRun) {
    console.log(`  [dry-run] ${key}`);
    return;
  }
  if (!wranglerEntry) {
    throw new Error('未找到 wrangler，请先在 cloudflare/updater-worker 下执行 npm install');
  }
  await execFileAsync(
    process.execPath,
    [wranglerEntry, 'r2', 'object', 'put', `${bucket}/${key}`, '--file', file, '--remote'],
    { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 },
  );
};

const objectExists = async (hash) => {
  if (!workerUrl) return false;
  try {
    const response = await fetch(`${workerUrl}/files/${hash}`, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
};

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

console.log(`📤 上传目标：R2 存储桶 "${bucket}"${dryRun ? '（dry-run）' : ''}`);

// ── 1. APK 全量更新：清单 + 安装包 ─────────────────────────────
console.log('\n[APK 全量更新]');
if (existsSync(versionPath)) {
  const info = await stat(versionPath);
  console.log(`  ↳ app/version.json (${mb(info.size)})`);
  await put('app/version.json', versionPath);
} else {
  console.warn(`  ⚠️  找不到 ${versionPath}，跳过更新清单`);
}

if (apkPath) {
  if (existsSync(apkPath)) {
    const info = await stat(apkPath);
    console.log(`  ↳ ${apkKey} (${mb(info.size)})`);
    await put(apkKey, apkPath);
  } else {
    console.warn(`  ⚠️  找不到 APK：${apkPath}，跳过`);
  }
} else {
  console.log('  ↳ 未提供 --apk，跳过安装包上传');
}

// ── 2. 热更新：清单 + 完整包 + 差分文件 ────────────────────────
if (!existsSync(manifestPath)) {
  console.warn(`\n⚠️  找不到 ${manifestPath}，跳过热更新上传（可先运行 node scripts/build-ota-bundle.mjs）`);
  console.log('\n================================================================');
  console.log('✅ 上传完成（仅 APK 部分）');
  console.log('================================================================\n');
  process.exit(0);
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const platforms = Object.keys(manifest);
let uploadedFiles = 0;
let skippedFiles = 0;

for (const platform of platforms) {
  const entry = manifest[platform];
  console.log(`\n[热更新 · ${platform}] ${entry.version}`);

  const zipFile = resolve(ROOT, entry.key.replace(/^bundles\//, ''));
  if (existsSync(zipFile)) {
    const info = await stat(zipFile);
    console.log(`  ↳ 完整包 ${entry.key} (${mb(info.size)})`);
    await put(entry.key, zipFile);
  } else {
    console.warn(`  ⚠️  找不到完整包：${zipFile}，跳过`);
  }

  const files = entry.files || [];
  const uniqueHashes = new Map();
  for (const file of files) {
    if (!uniqueHashes.has(file.file_hash)) uniqueHashes.set(file.file_hash, file.file_name);
  }
  console.log(`  ↳ 差分文件 ${uniqueHashes.size} 个（去重后）`);

  for (const [hash, fileName] of uniqueHashes) {
    if (await objectExists(hash)) {
      skippedFiles += 1;
      continue;
    }
    const filePath = join(distDir, ...fileName.split('/'));
    if (!existsSync(filePath)) {
      console.warn(`  ⚠️  找不到文件：${fileName}`);
      continue;
    }
    await put(`files/${hash}`, filePath);
    uploadedFiles += 1;
  }
}

console.log('\n[热更新清单]');
await put('manifest.json', manifestPath);

console.log('\n================================================================');
console.log(`✅ 上传完成：新增 ${uploadedFiles} 个差分文件，跳过 ${skippedFiles} 个已存在文件`);
console.log('================================================================\n');
