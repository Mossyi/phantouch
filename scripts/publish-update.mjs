#!/usr/bin/env node

/**
 * 幻触 (Phantouch) 发版元数据生成器
 *
 * 单一版本源原则：
 *   version.json 是唯一权威版本号，本脚本只做"派生"，绝不自己维护第二份版本号。
 *
 * 产出：
 *   version.json —— 既是构建版本号，也是 App 内「检查更新」读取的远程清单
 *
 * 用法：
 *   node scripts/publish-update.mjs
 *   node scripts/publish-update.mjs --apk "幻触-Phantouch-debug.apk"
 *   node scripts/publish-update.mjs --apk build/app-release.apk --repo your-name/phantouch --notes CHANGELOG.md
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';

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

const versionFile = resolve(ROOT, 'version.json');
const current = JSON.parse(await readFile(versionFile, 'utf8'));

if (typeof current.version !== 'string' || !Number.isSafeInteger(current.versionCode)) {
  console.error('❌ version.json 格式不正确，缺少 version 或 versionCode');
  process.exit(1);
}

// 发布物统一走自托管 Cloudflare Worker（R2 作存储后端），代码仓库保持私有。
const origin = (typeof args.origin === 'string' ? args.origin : 'https://phantouch-updates.example.workers.dev').replace(/\/+$/, '');
const apkAssetName = typeof args['apk-name'] === 'string' ? args['apk-name'] : 'Phantouch.apk';
const apkUrl = typeof args['apk-url'] === 'string' ? args['apk-url'] : `${origin}/app/${apkAssetName}`;

// 更新日志：优先读取 --notes 指定的文件，其次读取 CHANGELOG.md，最后回退到内置文案
const readChangelog = async () => {
  const candidates = [];
  if (typeof args.notes === 'string') candidates.push(resolve(ROOT, args.notes));
  candidates.push(resolve(ROOT, 'CHANGELOG.md'));
  for (const file of candidates) {
    try {
      const text = await readFile(file, 'utf8');
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^[-*]\s+/.test(line))
        .map((line) => line.replace(/^[-*]\s+/, '').trim())
        .filter(Boolean);
      if (lines.length > 0) return lines.slice(0, 20);
    } catch {
      // 文件不存在，继续尝试下一个
    }
  }
  return [
    '已知体验细节优化与性能提升',
    '修复若干偶发问题，提升运行稳定性',
  ];
};

// APK 体积与 SHA-256：仅当显式提供 --apk 或根目录存在同名文件时计算
const sha256OfFile = (filePath) =>
  new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', rejectHash);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });

const resolveApkMeta = async () => {
  const candidates = [];
  if (typeof args.apk === 'string') {
    candidates.push(resolve(ROOT, args.apk));
  } else {
    candidates.push(
      resolve(ROOT, '幻触-Phantouch-debug.apk'),
      resolve(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk'),
      resolve(ROOT, 'release/Phantouch.apk'),
    );
  }
  for (const file of candidates) {
    try {
      const info = await stat(file);
      if (!info.isFile()) continue;
      const sha256 = await sha256OfFile(file);
      console.log(`📦 已自动关联 APK 文件：${file}`);
      return { path: file, sha256, size: info.size };
    } catch {
      if (typeof args.apk === 'string') {
        console.warn(`⚠️  找不到指定的 APK 文件：${file}`);
      }
    }
  }
  return null;
};

const apkMeta = await resolveApkMeta();
const changelog = await readChangelog();

const manifest = {
  version: current.version,
  versionCode: current.versionCode,
  builtAt: current.builtAt,
  notice: '幻触新版本发布，欢迎体验！',
  changelog,
  apkUrl,
  backupUrl: typeof args.backup === 'string' ? args.backup : 'https://example.com/phantouch',
};

if (apkMeta) {
  manifest.apkSha256 = apkMeta.sha256;
  manifest.apkSize = apkMeta.size;
}

const outputTarget = resolve(ROOT, typeof args.out === 'string' ? args.out : 'version.json');
await writeFile(outputTarget, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const sizeText = apkMeta ? `${(apkMeta.size / 1024 / 1024).toFixed(1)} MB` : '未提供（可在 App 内显示为默认体积）';

console.log('================================================================');
console.log('🎉 远程更新清单已生成: version.json');
console.log(`📌 版本: v${current.version} (构建 ${current.versionCode})`);
console.log(`🔗 主下载源: ${manifest.apkUrl}`);
console.log(`🔐 SHA-256: ${apkMeta ? apkMeta.sha256 : '未计算（未提供 --apk 参数）'}`);
console.log(`📦 APK 体积: ${sizeText}`);
console.log('================================================================');
console.log('\n【发版 2 步】');
console.log(`  1. 上传发布物到 R2：node scripts/upload-release.mjs --bucket <桶名> --apk <APK 路径>`);
console.log('  2. 客户端会从 ' + origin + '/app/version.json 读取清单并校验 SHA-256。');
console.log('');
console.log('提示：version.json 是唯一版本号来源，本脚本只派生清单，不会再出现版本号漂移。');
console.log('================================================================\n');
