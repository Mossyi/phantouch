package com.yiciyuan.aicontroller;

import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(name = "NativeTts")
public class NativeTtsPlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech textToSpeech;
    private volatile boolean ready = false;
    private volatile PluginCall pendingCall;
    private volatile PluginCall activeCall;
    private volatile String activeUtteranceId;

    @Override
    public void load() {
        textToSpeech = new TextToSpeech(getContext(), this);
    }

    @Override
    public void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        if (ready && textToSpeech != null) {
            textToSpeech.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build());
        }
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;
        getActivity().runOnUiThread(() -> {
            if (ready) speakNow(call);
            else call.reject("手机系统语音引擎初始化失败");
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty()) {
            call.reject("朗读文本不能为空");
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (!ready) {
                if (pendingCall != null) pendingCall.reject("上一条语音请求已被替换");
                pendingCall = call;
                return;
            }
            speakNow(call);
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (textToSpeech != null) textToSpeech.stop();
            finishActive(false, "语音播放已停止");
            call.resolve();
        });
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject status = new JSObject();
            status.put("ready", ready && textToSpeech != null);
            status.put("engineName", textToSpeech == null ? "" : textToSpeech.getDefaultEngine());
            status.put("voiceName", textToSpeech == null || textToSpeech.getVoice() == null ? "" : textToSpeech.getVoice().getName());

            if (!ready || textToSpeech == null) {
                status.put("languageAvailable", false);
                status.put("chineseVoiceCount", 0);
                status.put("message", "手机系统 TTS 尚未就绪，请检查系统文字转语音引擎");
                call.resolve(status);
                return;
            }

            Locale locale = Locale.forLanguageTag(call.getString("lang", "zh-CN"));
            int languageResult = textToSpeech.isLanguageAvailable(locale);
            boolean languageAvailable = languageResult != TextToSpeech.LANG_MISSING_DATA
                && languageResult != TextToSpeech.LANG_NOT_SUPPORTED;
            status.put("languageAvailable", languageAvailable);
            status.put("chineseVoiceCount", countVoicesFor(locale));
            status.put("message", languageAvailable
                ? "Android 中文语音引擎可用"
                : "手机未安装中文语音数据，请打开系统文字转语音设置下载");
            call.resolve(status);
        });
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent("com.android.settings.TTS_SETTINGS");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception error) {
                try {
                    Intent fallback = new Intent(Settings.ACTION_SETTINGS);
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(fallback);
                    call.resolve();
                } catch (Exception fallbackError) {
                    call.reject("无法打开手机文字转语音设置", fallbackError);
                }
            }
        });
    }

    private void speakNow(PluginCall call) {
        if (textToSpeech == null) {
            call.reject("手机系统语音引擎不可用");
            return;
        }
        finishActive(false, "上一条语音请求已被替换");
        Locale locale = Locale.forLanguageTag(call.getString("lang", "zh-CN"));
        int languageResult = textToSpeech.setLanguage(locale);
        if (languageResult == TextToSpeech.LANG_MISSING_DATA || languageResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            call.reject("手机未安装所需语音数据，请在系统文字转语音设置中下载中文语音包");
            return;
        }
        Voice bestVoice = chooseBestVoice(locale);
        if (bestVoice != null) textToSpeech.setVoice(bestVoice);
        Float rate = call.getFloat("rate", 1.0f);
        Float pitch = call.getFloat("pitch", 1.0f);
        textToSpeech.setSpeechRate(clamp(rate == null ? 1.0f : rate, 0.5f, 2.0f));
        textToSpeech.setPitch(clamp(pitch == null ? 1.0f : pitch, 0.5f, 2.0f));

        activeCall = call;
        activeUtteranceId = UUID.randomUUID().toString();
        textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {}

            @Override
            public void onDone(String utteranceId) {
                if (utteranceId.equals(activeUtteranceId)) finishActive(true, null);
            }

            @Override
            public void onError(String utteranceId) {
                if (utteranceId.equals(activeUtteranceId)) finishActive(false, "手机系统语音播放失败");
            }
        });
        Bundle params = new Bundle();
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, activeUtteranceId);
        int result = textToSpeech.speak(call.getString("text"), TextToSpeech.QUEUE_FLUSH, params, activeUtteranceId);
        if (result == TextToSpeech.ERROR) finishActive(false, "手机系统语音请求被拒绝");
    }

    private void finishActive(boolean success, String error) {
        PluginCall call = activeCall;
        activeCall = null;
        activeUtteranceId = null;
        if (call == null) return;
        getActivity().runOnUiThread(() -> {
            if (success) call.resolve();
            else call.reject(error == null ? "手机系统语音播放失败" : error);
        });
    }

    private float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }

    private int countVoicesFor(Locale locale) {
        if (textToSpeech == null) return 0;
        Set<Voice> voices = textToSpeech.getVoices();
        if (voices == null) return 0;
        int count = 0;
        for (Voice voice : voices) {
            if (matchesLanguage(voice.getLocale(), locale)) count++;
        }
        return count;
    }

    private Voice chooseBestVoice(Locale locale) {
        if (textToSpeech == null) return null;
        Set<Voice> voices = textToSpeech.getVoices();
        if (voices == null || voices.isEmpty()) return null;
        Voice best = null;
        int bestScore = Integer.MIN_VALUE;
        for (Voice voice : voices) {
            if (!matchesLanguage(voice.getLocale(), locale)) continue;
            int score = voice.getQuality() * 10 - voice.getLatency();
            if (!voice.isNetworkConnectionRequired()) score += 20;
            String name = voice.getName().toLowerCase(Locale.ROOT);
            if (name.contains("zh-cn") || name.contains("cmn-cn")) score += 30;
            if (score > bestScore) {
                best = voice;
                bestScore = score;
            }
        }
        return best;
    }

    private boolean matchesLanguage(Locale voiceLocale, Locale requestedLocale) {
        if (voiceLocale == null || requestedLocale == null) return false;
        if (!voiceLocale.getLanguage().equalsIgnoreCase(requestedLocale.getLanguage())) return false;
        return requestedLocale.getCountry().isEmpty()
            || voiceLocale.getCountry().isEmpty()
            || voiceLocale.getCountry().equalsIgnoreCase(requestedLocale.getCountry());
    }

    @Override
    protected void handleOnDestroy() {
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        super.handleOnDestroy();
    }
}
