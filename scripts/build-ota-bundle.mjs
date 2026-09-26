#!/usr/bin/env node

/**
 * 幻触 (Phantouch) Web 层热更新包构建器
 *
 * 做三件事：
 *   1. 用 Capgo CLI 把 dist 打成合法的热更新 zip（含 index.html 与 notifyAppReady 校验）
 *   2. 计算每个文件的 SHA-256，生成"差分清单"，让客户端只下载真正变化的文件
 *   3. 输出可上传到 Cloudflare R2 的清单与上传指引
 *
 * 用法：
 *   node scripts/build-ota-bundle.mjs
 *   node scripts/build-ota-bundle.mjs --app-id com.yiciyuan.aicontroller --out ota_manifest.json
 *
 * 说明：差分清单里未变化的文件（例如体积很大的 wardrobe 图片）会被客户端识别为
 * "APK 内置资源已有"，从而跳过下载；只有改动的 JS/CSS/HTML 才需要传输。
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { resolve, join, relative, posix } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

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
const appId = typeof args['app-id'] === 'string' ? args['app-id'] : 'com.yiciyuan.aicontroller';
const distDir = resolve(ROOT, typeof args.path === 'string' ? args.path : 'dist');
const current = JSON.parse(await readFile(resolve(ROOT, 'version.json'), 'utf8'));

// 语义化版本：major.minor.<versionCode>，保证随 versionCode 单调递增
const [major = '1', minor = '0'] = String(current.version).split('.');
const bundleVersion = `${major}.${minor}.${current.versionCode}`;

const sha256OfFile = (filePath) =>
  new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', rejectHash);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
};

console.log(`📦 正在打包 Web 层热更新包：${bundleVersion}`);

// 1) 用 Capgo CLI 生成合法 zip（会校验 index.html 与 notifyAppReady 调用）
let zipInfo;
try {
  // 直接用 node 执行 CLI 入口：避免 Windows 下 npx.cmd 触发的 spawn EINVAL。
  const capgoCliEntry = resolve(ROOT, 'node_modules/@capgo/cli/dist/index.js');
  const { stdout } = await execFileAsync(
    process.execPath,
    [capgoCliEntry, 'bundle', 'zip', appId, '--path', distDir, '--bundle', bundleVersion, '--json'],
    { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 },
  );
  const jsonStart = stdout.indexOf('{');
  zipInfo = JSON.parse(stdout.slice(jsonStart));
} catch (error) {
  console.error('❌ 热更新打包失败：');
  console.error(error?.stdout || error?.message || error);
  process.exit(1);
}

const zipPath = resolve(ROOT, zipInfo.filename);
const zipStat = await stat(zipPath);
const zipSha256 = await sha256OfFile(zipPath);

// 2) 逐文件哈希，生成差分清单
const files = await walk(distDir);
const manifestFiles = [];
for (const file of files) {
  const hash = await sha256OfFile(file);
  const relativePath = posix.join(...relative(distDir, file).split(/[\\/]/));
  manifestFiles.push({
    file_name: relativePath,
    file_hash: hash,
    // 按内容哈希寻址：内容相同的文件天然去重，不会重复占用 R2 空间
    download_url: `/files/${hash}`,
  });
}

const manifest = {
  android: {
    version: bundleVersion,
    versionCode: current.versionCode,
    nativeVersion: current.version,
    key: `bundles/${zipInfo.filename}`,
    checksum: zipSha256,
    capgoChecksum: zipInfo.checksum,
    size: zipStat.size,
    files: manifestFiles,
    changelog: [],
    forceUpdate: false,
    disabled: false,
  },
};

const outName = typeof args.out === 'string' ? args.out : 'ota_manifest.json';
const outPath = resolve(ROOT, outName);
await writeFile(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

console.log('================================================================');
console.log('🎉 热更新包与清单已生成');
console.log(`📌 版本: ${bundleVersion} (原生 ${current.version} / 构建 ${current.versionCode})`);
console.log(`🗜️  完整包: ${zipInfo.filename} (${mb(zipStat.size)})`);
console.log(`🔐 包校验: ${zipSha256}`);
console.log(`📄 文件数: ${manifestFiles.length}（差分清单已写入 ${outName}）`);
console.log('================================================================');
console.log('\n【上传到 Cloudflare R2】');
console.log('  1. 上传完整包（兜底用）：');
console.log(`     npx wrangler r2 object put phantouch-update/bundles/${zipInfo.filename} --file "${zipInfo.filename}"`);
console.log('  2. 上传发生变化的文件（按内容哈希寻址，天然去重）：');
console.log('     使用 scripts/upload-release.mjs 一次性上传完整包与全部差分文件。');
console.log(`  3. 上传清单：`);
console.log(`     npx wrangler r2 object put phantouch-update/manifest.json --file "${outName}"`);
console.log('================================================================\n');
