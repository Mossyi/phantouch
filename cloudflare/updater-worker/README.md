# 幻触 自托管更新服务 (Cloudflare Worker + R2)

这套服务承载**全部对外发布物**，让代码仓库可以保持私有：

| 路径 | 内容 | 用途 |
| --- | --- | --- |
| `GET /app/version.json` | APK 更新清单 | 客户端「检查新版本」读取 |
| `GET /app/Phantouch.apk` | APK 安装包 | 应用内一键更新下载 |
| `POST /updates` | 热更新检查 | Capgo 上报 AppInfos |
| `GET /files/<sha256>` | 热更新差分文件 | 只下载变化的文件 |
| `GET /bundles/<key>` | 热更新完整包 | 差分失败时兜底 |
| `GET /health` | 健康检查 | 部署验证 |

## 成本

Cloudflare 免费额度内 **¥0**：

| 项目 | 免费额度 |
| --- | --- |
| Workers 请求 | 10 万次 / 天 |
| R2 存储 | 10 GB / 月 |
| R2 出站流量 | **免费，不计量** |
| R2 操作 | A 类 100 万次/月，B 类 1000 万次/月 |

资源文件按内容 SHA-256 寻址，相同内容天然去重，多次发版不会重复占用空间。

## 一次性部署

### 1. 创建 R2 存储桶

```bash
npx wrangler login
npx wrangler r2 bucket create phantouch-update --location apac
```

### 2. 部署 Worker

```bash
cd cloudflare/updater-worker
npm install
npx wrangler deploy
```

部署后会得到形如 `https://phantouch-updates.<子域>.workers.dev` 的地址。

### 3. 把地址写回客户端

只需设置**一个**环境变量，客户端与原生壳会同时生效：

```bash
VITE_UPDATE_ORIGIN=https://你的地址.workers.dev
```

也可以直接改这两处的默认值（它们读的是同一个变量）：

- `src/core/updater/updateEndpoints.ts`
- `capacitor.config.ts`

普通用户还能在 App 的「空间 → 系统设置 → 关于与远程更新」里自行覆盖。

### 4. 验证

```bash
curl https://你的地址.workers.dev/health
# => {"ok":true}
```

## 每次发版

```bash
# 1. 构建 Web 并生成热更新包 + 差分清单
npx vite build
node scripts/build-ota-bundle.mjs

# 2. 构建 APK
npm run build:apk

# 3. 生成 APK 更新清单（自动计算 SHA-256 与体积）
node scripts/publish-update.mjs --apk 幻触-Phantouch-debug.apk

# 4. 一次性上传全部发布物到 R2
node scripts/upload-release.mjs --bucket phantouch-update --apk 幻触-Phantouch-debug.apk
```

或者直接用聚合脚本：

```bash
npm run release:publish
```

推送 `v*` tag 时 `.github/workflows/release.yml` 会自动完成上面全部步骤。

## 协议说明

### `POST /updates`

客户端上报 AppInfos：

```json
{
  "platform": "android",
  "app_id": "com.yiciyuan.aicontroller",
  "version_name": "1.1.110",
  "version_code": "110"
}
```

有更新时返回：

```json
{
  "version": "1.1.111",
  "url": "https://.../bundles/com.yiciyuan.aicontroller_1.1.111.zip",
  "checksum": "<zip sha256>",
  "manifest": [
    { "file_name": "assets/index.js", "file_hash": "<sha256>", "download_url": "https://.../files/<sha256>" }
  ]
}
```

无更新时返回 `{"error":"no_new_version_available","message":"No new version available"}`。

### `GET /app/version.json`

APK 更新清单，短缓存（`max-age=60`），保证发版后客户端能较快看到新版本：

```json
{
  "version": "1.1.0",
  "versionCode": 113,
  "changelog": ["..."],
  "apkUrl": "https://.../app/Phantouch.apk",
  "apkSha256": "<sha256>",
  "apkSize": 15728640
}
```

### `GET /app/Phantouch.apk`

APK 安装包，长缓存（`immutable`）。客户端下载后会校验 `apkSha256`。

## 清单结构

R2 中的 `manifest.json`（热更新）：

```json
{
  "android": {
    "version": "1.1.110",
    "versionCode": 110,
    "key": "bundles/com.yiciyuan.aicontroller_1.1.110.zip",
    "checksum": "<zip sha256>",
    "size": 3300000,
    "minNativeVersionCode": 100,
    "forceUpdate": false,
    "disabled": false,
    "files": [
      { "file_name": "index.html", "file_hash": "<sha256>", "download_url": "/files/<sha256>" }
    ]
  }
}
```

- `minNativeVersionCode`：低于该原生构建号的设备不会收到热更新（用于"必须先装新 APK"）。
- `disabled`：临时停发该平台热更新。
- `forceUpdate`：置为 `true` 时客户端会收到 `breaking` 标记。

## 安全与回滚

- 客户端启动后必须在 10 秒内调用 `notifyAppReady()`，否则原生层**自动回滚**到上一个可用包。
- `autoDeleteFailed: true` 清理启动失败的包，`autoDeletePrevious: true` 保留一个可回滚版本。
- 建议 R2 里保留至少两个版本的完整包，便于紧急回退。

## 已知限制

- **只有 Web 层能被热更新**。新增原生插件、权限、BLE 协议改动必须发新 APK。
- `*.workers.dev` 域名在部分网络环境下可能不稳定。若遇到访问问题，可给 Worker 绑定自定义域名。
- 首次发版后建议实际下载一次 APK，验证大文件经 Worker 转发的表现。
