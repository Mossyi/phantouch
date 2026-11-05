import React from 'react';
import { Timer } from 'lucide-react';
import type { SafetyConfig, VoiceCallTurnTiming } from '../types';
import { useAppStore } from '../store/useAppStore';

type SetConfig = (patch: Partial<SafetyConfig>) => void;

interface SttPreset {
  id: string;
  name: string;
  hint: string;
  baseUrl: string;
  models: string[];
}

/** OpenAI 兼容的 /audio/transcriptions 服务预设；模型名可自由填写 */
const OPENAI_STT_PRESETS: SttPreset[] = [
  { id: 'openai', name: 'OpenAI', hint: 'gpt-4o 转写，准确', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'] },
  { id: 'groq', name: 'Groq', hint: 'Whisper Turbo，速度极快', baseUrl: 'https://api.groq.com/openai/v1', models: ['whisper-large-v3-turbo', 'whisper-large-v3'] },
  { id: 'local', name: '本地 Whisper', hint: '局域网自建服务，可不填 Key', baseUrl: 'http://192.168.1.10:8000/v1', models: ['Systran/faster-whisper-small', 'Systran/faster-whisper-large-v3'] },
];

/** 语音识别：OpenAI 兼容接口（OpenAI / Groq / 本地 Whisper 等） */
export const OpenAiSttFields: React.FC<{ config: SafetyConfig; setConfig: SetConfig }> = ({ config, setConfig }) => {
  const savedBaseUrl = config.openaiSttBaseUrl || '';
  // 地址在保存时校验（只接受 HTTPS 或局域网 HTTP）；逐字输入时先存草稿，失焦再提交，避免中途被回退
  const [baseUrlDraft, setBaseUrlDraft] = React.useState(savedBaseUrl);
  const [rejected, setRejected] = React.useState(false);
  React.useEffect(() => { setBaseUrlDraft(savedBaseUrl); }, [savedBaseUrl]);

  const commitBaseUrl = (value: string) => {
    setConfig({ openaiSttBaseUrl: value });
    // 保存是同步且会规范化；保存后的值与输入不一致，说明地址没有通过校验、保留了上一次的有效值
    const saved = useAppStore.getState().safetyConfig.openaiSttBaseUrl || '';
    setRejected(value.trim().replace(/\/+$/, '') !== saved);
  };

  const preset = OPENAI_STT_PRESETS.find((item) => savedBaseUrl === item.baseUrl);
  const modelSuggestions = preset?.models ?? OPENAI_STT_PRESETS.flatMap((item) => item.models);

  return (
    <div className="space-y-2 rounded-xl border border-pink-200 bg-white p-3 shadow-sm">
      <div className="grid grid-cols-3 gap-1.5">
        {OPENAI_STT_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setRejected(false);
              setBaseUrlDraft(item.baseUrl);
              setConfig({ openaiSttBaseUrl: item.baseUrl, openaiSttModel: item.models[0] });
            }}
            className={`rounded-lg border p-2 text-left transition-all ${preset?.id === item.id ? 'border-pink-400 bg-pink-50 text-pink-700 shadow-sm' : 'border-pink-100 bg-white text-slate-600 hover:border-pink-200'}`}
          >
            <span className="block text-[10px] font-black text-slate-800">{item.name}</span>
            <span className="block text-[8.5px] text-slate-500">{item.hint}</span>
          </button>
        ))}
      </div>
      <label className="block text-[10px] font-bold text-slate-700">接口地址
        <input
          value={baseUrlDraft}
          onChange={(event) => { setBaseUrlDraft(event.target.value); setRejected(false); }}
          onBlur={() => commitBaseUrl(baseUrlDraft)}
          placeholder="https://api.example.com/v1"
          className="mt-1 w-full rounded-lg border border-pink-200 bg-pink-50/30 px-2.5 py-2 font-mono text-[10px] text-slate-800 outline-none focus:border-pink-400"
        />
      </label>
      {rejected && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] text-amber-800">
          地址需为 HTTPS，或局域网内的 HTTP（本地服务），且不能带账号或查询参数；已保留上一次的有效地址。
        </p>
      )}
      <label className="block text-[10px] font-bold text-slate-700">API Key
        <input
          type="password"
          autoComplete="off"
          value={config.openaiSttApiKey || ''}
          onChange={(event) => setConfig({ openaiSttApiKey: event.target.value })}
          placeholder={preset?.id === 'local' ? '本地服务可不填' : 'sk-...'}
          className="mt-1 w-full rounded-lg border border-pink-200 bg-pink-50/30 px-2.5 py-2 font-mono text-[10px] text-slate-800 outline-none focus:border-pink-400"
        />
      </label>
      <label className="block text-[10px] font-bold text-slate-700">识别模型
        <input
          list="stt-openai-models"
          value={config.openaiSttModel || ''}
          onChange={(event) => setConfig({ openaiSttModel: event.target.value })}
          placeholder="gpt-4o-mini-transcribe"
          className="mt-1 w-full rounded-lg border border-pink-200 bg-pink-50/30 px-2.5 py-2 font-mono text-[10px] text-slate-800 outline-none focus:border-pink-400"
        />
        <datalist id="stt-openai-models">
          {modelSuggestions.map((model) => <option key={model} value={model} />)}
        </datalist>
      </label>
      <p className="text-[9.5px] leading-4 text-slate-500">兼容任何实现了 /audio/transcriptions 的服务。通话里会显示每一轮的识别耗时，方便对比哪个模型最快。</p>
    </div>
  );
};

const TURN_TIMINGS: Array<{ id: VoiceCallTurnTiming; name: string; hint: string }> = [
  { id: 'fast', name: '快', hint: '停顿约 0.55 秒就回应' },
  { id: 'standard', name: '标准', hint: '约 0.8 秒' },
  { id: 'patient', name: '耐心', hint: '约 1.2 秒，说话常停顿时选' },
];

/** 语音通话的断句快慢（仅云端识别生效；浏览器识别由浏览器自己断句） */
export const VoiceCallTimingSetting: React.FC<{ config: SafetyConfig; setConfig: SetConfig }> = ({ config, setConfig }) => {
  const current = config.voiceCallTurnTiming || 'standard';
  return (
    <div className="space-y-2 rounded-2xl border border-pink-200 bg-pink-50/40 p-3">
      <div className="flex items-center gap-2">
        <div className="rounded-lg border border-pink-200 bg-pink-50 p-1.5 text-pink-600"><Timer className="h-4 w-4" /></div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">语音通话断句</h3>
          <p className="text-[10px] text-slate-500">停顿多久算你说完了。越快回应越及时，但说话中间停顿时容易被抢话</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {TURN_TIMINGS.map((timing) => (
          <button
            key={timing.id}
            type="button"
            onClick={() => setConfig({ voiceCallTurnTiming: timing.id })}
            className={`rounded-xl border px-2 py-2 text-center transition-all ${current === timing.id ? 'border-pink-300 bg-pink-50 text-pink-700 shadow-sm font-black' : 'border-pink-100 bg-white text-slate-600 hover:border-pink-200'}`}
          >
            <span className="block text-[11px] font-bold">{timing.name}</span>
            <span className="mt-0.5 block text-[8.5px] opacity-80">{timing.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
