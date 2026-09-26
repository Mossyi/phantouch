package com.yiciyuan.aicontroller;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * 幻触 (Phantouch) 应用内 APK 更新插件。
 *
 * 职责：
 * 1. 查询 / 申请 "安装未知来源应用" 权限 (Android 8.0+)
 * 2. 原生下载 APK 到应用缓存目录，并回调下载进度
 * 3. 校验 SHA-256，避免下载到被篡改或损坏的安装包
 * 4. 通过 FileProvider 调起系统安装程序完成覆盖安装
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final int MAX_REDIRECTS = 6;
    private static final int BUFFER_SIZE = 64 * 1024;

    private volatile boolean cancelRequested = false;
    private volatile Thread downloadThread;

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", hasInstallPermission());
        result.put("supported", true);
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }
        android.app.Activity activity = getActivity();
        Runnable action = () -> {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception error) {
                try {
                    Intent fallback = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(fallback);
                    call.resolve();
                } catch (Exception fallbackError) {
                    call.reject("无法打开安装未知应用设置，请手动前往系统设置授权", fallbackError);
                }
            }
        };
        if (activity != null) {
            activity.runOnUiThread(action);
        } else {
            action.run();
        }
    }

    @PluginMethod
    public void downloadApk(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || url.trim().isEmpty()) {
            call.reject("下载地址不能为空");
            return;
        }
        Thread running = downloadThread;
        if (running != null && running.isAlive()) {
            call.reject("已有更新下载任务正在进行，请稍候");
            return;
        }
        final String targetUrl = url.trim();
        final String fileName = sanitizeFileName(call.getString("fileName", "update.apk"));
        final String expectedSha256 = call.getString("sha256", "").trim();
        cancelRequested = false;
        Thread thread = new Thread(() -> performDownload(call, targetUrl, fileName, expectedSha256));
        thread.setDaemon(true);
        downloadThread = thread;
        thread.start();
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelRequested = true;
        call.resolve();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String filePath = call.getString("filePath", "");
        if (filePath == null || filePath.trim().isEmpty()) {
            call.reject("安装包路径不能为空");
            return;
        }
        File file = new File(filePath.trim());
        if (!file.exists() || !file.isFile()) {
            call.reject("安装包不存在，请重新下载");
            return;
        }
        if (!hasInstallPermission()) {
            call.reject("需要先允许本应用安装未知来源的应用");
            return;
        }
        android.app.Activity activity = getActivity();
        Runnable action = () -> {
            try {
                Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file
                );
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception error) {
                call.reject("无法调起系统安装程序，请确认安装包完整后重试", error);
            }
        };
        if (activity != null) {
            activity.runOnUiThread(action);
        } else {
            action.run();
        }
    }

    private void performDownload(PluginCall call, String url, String fileName, String expectedSha256) {
        File targetDir = new File(getContext().getCacheDir(), "updates");
        if (!targetDir.exists() && !targetDir.mkdirs()) {
            rejectOnUi(call, "无法创建更新缓存目录");
            return;
        }
        File target = new File(targetDir, fileName);
        File partial = new File(targetDir, fileName + ".part");
        boolean finished = false;
        HttpURLConnection connection = null;
        try {
            connection = openConnection(url);
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                rejectOnUi(call, "下载失败：HTTP " + status);
                return;
            }
            long total = connection.getContentLengthLong();
            long downloaded = 0L;
            int lastPercent = -1;
            byte[] buffer = new byte[BUFFER_SIZE];
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(partial)) {
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (cancelRequested) {
                        rejectOnUi(call, "下载已取消");
                        return;
                    }
                    output.write(buffer, 0, read);
                    downloaded += read;
                    if (total > 0) {
                        int percent = (int) Math.min(100L, downloaded * 100L / total);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            emitProgress(percent, downloaded, total);
                        }
                    }
                }
                output.flush();
            }

            if (total <= 0) emitProgress(100, downloaded, downloaded);

            String actualSha256 = sha256(partial);
            if (expectedSha256 != null && !expectedSha256.isEmpty() && !expectedSha256.equalsIgnoreCase(actualSha256)) {
                rejectOnUi(call, "安装包完整性校验失败，已丢弃下载文件，请稍后重试");
                return;
            }
            if (target.exists() && !target.delete()) {
                rejectOnUi(call, "无法覆盖旧的安装包缓存");
                return;
            }
            if (!partial.renameTo(target)) {
                if (!copyFile(partial, target)) {
                    rejectOnUi(call, "无法保存下载的安装包");
                    return;
                }
                partial.delete();
            }
            finished = true;
            JSObject result = new JSObject();
            result.put("filePath", target.getAbsolutePath());
            result.put("bytes", downloaded);
            result.put("sha256", actualSha256);
            resolveOnUi(call, result);
        } catch (Exception error) {
            rejectOnUi(call, "下载安装包失败：" + (error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage()));
        } finally {
            if (connection != null) connection.disconnect();
            if (!finished) partial.delete();
            cancelRequested = false;
            downloadThread = null;
        }
    }

    private HttpURLConnection openConnection(String url) throws Exception {
        String current = url;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            HttpURLConnection connection = (HttpURLConnection) new URL(current).openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "application/octet-stream");
            connection.setRequestProperty("User-Agent", "Phantouch-Updater");
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.isEmpty()) throw new IllegalStateException("下载重定向缺少目标地址");
                current = new URL(new URL(current), location).toString();
                continue;
            }
            return connection;
        }
        throw new IllegalStateException("下载重定向次数过多");
    }

    private boolean hasInstallPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return getContext().getPackageManager().canRequestPackageInstalls();
        }
        return true;
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[BUFFER_SIZE];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        StringBuilder builder = new StringBuilder();
        for (byte value : digest.digest()) builder.append(String.format(Locale.ROOT, "%02x", value));
        return builder.toString();
    }

    private String sanitizeFileName(String name) {
        String cleaned = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (cleaned.isEmpty() || !cleaned.toLowerCase(Locale.ROOT).endsWith(".apk")) cleaned = "update.apk";
        return cleaned;
    }

    private boolean copyFile(File source, File destination) {
        try (InputStream in = new FileInputStream(source); FileOutputStream out = new FileOutputStream(destination)) {
            byte[] buf = new byte[BUFFER_SIZE];
            int len;
            while ((len = in.read(buf)) != -1) {
                out.write(buf, 0, len);
            }
            out.flush();
            return true;
        } catch (Exception e) {
            if (destination.exists()) destination.delete();
            return false;
        }
    }

    private void emitProgress(int percent, long downloaded, long total) {
        JSObject data = new JSObject();
        data.put("progress", percent);
        data.put("downloadedBytes", downloaded);
        data.put("totalBytes", total);
        if (getActivity() == null) {
            notifyListeners("downloadProgress", data);
            return;
        }
        getActivity().runOnUiThread(() -> notifyListeners("downloadProgress", data));
    }

    private void resolveOnUi(final PluginCall call, final JSObject data) {
        if (getActivity() == null) {
            call.resolve(data);
            return;
        }
        getActivity().runOnUiThread(() -> call.resolve(data));
    }

    private void rejectOnUi(final PluginCall call, final String message) {
        if (getActivity() == null) {
            call.reject(message);
            return;
        }
        getActivity().runOnUiThread(() -> call.reject(message));
    }

    @Override
    protected void handleOnDestroy() {
        cancelRequested = true;
        super.handleOnDestroy();
    }
}
