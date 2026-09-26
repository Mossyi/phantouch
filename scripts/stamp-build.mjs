import { readFile, writeFile, rename } from 'node:fs/promises';
const target = new URL('../version.json', import.meta.url);
const current = JSON.parse(await readFile(target, 'utf8'));
if (!Number.isSafeInteger(current.versionCode) || current.versionCode < 1 || current.versionCode >= 2100000000) throw new Error('Invalid build version');
// 保留清单字段（apkUrl / changelog / apkSha256 等），避免构建时把线上更新清单抹掉。
const next = {
  ...current,
  version: current.version,
  versionCode: current.versionCode + 1,
  builtAt: new Date().toISOString(),
};
const temporary = new URL('../version.json.tmp', import.meta.url);
await writeFile(temporary, JSON.stringify(next, null, 2) + '\n');
await rename(temporary, target);
console.log(`Build ${next.version} (${next.versionCode}) ${next.builtAt}`);
