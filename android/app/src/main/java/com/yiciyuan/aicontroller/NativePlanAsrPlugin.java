package com.yiciyuan.aicontroller;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import org.json.JSONObject;

@CapacitorPlugin(name = "NativePlanAsr")
public class NativePlanAsrPlugin extends Plugin {
    private PlanAsrNativeClient client;

    @Override
    public void load() {
        client = new PlanAsrNativeClient(new PlanAsrNativeClient.Listener() {
            @Override
            public void onOpen(String socketId) {
                emit("open", socketId, null, null);
            }

            @Override
            public void onBinaryMessage(String socketId, byte[] data) {
                emit("message", socketId, Base64.encodeToString(data, Base64.NO_WRAP), null);
            }

            @Override
            public void onError(String socketId, String message) {
                emit("error", socketId, null, message);
            }

            @Override
            public void onClosed(String socketId) {
                emit("close", socketId, null, null);
            }
        });
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", true);
        call.resolve(result);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");
        int timeout = call.getInt("connectTimeoutMs", 12000);
        try {
            String socketId = client.open(url, readHeaders(call.getObject("headers")), timeout);
            JSObject result = new JSObject();
            result.put("socketId", socketId);
            call.resolve(result);
        } catch (RuntimeException error) {
            call.reject(error.getMessage() == null ? "火山方舟 Plan 语音识别连接失败" : error.getMessage());
        }
    }

    @PluginMethod
    public void send(PluginCall call) {
        String socketId = call.getString("socketId", "");
        String encoded = call.getString("data", "");
        try {
            client.send(socketId, Base64.decode(encoded, Base64.DEFAULT));
            call.resolve();
        } catch (RuntimeException error) {
            call.reject(error.getMessage() == null ? "识别连接已关闭" : error.getMessage());
        }
    }

    @PluginMethod
    public void close(PluginCall call) {
        client.close(call.getString("socketId", ""));
        call.resolve();
    }

    @Override
    protected void handleOnStop() {
        if (client != null) client.closeAll();
        super.handleOnStop();
    }

    @Override
    protected void handleOnDestroy() {
        if (client != null) client.shutdown();
        super.handleOnDestroy();
    }

    private void emit(String event, String socketId, String data, String message) {
        JSObject payload = new JSObject();
        payload.put("socketId", socketId);
        if (data != null) payload.put("data", data);
        if (message != null) payload.put("message", message);
        notifyListeners(event, payload);
    }

    private static Map<String, String> readHeaders(JSObject headers) {
        Map<String, String> values = new HashMap<>();
        if (headers == null) return values;
        Iterator<String> keys = headers.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object value = headers.opt(key);
            if (value != null && value != JSONObject.NULL) values.put(key, String.valueOf(value));
        }
        return values;
    }
}
