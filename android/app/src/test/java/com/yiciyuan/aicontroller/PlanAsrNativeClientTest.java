package com.yiciyuan.aicontroller;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import okhttp3.Headers;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;
import org.junit.Test;

public class PlanAsrNativeClientTest {
    private static final String SECRET = "unit-test-plan-key";

    @Test
    public void officialUrlRejectsQueryAndOtherHosts() {
        assertTrue(PlanAsrNativeClient.isOfficialPlanAsrUrl(PlanAsrNativeClient.OFFICIAL_URL));
        assertFalse(PlanAsrNativeClient.isOfficialPlanAsrUrl(PlanAsrNativeClient.OFFICIAL_URL + "?X-Api-Key=" + SECRET));
        assertFalse(PlanAsrNativeClient.isOfficialPlanAsrUrl("wss://example.com/api/v3/plan/sauc/bigmodel_nostream"));
        assertFalse(PlanAsrNativeClient.isOfficialPlanAsrUrl("https://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream"));
    }

    @Test
    public void handshakeCarriesHeadersAndEchoesBinaryWithoutPuttingKeyInUrlOrError() throws Exception {
        AtomicReference<Headers> seen = new AtomicReference<>();
        AtomicReference<String> path = new AtomicReference<>();
        try (MockWebServer server = new MockWebServer()) {
            server.enqueue(new MockResponse().withWebSocketUpgrade(new WebSocketListener() {
                @Override
                public void onOpen(WebSocket webSocket, okhttp3.Response response) {
                    seen.set(webSocket.request().headers());
                    path.set(webSocket.request().url().encodedPath());
                }

                @Override
                public void onMessage(WebSocket webSocket, ByteString bytes) {
                    webSocket.send(bytes);
                }
            }));
            server.start();
            String url = "ws://127.0.0.1:" + server.getPort() + "/api/v3/plan/sauc/bigmodel_nostream";
            Recording listener = new Recording();
            PlanAsrNativeClient client = new PlanAsrNativeClient(listener, true);
            try {
                String id = client.open(url, planHeaders(), 3000);
                assertTrue(listener.open.await(3, TimeUnit.SECONDS));
                var recorded = server.takeRequest(3, TimeUnit.SECONDS);
                assertEquals("/api/v3/plan/sauc/bigmodel_nostream", recorded.getPath().split("\\?")[0]);
                assertFalse(recorded.getPath().contains(SECRET));
                assertEquals(SECRET, recorded.getHeader("X-Api-Key"));
                assertEquals("volc.seedasr.sauc.duration", recorded.getHeader("X-Api-Resource-Id"));
                assertEquals("req-1", recorded.getHeader("X-Api-Request-Id"));
                assertEquals("conn-1", recorded.getHeader("X-Api-Connect-Id"));
                assertEquals("-1", recorded.getHeader("X-Api-Sequence"));
                assertEquals(null, recorded.getHeader("Authorization"));
                assertFalse(url.contains(SECRET));
                byte[] payload = new byte[] { 0x11, 0x21, 0x11, 0x00, 9, 8, 7 };
                client.send(id, payload);
                assertTrue(listener.message.await(3, TimeUnit.SECONDS));
                assertArrayEquals(payload, listener.bytes.get());
                client.close(id);
                assertTrue(listener.closed.await(3, TimeUnit.SECONDS));
                assertEquals("", listener.error.get());
            } finally {
                client.shutdown();
            }
        }
    }

    @Test
    public void rejectedHandshakeDoesNotReturnTheKey() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.enqueue(new MockResponse().setResponseCode(401).setBody("rejected " + SECRET));
            server.start();
            String url = "ws://127.0.0.1:" + server.getPort() + "/api/v3/plan/sauc/bigmodel_nostream";
            Recording listener = new Recording();
            PlanAsrNativeClient client = new PlanAsrNativeClient(listener, true);
            try {
                client.open(url, planHeaders(), 3000);
                assertTrue(listener.errorLatch.await(3, TimeUnit.SECONDS));
                assertFalse(listener.error.get().contains(SECRET));
                assertFalse(listener.error.get().toLowerCase().contains("x-api-key"));
            } finally {
                client.shutdown();
            }
        }
    }

    @Test
    public void timeoutAndCancelStayQuietAboutTheKey() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.enqueue(new MockResponse().setSocketPolicy(okhttp3.mockwebserver.SocketPolicy.NO_RESPONSE));
            server.start();
            String url = "ws://127.0.0.1:" + server.getPort() + "/api/v3/plan/sauc/bigmodel_nostream";
            Recording listener = new Recording();
            PlanAsrNativeClient client = new PlanAsrNativeClient(listener, true);
            try {
                String id = client.open(url, planHeaders(), 1000);
                client.close(id);
                assertTrue(listener.closed.await(2, TimeUnit.SECONDS));
                assertFalse(listener.error.get().contains(SECRET));
            } finally {
                client.shutdown();
            }
        }
    }

    @Test
    public void closingOneTurnDoesNotDropTheNext() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.enqueue(new MockResponse().withWebSocketUpgrade(echo()));
            server.enqueue(new MockResponse().withWebSocketUpgrade(echo()));
            server.start();
            String url = "ws://127.0.0.1:" + server.getPort() + "/api/v3/plan/sauc/bigmodel_nostream";
            Recording listener = new Recording();
            PlanAsrNativeClient client = new PlanAsrNativeClient(listener, true);
            try {
                String first = client.open(url, planHeaders(), 3000);
                assertTrue(listener.open.await(3, TimeUnit.SECONDS));
                client.close(first);
                assertTrue(listener.closed.await(3, TimeUnit.SECONDS));
                Recording secondListener = new Recording();
                PlanAsrNativeClient second = new PlanAsrNativeClient(secondListener, true);
                try {
                    String id = second.open(url, planHeaders(), 3000);
                    assertTrue(secondListener.open.await(3, TimeUnit.SECONDS));
                    second.send(id, new byte[] { 4, 5 });
                    assertTrue(secondListener.message.await(3, TimeUnit.SECONDS));
                    assertArrayEquals(new byte[] { 4, 5 }, secondListener.bytes.get());
                } finally {
                    second.shutdown();
                }
            } finally {
                client.shutdown();
            }
        }
    }

    @Test
    public void publicErrorStripsSecretAndTimeout() {
        assertEquals("火山方舟 Plan 语音识别连接超时", PlanAsrNativeClient.publicError("timeout " + SECRET, SECRET));
        assertFalse(PlanAsrNativeClient.publicError("rejected " + SECRET, SECRET).contains(SECRET));
        assertFalse(PlanAsrNativeClient.publicError("X-Api-Key: " + SECRET, SECRET).toLowerCase().contains("x-api-key"));
    }

    private static Map<String, String> planHeaders() {
        return Map.of(
            "X-Api-Key", SECRET,
            "X-Api-Resource-Id", "volc.seedasr.sauc.duration",
            "X-Api-Request-Id", "req-1",
            "X-Api-Connect-Id", "conn-1",
            "X-Api-Sequence", "-1",
            "Authorization", "Bearer should-not-forward"
        );
    }

    private static WebSocketListener echo() {
        return new WebSocketListener() {
            @Override
            public void onMessage(WebSocket webSocket, ByteString bytes) {
                webSocket.send(bytes);
            }
        };
    }

    private static final class Recording implements PlanAsrNativeClient.Listener {
        private final CountDownLatch open = new CountDownLatch(1);
        private final CountDownLatch message = new CountDownLatch(1);
        private final CountDownLatch closed = new CountDownLatch(1);
        private final CountDownLatch errorLatch = new CountDownLatch(1);
        private final AtomicReference<byte[]> bytes = new AtomicReference<>();
        private final AtomicReference<String> error = new AtomicReference<>("");

        @Override
        public void onOpen(String socketId) { open.countDown(); }

        @Override
        public void onBinaryMessage(String socketId, byte[] data) {
            bytes.set(data);
            message.countDown();
        }

        @Override
        public void onError(String socketId, String message) {
            error.set(message);
            errorLatch.countDown();
        }

        @Override
        public void onClosed(String socketId) { closed.countDown(); }
    }
}
