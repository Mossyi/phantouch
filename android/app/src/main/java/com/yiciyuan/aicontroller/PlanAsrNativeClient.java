package com.yiciyuan.aicontroller;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

/**
 * 火山方舟 Agent Plan 语音识别的原生 WebSocket。
 * 只连接官方地址。请求头和 Key 不进入日志，失败原因里也会去掉 Key。
 */
public final class PlanAsrNativeClient {
    public static final String OFFICIAL_URL = "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream";
    private static final String[] ALLOWED_HEADERS = {
        "X-Api-Key",
        "X-Api-Resource-Id",
        "X-Api-Request-Id",
        "X-Api-Connect-Id",
        "X-Api-Sequence",
    };

    public interface Listener {
        void onOpen(String socketId);
        void onBinaryMessage(String socketId, byte[] data);
        void onError(String socketId, String message);
        void onClosed(String socketId);
    }

    private final boolean allowLoopback;
    private final OkHttpClient http;
    private final Listener listener;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(task -> {
        Thread thread = new Thread(task, "plan-asr");
        thread.setDaemon(true);
        return thread;
    });
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();

    public PlanAsrNativeClient(Listener listener) {
        this(listener, false);
    }

    PlanAsrNativeClient(Listener listener, boolean allowLoopback) {
        this.listener = listener;
        this.allowLoopback = allowLoopback;
        this.http = new OkHttpClient.Builder()
            .pingInterval(20, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false)
            .build();
    }

    public static boolean isOfficialPlanAsrUrl(String url) {
        return matches(url, "wss", "openspeech.bytedance.com", "/api/v3/plan/sauc/bigmodel_nostream");
    }

    public String open(String url, Map<String, String> headers, int timeoutMs) {
        if (!isAllowedUrl(url)) throw new IllegalArgumentException("只允许连接火山方舟 Agent Plan 语音识别地址");
        Map<String, String> accepted = filterHeaders(headers);
        String secret = accepted.get("X-Api-Key");
        if (secret == null || secret.isBlank()) throw new IllegalArgumentException("缺少语音识别 Key");
        int timeout = Math.max(1000, Math.min(timeoutMs <= 0 ? 12000 : timeoutMs, 20000));
        String id = UUID.randomUUID().toString();
        Session session = new Session(id, secret);
        sessions.put(id, session);
        OkHttpClient scoped = http.newBuilder().connectTimeout(timeout, TimeUnit.MILLISECONDS).build();
        Request.Builder request = new Request.Builder().url(url);
        for (Map.Entry<String, String> entry : accepted.entrySet()) request.header(entry.getKey(), entry.getValue());
        session.watchdog = scheduler.schedule(() -> terminate(session, "火山方舟 Plan 语音识别连接超时"), timeout, TimeUnit.MILLISECONDS);
        session.socket = scoped.newWebSocket(request.build(), new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                List<byte[]> queued;
                synchronized (session) {
                    if (session.terminal.get()) return;
                    session.opened.set(true);
                    cancelWatchdog(session);
                    queued = new ArrayList<>(session.pending);
                    session.pending.clear();
                }
                for (byte[] data : queued) {
                    if (!webSocket.send(ByteString.of(data))) {
                        terminate(session, "火山方舟 Plan 语音识别发送失败");
                        return;
                    }
                }
                listener.onOpen(id);
            }

            @Override
            public void onMessage(WebSocket webSocket, ByteString bytes) {
                if (session.terminal.get() || !sessions.containsKey(id)) return;
                listener.onBinaryMessage(id, bytes.toByteArray());
            }

            @Override
            public void onMessage(WebSocket webSocket, String text) {
                terminate(session, "火山方舟 Plan 语音识别返回了非二进制数据");
            }

            @Override
            public void onClosing(WebSocket webSocket, int code, String reason) {
                webSocket.close(1000, null);
            }

            @Override
            public void onClosed(WebSocket webSocket, int code, String reason) {
                terminate(session, null);
            }

            @Override
            public void onFailure(WebSocket webSocket, Throwable error, Response response) {
                terminate(session, error == null ? "" : String.valueOf(error.getMessage()));
            }
        });
        return id;
    }

    public void send(String socketId, byte[] data) {
        Session session = sessions.get(socketId);
        if (session == null) throw new IllegalStateException("识别连接已关闭");
        byte[] payload = data == null ? new byte[0] : data;
        WebSocket socket;
        synchronized (session) {
            if (session.terminal.get()) throw new IllegalStateException("识别连接已关闭");
            if (!session.opened.get() || session.socket == null) {
                session.pending.add(payload);
                return;
            }
            socket = session.socket;
        }
        if (!socket.send(ByteString.of(payload))) terminate(session, "火山方舟 Plan 语音识别发送失败");
    }

    public void close(String socketId) {
        Session session = sessions.get(socketId);
        if (session != null) terminate(session, null);
    }

    public void closeAll() {
        for (String id : new ArrayList<>(sessions.keySet())) close(id);
    }

    public void shutdown() {
        closeAll();
        scheduler.shutdownNow();
        http.dispatcher().executorService().shutdown();
        http.connectionPool().evictAll();
    }

    private boolean isAllowedUrl(String url) {
        if (isOfficialPlanAsrUrl(url)) return true;
        return allowLoopback && isLoopbackUrl(url);
    }

    private static boolean isLoopbackUrl(String url) {
        return matches(url, "ws", "127.0.0.1", "/api/v3/plan/sauc/bigmodel_nostream")
            || matches(url, "ws", "localhost", "/api/v3/plan/sauc/bigmodel_nostream");
    }

    private static boolean matches(String url, String scheme, String host, String path) {
        if (url == null || url.isBlank()) return false;
        try {
            URI uri = new URI(url.trim());
            return scheme.equalsIgnoreCase(uri.getScheme())
                && host.equalsIgnoreCase(uri.getHost())
                && path.equals(uri.getPath())
                && (uri.getRawQuery() == null || uri.getRawQuery().isEmpty())
                && (uri.getRawFragment() == null || uri.getRawFragment().isEmpty())
                && (uri.getUserInfo() == null || uri.getUserInfo().isEmpty());
        } catch (Exception error) {
            return false;
        }
    }

    private static Map<String, String> filterHeaders(Map<String, String> headers) {
        Map<String, String> accepted = new LinkedHashMap<>();
        if (headers == null) return accepted;
        for (String allowed : ALLOWED_HEADERS) {
            String value = null;
            for (Map.Entry<String, String> entry : headers.entrySet()) {
                if (entry.getKey() != null && entry.getKey().equalsIgnoreCase(allowed)) value = entry.getValue();
            }
            if (value != null && !value.isBlank()) accepted.put(allowed, value.trim());
        }
        return accepted;
    }

    private void terminate(Session session, String error) {
        if (session == null) return;
        if (!session.terminal.compareAndSet(false, true)) return;
        cancelWatchdog(session);
        WebSocket socket;
        synchronized (session) {
            socket = session.socket;
            session.socket = null;
            session.pending.clear();
        }
        sessions.remove(session.id);
        if (error != null) listener.onError(session.id, publicError(error, session.secret));
        session.secret = "";
        if (socket != null) socket.cancel();
        if (session.closedNotified.compareAndSet(false, true)) listener.onClosed(session.id);
    }

    private static void cancelWatchdog(Session session) {
        ScheduledFuture<?> watchdog = session.watchdog;
        if (watchdog != null) watchdog.cancel(false);
    }

    static String publicError(String message, String secret) {
        String text = message == null ? "" : message;
        if (secret != null && secret.length() >= 4) text = text.replace(secret, "");
        String lower = text.toLowerCase(Locale.US);
        if (lower.contains("timeout") || lower.contains("timed out")) return "火山方舟 Plan 语音识别连接超时";
        text = text.replaceAll("(?i)x-api-key\\s*[:=]\\s*\\S*", "").trim();
        if (text.length() > 160) text = text.substring(0, 160).trim();
        return text.isEmpty() ? "火山方舟 Plan 语音识别连接失败" : text;
    }

    private static final class Session {
        private final String id;
        private String secret;
        private final List<byte[]> pending = new ArrayList<>();
        private final AtomicBoolean opened = new AtomicBoolean(false);
        private final AtomicBoolean terminal = new AtomicBoolean(false);
        private final AtomicBoolean closedNotified = new AtomicBoolean(false);
        private WebSocket socket;
        private volatile ScheduledFuture<?> watchdog;

        private Session(String id, String secret) {
            this.id = id;
            this.secret = secret;
        }
    }
}
