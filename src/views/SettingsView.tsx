import React, { useState, useEffect, useRef } from 'react';
import { SponsorPanel } from '../components/SponsorPanel';
import { DataManagementPanel } from '../components/DataManagementPanel';
import { ModelCapabilityPanel } from '../components/ModelCapabilityPanel';
import { ModelProfilesPanel } from '../components/ModelProfilesPanel';
import { BuildInfoPanel } from '../components/BuildInfoPanel';
import { AppDiagnosticsPanel } from '../components/AppDiagnosticsPanel';
import { TavernMessageContent } from '../components/tavern/TavernMessageContent';
import { useAppStore } from '../store/useAppStore';
import { parseApiBaseUrl } from '../core/apiBaseUrl';
import { hasSameApiCredentialScope } from '../core/llmConfig';
import { findLlmProviderPreset, LLM_PROVIDER_PRESETS, LlmProviderPreset } from '../core/llmProviders';
import { probeVolcenginePlanModel } from '../core/ai/llmClient';
import {
  DEFAULT_SILICONFLOW_TTS_MODEL,
  DEFAULT_SILICONFLOW_TTS_VOICE,
  SILICONFLOW_TTS_MODELS,
  SILICONFLOW_TTS_VOICES,
  buildSiliconflowVoiceId,
  isMossSiliconflowTtsModel,
} from '../core/voice/siliconflowTts';
import { TTSManager } from '../core/voice/ttsManager';
import { VOLCENGINE_TTS_VOICE_CATEGORIES, VOLCENGINE_TTS_VOICE_PRESETS } from '../core/voice/volcengineTts';
import { Shield, Key, Sliders, Smartphone, Vibrate, Check, Eye, EyeOff, Sparkles, Trash2, Plus, X, Download, Upload, Copy, ExternalLink, ChevronDown, Type, Mic } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const {
    llmConfig,
    setLlmConfig,
    safetyConfig,
    setSafetyConfig,
    chatDisplayConfig,
    setChatDisplayConfig,
    ttsVoiceProfiles,
    saveTtsVoiceProfile,
    deleteTtsVoiceProfile,
    replaceTtsVoiceProfiles,
    replaceCustomPersonas,
  } = useAppStore();

  const [apiKeyInput, setApiKeyInput] = useState(llmConfig.apiKey);
  const [baseUrlInput, setBaseUrlInput] = useState(llmConfig.baseUrl);
  const [modelInput, setModelInput] = useState(llmConfig.model);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [customEndpointMode, setCustomEndpointMode] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [backupText, setBackupText] = useState('');
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState(false);
  const [nativeTtsStatus, setNativeTtsStatus] = useState('');
  const [checkingNativeTts, setCheckingNativeTts] = useState(false);
  const [siliconflowTtsKeyInput, setSiliconflowTtsKeyInput] = useState(safetyConfig.siliconflowTtsApiKey || '');
  const [showSiliconflowTtsKey, setShowSiliconflowTtsKey] = useState(false);
  const [siliconflowTtsKeySaved, setSiliconflowTtsKeySaved] = useState(false);
  const [volcengineVoiceFilter, setVolcengineVoiceFilter] = useState<string>('全部');
  const [voiceProfileName, setVoiceProfileName] = useState('');
  const [voiceProfileNotice, setVoiceProfileNotice] = useState('');
  const [activeSection, setActiveSection] = useState<'sponsor' | 'ai' | 'voice' | 'general'>('ai');
  const [testingPlanModels, setTestingPlanModels] = useState(false);
  const [planModelTestResults, setPlanModelTestResults] = useState<Record<string, { ok?: boolean; latencyMs?: number; message: string }>>({});
  const planTestAbortRef = useRef<AbortController | null>(null);
  const [showAdvancedLlm, setShowAdvancedLlm] = useState(false);

  const mountedRef = useRef(true);
  const toastTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      toastTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    setApiKeyInput(llmConfig.apiKey);
    setBaseUrlInput(llmConfig.baseUrl);
    setModelInput(llmConfig.model);
  }, [llmConfig.apiKey, llmConfig.baseUrl, llmConfig.model]);

  useEffect(() => {
    setSiliconflowTtsKeyInput(safetyConfig.siliconflowTtsApiKey || '');
  }, [safetyConfig.siliconflowTtsApiKey]);

  useEffect(() => () => planTestAbortRef.current?.abort(), []);

  const checkNativeTts = async () => {
    setCheckingNativeTts(true);
    setNativeTtsStatus('');
    try {
      const status = await TTSManager.getInstance().getAndroidTtsStatus();
      if (!status) {
        setNativeTtsStatus('当前是浏览器环境；Android 原生 TTS 状态只能在 APK 中检测。');
        return;
      }
      setNativeTtsStatus([
        status.message,
        status.engineName ? `引擎：${status.engineName}` : '',
        status.voiceName ? `音色：${status.voiceName}` : '',
        `可用中文音色：${status.chineseVoiceCount} 个`,
      ].filter(Boolean).join(' · '));
    } catch (error) {
      setNativeTtsStatus(`检测失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (mountedRef.current) {
        setCheckingNativeTts(false);
      }
    }
  };


  const activeProvider = findLlmProviderPreset(baseUrlInput);
  const customEndpointSelected = customEndpointMode || !activeProvider;
  const isTunableOnlineTts = safetyConfig.ttsEngine === 'siliconflow' || safetyConfig.ttsEngine === 'volcengine_tts';
  const currentBaseVoiceId = safetyConfig.ttsEngine === 'siliconflow'
    ? safetyConfig.siliconflowTtsVoice || DEFAULT_SILICONFLOW_TTS_VOICE
    : safetyConfig.ttsEngine === 'volcengine_tts'
      ? safetyConfig.volcengineTtsVoice || 'zh_female_vv_uranus_bigtts'
      : '';
  const currentBaseVoiceName = safetyConfig.ttsEngine === 'siliconflow'
    ? SILICONFLOW_TTS_VOICES.find((voice) => voice.id === currentBaseVoiceId)?.name || currentBaseVoiceId
    : safetyConfig.ttsEngine === 'volcengine_tts'
      ? VOLCENGINE_TTS_VOICE_PRESETS.find((voice) => voice.id === currentBaseVoiceId)?.name || currentBaseVoiceId
      : '';
  const currentEngineVoiceProfiles = isTunableOnlineTts
    ? ttsVoiceProfiles.filter((profile) => profile.engine === safetyConfig.ttsEngine)
    : [];

  const handleSaveVoiceProfile = () => {
    if (!isTunableOnlineTts || !currentBaseVoiceId) return;
    const engine = safetyConfig.ttsEngine;
    if (engine !== 'siliconflow' && engine !== 'volcengine_tts') return;
    const name = voiceProfileName.trim();
    if (!name) {
      setVoiceProfileNotice('请先给这条角色声线起一个名字。');
      return;
    }
    saveTtsVoiceProfile({
      name,
      engine,
      baseVoiceId: currentBaseVoiceId,
      baseVoiceName: currentBaseVoiceName,
      rate: safetyConfig.voiceRate,
      pitch: engine === 'siliconflow' ? 1 : safetyConfig.voicePitch,
      gain: safetyConfig.voiceGain,
    });
    setVoiceProfileName('');
    setVoiceProfileNotice(`已保存角色声线“${name}”。`);
  };

  const applyVoiceProfile = (profileId: string) => {
    const profile = ttsVoiceProfiles.find((item) => item.id === profileId);
    if (!profile) return;
    setSafetyConfig({
      ttsEngine: profile.engine,
      siliconflowTtsVoice: profile.engine === 'siliconflow' ? profile.baseVoiceId : safetyConfig.siliconflowTtsVoice,
      volcengineTtsVoice: profile.engine === 'volcengine_tts' ? profile.baseVoiceId : safetyConfig.volcengineTtsVoice,
      voiceRate: profile.rate,
      voicePitch: profile.pitch,
      voiceGain: profile.gain,
    });
    setVoiceProfileNotice(`已应用“${profile.name}”。`);
  };

  const handleSaveApi = () => {
    const safeBaseUrl = parseApiBaseUrl(baseUrlInput);
    if (!safeBaseUrl) {
      alert('API 地址无效：必须使用 HTTPS（仅本机 localhost 可使用 HTTP），且不能包含凭据、查询串或片段');
      return;
    }
    const nextModel = modelInput.trim().slice(0, 200);
    if (customEndpointSelected && !nextModel) {
      alert('请先填写自定义模型 ID');
      return;
    }
    const endpointChanged = !hasSameApiCredentialScope(safeBaseUrl, llmConfig.baseUrl);
    const nextApiKey = endpointChanged && apiKeyInput.trim() === llmConfig.apiKey
      ? ''
      : apiKeyInput.trim().slice(0, 1000);
    setLlmConfig({
      apiKey: nextApiKey,
      baseUrl: safeBaseUrl,
      model: nextModel,
    });
    if (nextApiKey !== apiKeyInput) setApiKeyInput(nextApiKey);
    setSavedToast(true);
    toastTimersRef.current.push(setTimeout(() => { if (mountedRef.current) setSavedToast(false); }, 2000));
  };

  const handleExportBackup = () => {
    const {
      siliconflowTtsApiKey: _siliconflowTtsApiKey,
      siliconflowSttApiKey: _siliconflowSttApiKey,
      volcengineSttApiKey: _volcengineSttApiKey,
      volcengineSttAccessKey: _volcengineSttAccessKey,
      ...safeSafetyConfig
    } = useAppStore.getState().safetyConfig;
    const data = {
      llmConfig: { ...useAppStore.getState().llmConfig, apiKey: '' },
      safetyConfig: safeSafetyConfig,
      chatDisplayConfig: useAppStore.getState().chatDisplayConfig,
      customPersonas: useAppStore.getState().customPersonas,
      ttsVoiceProfiles: useAppStore.getState().ttsVoiceProfiles,
      exportedAt: new Date().toISOString(),
      containsSecrets: false,
    };
    const jsonStr = JSON.stringify(data, null, 2);
    void navigator.clipboard?.writeText(jsonStr).catch(() => undefined);
    setBackupText(jsonStr);
    setBackupSuccess(true);
    toastTimersRef.current.push(setTimeout(() => { if (mountedRef.current) setBackupSuccess(false); }, 2500));
  };

  const handleImportBackup = () => {
    if (!backupText.trim()) return;
    try {
      if (backupText.length > 2_000_000) throw new Error('备份超过 2 MB 限制');
      const data = JSON.parse(backupText.trim());
      if (!data || typeof data !== 'object') {
        throw new Error('无效的配置对象');
      }
      if (data.llmConfig && typeof data.llmConfig === 'object') {
        const importedBaseUrl = typeof data.llmConfig.baseUrl === 'string'
          ? parseApiBaseUrl(data.llmConfig.baseUrl)
          : llmConfig.baseUrl;
        if (!importedBaseUrl) throw new Error('备份中的 API 地址无效');
        const importedModel = typeof data.llmConfig.model === 'string' ? data.llmConfig.model.slice(0, 200) : llmConfig.model;
        setLlmConfig({ baseUrl: importedBaseUrl, model: importedModel });
        setBaseUrlInput(importedBaseUrl);
        setModelInput(importedModel);
      }
      if (data.safetyConfig && typeof data.safetyConfig === 'object') {
        setSafetyConfig(data.safetyConfig);
      }
      if (data.chatDisplayConfig && typeof data.chatDisplayConfig === 'object') {
        setChatDisplayConfig(data.chatDisplayConfig);
      }
      if (Array.isArray(data.customPersonas)) {
        replaceCustomPersonas(data.customPersonas);
      }
      if (Array.isArray(data.ttsVoiceProfiles)) {
        replaceTtsVoiceProfiles(data.ttsVoiceProfiles);
      }
      setShowBackupModal(false);
      setSavedToast(true);
      toastTimersRef.current.push(setTimeout(() => { if (mountedRef.current) setSavedToast(false); }, 2000));
    } catch (error) {
      alert(`备份数据格式有误：${error instanceof Error ? error.message : '请粘贴合法 JSON'}`);
    }
  };

  const handleApplyPreset = (p: LlmProviderPreset) => {
    setBaseUrlInput(p.baseUrl);
    setModelInput(p.defaultModel);
    setShowModelPicker(false);
    setCustomEndpointMode(false);
    setLlmConfig({ baseUrl: p.baseUrl, model: p.defaultModel });
    if (!hasSameApiCredentialScope(p.baseUrl, llmConfig.baseUrl)) setApiKeyInput('');
  };

  const handleSelectCustomEndpoint = () => {
    setCustomEndpointMode(true);
    setShowModelPicker(false);
  };

  const handleTestPlanModels = async () => {
    const provider = findLlmProviderPreset(baseUrlInput);
    if (provider?.id !== 'volcengine-agent-plan') return;
    if (!apiKeyInput.trim()) {
      setPlanModelTestResults({ _error: { ok: false, message: '请先填写并保存 Agent Plan API Key。' } });
      return;
    }
    planTestAbortRef.current?.abort();
    const controller = new AbortController();
    planTestAbortRef.current = controller;
    setTestingPlanModels(true);
    setPlanModelTestResults({});
    try {
      for (const model of provider.models) {
        if (controller.signal.aborted) break;
        setPlanModelTestResults((current) => ({ ...current, [model]: { message: '检测中…' } }));
        const result = await probeVolcenginePlanModel({
          baseUrl: provider.baseUrl,
          apiKey: apiKeyInput,
          model,
        }, controller.signal);
        setPlanModelTestResults((current) => ({ ...current, [model]: result }));
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setPlanModelTestResults((current) => ({
          ...current,
          _error: { ok: false, message: error instanceof Error ? error.message : '检测意外中断' },
        }));
      }
    } finally {
      if (mountedRef.current) {
        if (planTestAbortRef.current === controller) planTestAbortRef.current = null;
        setTestingPlanModels(false);
      }
    }
  };

  return (
    <div className="max-w-md mx-auto px-3.5 py-4 pb-10 space-y-4">
      {/* 优雅的一体化子标签导航 (消除原本重复的巨型 SETTINGS 设置中心卡片) */}
      <div className="frosted-feather-glass sticky top-0 z-20 flex items-center p-1 rounded-2xl shadow-xs">
        {([
          ['sponsor', '💖 赞助'],
          ['ai', 'AI 人工智能'],
          ['voice', '语音'],
          ['general', '通用'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveSection(id)}
            className={`flex-1 py-1.5 px-0.5 rounded-xl text-[10.5px] font-black transition text-center truncate ${
              activeSection === id ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black' : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ================= 赞助支持页面 ================= */}
      {activeSection === 'sponsor' && <SponsorPanel onGoToAi={() => setActiveSection('ai')} />}

      {/* ================= 通用设置 ================= */}
      {/* 更新放在最前面：这是用户最需要第一时间看到的状态 */}
      {activeSection === 'general' && <BuildInfoPanel />}
      {activeSection === 'general' && <DataManagementPanel />}
      {activeSection === 'general' && <AppDiagnosticsPanel />}
      {activeSection === 'ai' && (
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-rose-500/10 border border-pink-200/80 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-base animate-bounce">💖</span>
            <p className="text-[10.5px] text-slate-700 font-bold">
              喜欢幻触？欢迎前往<button type="button" onClick={() => setActiveSection('sponsor')} className="text-pink-600 underline font-black mx-1">【赞助支持】</button>请开发者喝杯咖啡
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveSection('sponsor')}
            className="text-[9.5px] font-black text-pink-600 bg-white hover:bg-pink-50 px-2.5 py-1 rounded-xl border border-pink-200 shadow-xs transition shrink-0 ml-2"
          >
            去看看 ➔
          </button>
        </div>
      )}
      {activeSection === 'ai' && (
        <section className="liquid-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-pink-500/10 text-pink-600 border border-pink-200">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">大模型 (LLM) 接入</h3>
                <p className="text-[10px] text-slate-500">两步完成配置 · 畅享智能伴侣对话与设备控制</p>
              </div>
            </div>
            {llmConfig.model ? (
              <span
                className="font-mono text-[9.5px] font-bold text-pink-700 bg-pink-50 border border-pink-200 px-2.5 py-0.5 rounded-full truncate max-w-[130px] sm:max-w-[170px] shrink-0"
                title={llmConfig.model}
              >
                {llmConfig.model.split('/').pop() || llmConfig.model}
              </span>
            ) : (
              <span className="text-[9px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full shrink-0">
                未配置
              </span>
            )}
          </div>

          {/* 第一步：服务商快捷选择 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-pink-500">第一步：选择服务商或自定义接入</p>
              <span className="text-[9px] text-slate-400">点击自动填入官方接口规范</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {LLM_PROVIDER_PRESETS.map((provider) => {
                const selected = activeProvider?.id === provider.id;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleApplyPreset(provider)}
                    className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition-all active:scale-[0.98] ${
                      selected
                        ? 'border-pink-400 bg-pink-50 text-pink-700 shadow-sm'
                        : 'border-pink-100/90 bg-white/90 text-slate-700 hover:border-pink-200 hover:bg-pink-50/50 shadow-xs'
                    }`}
                  >
                    <span className="text-lg">{provider.icon}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-black">{provider.name}</span>
                      <span className="block truncate font-mono text-[8px] text-slate-400">{provider.defaultModel}</span>
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={customEndpointSelected}
                onClick={handleSelectCustomEndpoint}
                className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition-all active:scale-[0.98] ${
                  customEndpointSelected
                    ? 'border-pink-400 bg-pink-50 text-pink-700 shadow-sm'
                    : 'border-dashed border-pink-200 bg-white/70 text-slate-700 hover:border-pink-300 hover:bg-pink-50/50 shadow-xs'
                }`}
              >
                <span className="text-lg">✨</span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-black">自定义接入</span>
                  <span className="block truncate font-mono text-[8px] text-slate-400">
                    {customEndpointSelected && modelInput ? modelInput : 'OpenAI 兼容接口'}
                  </span>
                </span>
              </button>
            </div>
            {customEndpointSelected && (
              <div className="mt-2 rounded-2xl border border-pink-200 bg-pink-50/60 p-3 shadow-xs">
                <div className="mb-2">
                  <p className="text-[11px] font-black text-slate-700">自定义 OpenAI 兼容接入</p>
                  <p className="mt-0.5 text-[9px] leading-4 text-slate-500">
                    填写任意 OpenAI 兼容服务的 Base URL 与模型 ID，API Key 在下方第二步填写。
                  </p>
                </div>
                <div className="space-y-2.5">
                  <div>
                    <label htmlFor="llm-custom-base-url" className="mb-1 block text-[10px] font-bold text-slate-600">
                      API Base URL
                    </label>
                    <input
                      id="llm-custom-base-url"
                      type="url"
                      value={baseUrlInput}
                      onChange={(event) => setBaseUrlInput(event.target.value)}
                      placeholder="https://api.openai.com/v1"
                      maxLength={2048}
                      autoComplete="url"
                      className="w-full rounded-xl border border-pink-200 bg-white/95 px-3 py-2 font-mono text-xs text-slate-800 outline-none shadow-xs focus:border-pink-400 focus:ring-2 focus:ring-pink-200/40"
                    />
                  </div>
                  <div>
                    <label htmlFor="llm-custom-model-id" className="mb-1 block text-[10px] font-bold text-slate-600">
                      模型 ID
                    </label>
                    <input
                      id="llm-custom-model-id"
                      type="text"
                      value={modelInput}
                      onChange={(event) => {
                        setModelInput(event.target.value);
                        setShowModelPicker(false);
                      }}
                      placeholder="例如：gpt-4.1-mini、qwen3:8b、your-model-id"
                      maxLength={200}
                      autoComplete="off"
                      className="w-full rounded-xl border border-pink-200 bg-white/95 px-3 py-2 font-mono text-xs text-slate-800 outline-none shadow-xs focus:border-pink-400 focus:ring-2 focus:ring-pink-200/40"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 第二步：填入 API Key 与一键保存 */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-pink-500">
                第二步：填写 API 密钥 (Key)
              </p>
              {activeProvider?.docsUrl && (
                <button
                  type="button"
                  onClick={() => window.open(activeProvider.docsUrl, '_blank', 'noopener,noreferrer')}
                  className="flex items-center gap-1 text-[10px] font-bold text-pink-600 hover:text-pink-700"
                >
                  获取 {activeProvider.name} Key 教程 <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onBlur={handleSaveApi}
                placeholder={activeProvider?.keyPlaceholder || '在此粘贴你的 API Key (如 sk-...)'}
                disabled={activeProvider?.requiresApiKey === false}
                className="w-full bg-white/95 border border-pink-200 text-slate-800 text-xs rounded-xl px-3 py-2.5 pr-9 outline-none font-mono focus:border-pink-400 focus:ring-2 focus:ring-pink-200/40 shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-1"
                aria-label={showKey ? '隐藏密钥' : '显示密钥'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              onClick={handleSaveApi}
              className="w-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 text-white text-xs font-bold py-2.5 rounded-xl shadow active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" /> 保存并应用 API 设置
            </button>

            {savedToast && (
              <p className="text-center text-xs text-emerald-600 font-bold font-mono animate-bounce">
                ✓ 配置已成功保存并生效！
              </p>
            )}
          </div>

          {/* 第三步：渐进式折叠的高级自定义设置 */}
          <div className="pt-2 border-t border-pink-100">
            <button
              type="button"
              onClick={() => setShowAdvancedLlm(!showAdvancedLlm)}
              className="w-full flex items-center justify-between text-[10.5px] font-bold text-slate-500 hover:text-pink-600 py-1 transition"
            >
              <span>⚙️ 高级配置 (自定义 Base URL / 切换模型 / 接口测试)</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdvancedLlm ? 'rotate-180' : ''}`} />
            </button>

            {showAdvancedLlm && (
              <div className="space-y-3 pt-3 mt-1 border-t border-pink-100/60 animate-in fade-in">
                <button
                  type="button"
                  onClick={() => {
                    setBaseUrlInput('');
                    setModelInput('');
                    setApiKeyInput('');
                    setCustomEndpointMode(true);
                  }}
                  className={`w-full rounded-xl border px-3 py-2 text-[10px] font-bold transition-all ${
                    activeProvider
                      ? 'border-pink-100 bg-white/90 text-slate-600 hover:bg-pink-50/50'
                      : 'border-pink-400 bg-pink-50 text-pink-700'
                  }`}
                >
                  🛠 切换为自定义 OpenAI 兼容接口
                </button>

                {activeProvider && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[10px] leading-relaxed text-slate-600 shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-slate-800">{activeProvider.icon} {activeProvider.name}</strong>
                      <span className="font-mono text-[9px] text-slate-400">预设模板已锁定</span>
                    </div>
                    <p className="mt-1 text-slate-500">{activeProvider.note}</p>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">API Base URL</label>
                  <input
                    type="text"
                    value={baseUrlInput}
                    onChange={(e) => setBaseUrlInput(e.target.value)}
                    onBlur={handleSaveApi}
                    placeholder="https://api.example.com/v1"
                    className="w-full bg-white/95 border border-pink-100 text-slate-800 text-xs rounded-xl px-3 py-2 outline-none font-mono focus:border-pink-400 focus:ring-2 focus:ring-pink-200/40 shadow-xs"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label htmlFor="llm-model-id" className="text-xs font-bold text-slate-700">模型名称 (Model)</label>
                    {activeProvider?.models.length ? <span className="text-[9px] text-slate-400">可选择推荐项或手动输入</span> : null}
                  </div>
                  <div className="relative">
                    <input
                      id="llm-model-id"
                      type="text"
                      value={modelInput}
                      onChange={(e) => {
                        setModelInput(e.target.value);
                        setShowModelPicker(Boolean(activeProvider?.models.length));
                      }}
                      onFocus={() => setShowModelPicker(Boolean(activeProvider?.models.length))}
                      onBlur={() => window.setTimeout(() => setShowModelPicker(false), 120)}
                      placeholder="deepseek-chat"
                      className="w-full bg-white/95 border border-pink-100 text-slate-800 text-xs rounded-xl px-3 py-2 pr-9 outline-none font-mono focus:border-pink-400 focus:ring-2 focus:ring-pink-200/40 shadow-xs"
                    />
                    {activeProvider?.models.length ? (
                      <button
                        type="button"
                        aria-label="显示推荐模型"
                        aria-expanded={showModelPicker}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setShowModelPicker((visible) => !visible)}
                        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-pink-500"
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />
                      </button>
                    ) : null}
                    {showModelPicker && activeProvider?.models.length ? (
                      <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-pink-300 bg-white p-1 shadow-xl shadow-slate-950/20">
                        {activeProvider.models.map((model) => (
                          <button
                            key={model}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setModelInput(model);
                              setShowModelPicker(false);
                              setCustomEndpointMode(false);
                            }}
                            className={`block w-full rounded-lg px-3 py-2 text-left font-mono text-[11px] transition ${model === modelInput ? 'bg-pink-100 font-bold text-pink-700' : 'text-slate-700 hover:bg-pink-50'}`}
                          >
                            {model}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                {activeProvider?.id === 'volcengine-agent-plan' && (
                  <div className="border-t border-slate-200 pt-2">
                    <button
                      type="button"
                      onClick={handleTestPlanModels}
                      disabled={testingPlanModels}
                      className="w-full rounded-lg border border-[#174b5b] bg-[#1f6678] px-2.5 py-2 font-black text-white shadow-sm transition hover:bg-[#174b5b] disabled:cursor-wait disabled:bg-[#7895a0] disabled:text-white text-xs"
                    >
                      {testingPlanModels ? '正在逐个检测基础回复…' : `检测全部 ${activeProvider.models.length} 个模型的基础回复`}
                    </button>
                    {Object.keys(planModelTestResults).length > 0 && (
                      <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[#d4e3e7] bg-white p-2">
                        {planModelTestResults._error && <p className="font-bold text-[#be123c] text-[10px]">{planModelTestResults._error.message}</p>}
                        {activeProvider.models.map((model) => {
                          const result = planModelTestResults[model];
                          if (!result) return null;
                          return (
                            <div key={model} className="flex items-start justify-between gap-2 font-mono text-[10px] leading-4">
                              <span className="min-w-0 break-all font-semibold text-[#17344a]">{model}</span>
                              <span className={`shrink-0 text-right font-bold ${result.ok === true ? 'text-[#047857]' : result.ok === false ? 'text-[#be123c]' : 'text-[#b45309]'}`} title={result.message}>
                                {result.ok === true ? `基础通过 · ${result.latencyMs}ms` : result.ok === false ? `失败 · ${result.message}` : result.message}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {activeSection === 'ai' && <ModelCapabilityPanel baseUrl={baseUrlInput} apiKey={apiKeyInput} model={modelInput} />}
      {activeSection === 'ai' && <ModelProfilesPanel baseUrl={baseUrlInput} apiKey={apiKeyInput} model={modelInput} onApply={profile => { setLlmConfig({ baseUrl: profile.baseUrl, model: profile.model, apiKey: profile.apiKey }); const applied = useAppStore.getState().llmConfig; setBaseUrlInput(applied.baseUrl); setModelInput(applied.model); setApiKeyInput(applied.apiKey); }} />}
      {/* 已迁移到“硬件调控”，避免同一安全范围出现两个配置入口。 */}
      <section className="hidden" aria-hidden="true">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-pink-500/20 text-pink-400 border border-pink-500/30">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">硬件级安全阈值与输出锁</h3>
              <p className="text-[10px] text-pink-300/80">统一设置自动玩法的输出下限、硬件上限与急停状态</p>
            </div>
          </div>

          <button
            onClick={() => {
              setSafetyConfig({
                maxEmsStrengthA: 200,
                maxEmsStrengthB: 200,
                minEmsStrength: 35,
                maxToyMotorARate: 20, maxToyMotorBRate: 2, maxToyMotorCRate: 20,
                minToyMotorRate: 1,
                minEnemaDurationSec: 1,
                maxEnemaDurationSec: 60,
                emergencyLock: false,
              });
              useAppStore.getState().stopDisciplineContract();
            }}
            className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow active:scale-95 transition-all"
          >
            ⚡ 一键解锁满档 (200)
          </button>
        </div>

        <div className="space-y-3 bg-slate-900/80 p-3.5 rounded-2xl border border-pink-500/30">
          <div className="space-y-3 rounded-xl border border-pink-500/20 bg-pink-950/10 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-pink-300">EMS 电击输出范围</span>
              <span className="rounded-md bg-pink-500/10 px-2 py-0.5 font-mono text-[9px] text-pink-300">自动随机 {safetyConfig.minEmsStrength}–{Math.min(safetyConfig.maxEmsStrengthA, safetyConfig.maxEmsStrengthB)}</span>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">通道 A 最大安全强度</span>
                <span className="font-mono font-bold text-pink-400">{safetyConfig.maxEmsStrengthA} / 200</span>
              </div>
              <input aria-label="电击通道 A 最大安全强度" type="range" min={0} max={200} value={safetyConfig.maxEmsStrengthA} onChange={(e) => setSafetyConfig({ maxEmsStrengthA: Number(e.target.value) })} className="w-full accent-pink-500 h-2 bg-slate-800 rounded-lg cursor-pointer" />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">通道 B 最大安全强度</span>
                <span className="font-mono font-bold text-pink-400">{safetyConfig.maxEmsStrengthB} / 200</span>
              </div>
              <input aria-label="电击通道 B 最大安全强度" type="range" min={0} max={200} value={safetyConfig.maxEmsStrengthB} onChange={(e) => setSafetyConfig({ maxEmsStrengthB: Number(e.target.value) })} className="w-full accent-pink-500 h-2 bg-slate-800 rounded-lg cursor-pointer" />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">自动玩法随机最小强度</span>
                <span className="font-mono font-bold text-amber-400">{safetyConfig.minEmsStrength} / 200</span>
              </div>
              <input aria-label="自动电击随机最小强度" type="range" min={0} max={200} value={safetyConfig.minEmsStrength} onChange={(e) => setSafetyConfig({ minEmsStrength: Number(e.target.value) })} className="w-full accent-amber-500 h-2 bg-slate-800 rounded-lg cursor-pointer" />
              <p className="mt-1 text-[10px] leading-tight text-slate-500">可在 0–200 设置。自动玩法会在该下限与 A/B 通道较小上限之间随机取整数；下限不能高于当前随机上限。</p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-purple-500/20 bg-purple-950/10 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-purple-300">榨精机马达输出范围</span>
              <span className="rounded-md bg-purple-500/10 px-2 py-0.5 font-mono text-[9px] text-purple-300">随机下限 {safetyConfig.minToyMotorRate}</span>
            </div>
            {([
              ['A', '主抽插/震动', safetyConfig.maxToyMotorARate ?? 20, 'maxToyMotorARate', 'accent-purple-500'],
              ['B', '吮吸/夹紧', safetyConfig.maxToyMotorBRate ?? 2, 'maxToyMotorBRate', 'accent-cyan-500'],
              ['C', '旋转/其他', safetyConfig.maxToyMotorCRate ?? 20, 'maxToyMotorCRate', 'accent-pink-500'],
            ] as const).map(([channel, label, value, key, accent]) => (
              <div key={channel}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium">通道 {channel} 上限（{label}）</span>
                  <span className="font-mono font-bold text-purple-400">{value} / 20</span>
                </div>
                <input aria-label={`玩具 ${channel} 通道上限`} type="range" min={0} max={20} value={value} onChange={(e) => setSafetyConfig({ [key]: Number(e.target.value) })} className={`w-full ${accent} h-2 bg-slate-800 rounded-lg cursor-pointer`} />
              </div>
            ))}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">自动玩法随机最小档位</span>
                <span className="font-mono font-bold text-amber-400">{safetyConfig.minToyMotorRate} / {Math.max(safetyConfig.maxToyMotorARate, safetyConfig.maxToyMotorBRate, safetyConfig.maxToyMotorCRate)}</span>
              </div>
              <input aria-label="自动榨精随机最小档位" type="range" min={0} max={Math.max(safetyConfig.maxToyMotorARate, safetyConfig.maxToyMotorBRate, safetyConfig.maxToyMotorCRate)} value={safetyConfig.minToyMotorRate} onChange={(e) => setSafetyConfig({ minToyMotorRate: Number(e.target.value) })} className="w-full accent-amber-500 h-2 bg-slate-800 rounded-lg cursor-pointer" />
              <p className="mt-1 text-[10px] leading-tight text-slate-500">实际随机值还会按正在使用的马达通道上限再次截断。</p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-black text-cyan-300">灌肠器自动单次运行范围</span>
              <span className="font-mono font-bold text-cyan-400">{safetyConfig.minEnemaDurationSec}–{safetyConfig.maxEnemaDurationSec} 秒</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[10px] font-bold text-slate-400">最短 {safetyConfig.minEnemaDurationSec} 秒<input aria-label="灌肠自动最短时长" type="range" min={0} max={safetyConfig.maxEnemaDurationSec} value={safetyConfig.minEnemaDurationSec} onChange={(e) => setSafetyConfig({ minEnemaDurationSec: Number(e.target.value) })} className="mt-1 w-full accent-cyan-500" /></label>
              <label className="text-[10px] font-bold text-slate-400">最长 {safetyConfig.maxEnemaDurationSec} 秒<input aria-label="灌肠自动最长时长" type="range" min={0} max={60} value={safetyConfig.maxEnemaDurationSec} onChange={(e) => setSafetyConfig({ maxEnemaDurationSec: Number(e.target.value) })} className="mt-1 w-full accent-cyan-500" /></label>
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">灌肠器协议没有功率档位，因此使用 BLE/模拟器中泵的运行秒数作为自动随机范围；Bridge 事件需在服务端限制。</p>
          </div>
        </div>
        </section>

      {/* ================= AI 语音伴侣与音色设置 ================= */}
      {activeSection === 'general' && <section className="bg-cyber-card border border-cyber-cardBorder rounded-2xl p-4 shadow-lg space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            <Type className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">聊天正文字号</h3>
            <p className="text-[10px] text-slate-400">只调整用户消息和 AI 回复，不改变按钮、标题与输入框</p>
          </div>
        </div>

        {([
          ['companionFontSize', '伴侣消息字体', chatDisplayConfig.companionFontSize, 'accent-pink-500'],
          ['tavernFontSize', '酒馆消息字体', chatDisplayConfig.tavernFontSize, 'accent-pink-500'],
        ] as const).map(([key, label, value, accent]) => (
          <div key={key} className="rounded-xl border border-pink-100 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">{label}</span>
              <span className="rounded-lg bg-pink-50 px-2 py-1 font-mono text-[10px] font-black text-pink-600 border border-pink-200">{value}px</span>
            </div>
            <input
              aria-label={label}
              type="range"
              min={12}
              max={24}
              step={1}
              value={value}
              onChange={(event) => setChatDisplayConfig({ [key]: Number(event.target.value) })}
              className={`h-2 w-full cursor-pointer rounded-lg bg-pink-100 ${accent}`}
            />
            <p className="mt-2 text-slate-700" style={{ fontSize: value, lineHeight: 1.6 }}>这是 {label} 的预览文字。</p>
          </div>
        ))}

        <div className="rounded-xl border border-pink-100 bg-white p-3 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-slate-800">酒馆台词与动作多色渲染</span>
              <p className="text-[10px] text-slate-500">
                对 *肢体动作*(天幕湛蓝)、(神态心理)(紫晶星云)、"台词"(暖金蜜珀)、【场景状态】(薄荷翡翠) 进行高对比度多色渲染，清晰易读
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChatDisplayConfig({ tavernNarrativeHighlight: !chatDisplayConfig.tavernNarrativeHighlight })}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                chatDisplayConfig.tavernNarrativeHighlight !== false
                  ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              {chatDisplayConfig.tavernNarrativeHighlight !== false ? '已开启' : '已关闭'}
            </button>
          </div>
          {chatDisplayConfig.tavernNarrativeHighlight !== false && (
            <div className="p-2.5 rounded-lg bg-pink-50/50 border border-pink-100 text-[11px] leading-relaxed space-y-1.5">
              <span className="text-[9px] text-slate-500 block font-mono font-bold">✨ 着色效果实时预览：</span>
              <p className="font-sans">
                <TavernMessageContent
                  content={`*轻轻移开视线，缓步靠近* （心跳似乎有些加快） “你一直都在看着我吗？” 【好感度 +5】 房间里静悄悄的。`}
                  enabled={true}
                  isDark={false}
                />
              </p>
              <div className="flex flex-wrap gap-2 pt-1 border-t border-pink-100/60 text-[9.5px]">
                <span className="inline-flex items-center gap-1 font-semibold text-[#0284c7]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0284c7]" />
                  动作 · 天幕湛蓝
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#7e22ce]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7e22ce]" />
                  心理 · 魅影罗兰
                </span>
                <span className="inline-flex items-center gap-1 font-bold text-[#e11d48]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#e11d48]" />
                  台词 · 瑰丽玫红
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#047857]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#047857]" />
                  状态 · 灵动翡翠
                </span>
                <span className="inline-flex items-center gap-1 font-normal text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                  旁白 · 石墨炭黑
                </span>
              </div>
            </div>
          )}
        </div>
      </section>}

      {/* ================= AI 语音伴侣与音色设置 ================= */}
      {activeSection === 'voice' && <section className="bg-cyber-card border border-cyber-cardBorder rounded-2xl p-4 shadow-lg space-y-3.5">
        <div className="space-y-3 rounded-2xl border border-pink-200 bg-pink-50/40 p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-pink-200 bg-pink-50 p-1.5 text-pink-600"><Mic className="h-4 w-4" /></div>
            <div><h3 className="text-sm font-bold text-slate-800">语音识别（STT）</h3><p className="text-[10px] text-slate-500">伴侣与酒馆共用；云端模式停顿约 1 秒后自动发送</p></div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'browser', label: '本机/浏览器', hint: '免 Key' },
              { id: 'siliconflow', label: '硅基流动', hint: '准确快速' },
              { id: 'volcengine', label: '火山豆包', hint: '极速版' },
            ].map((engine) => (
              <button key={engine.id} type="button" onClick={() => setSafetyConfig({ sttEngine: engine.id as any })} className={`rounded-xl border px-2 py-2 text-center transition-all ${safetyConfig.sttEngine === engine.id ? 'border-pink-300 bg-pink-50 text-pink-700 shadow-sm font-black' : 'border-pink-100 bg-white text-slate-600 hover:border-pink-200'}`}>
                <span className="block text-[10px] font-bold">{engine.label}</span><span className="mt-0.5 block text-[8.5px] opacity-80">{engine.hint}</span>
              </button>
            ))}
          </div>

          {safetyConfig.sttEngine === 'browser' && <p className="rounded-xl border border-pink-100 bg-white px-3 py-2 text-[9.5px] leading-4 text-slate-600 shadow-sm">不上传录音、无需密钥。识别能力由当前浏览器或系统 WebView 决定；若 APK 中不可用，请切换云端识别。</p>}

          {safetyConfig.sttEngine === 'siliconflow' && (
            <div className="space-y-2 rounded-xl border border-pink-200 bg-white p-3 shadow-sm">
              <label className="block text-[10px] font-bold text-slate-700">硅基流动语音识别 Key
                <input type="password" autoComplete="off" value={safetyConfig.siliconflowSttApiKey || ''} onChange={(event) => setSafetyConfig({ siliconflowSttApiKey: event.target.value })} placeholder="sk-..." className="mt-1 w-full rounded-lg border border-pink-200 bg-pink-50/30 px-2.5 py-2 font-mono text-[10px] text-slate-800 outline-none focus:border-pink-400" />
              </label>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {[
                  { id: 'FunAudioLLM/SenseVoiceSmall', name: 'SenseVoice Small', hint: '中文、情绪与环境音识别' },
                  { id: 'TeleAI/TeleSpeechASR', name: 'TeleSpeech ASR', hint: '中文语音转写' },
                ].map((model) => (
                  <button key={model.id} type="button" onClick={() => setSafetyConfig({ siliconflowSttModel: model.id })} className={`rounded-lg border p-2 text-left transition-all ${safetyConfig.siliconflowSttModel === model.id ? 'border-pink-400 bg-pink-50 text-pink-700 shadow-sm' : 'border-pink-100 bg-white text-slate-600 hover:border-pink-200'}`}>
                    <span className="block text-[10px] font-black text-slate-800">{model.name}</span><span className="block text-[8.5px] text-slate-500">{model.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {safetyConfig.sttEngine === 'volcengine' && (
            <div className="space-y-2 rounded-xl border border-pink-200 bg-white p-3 shadow-sm">
              <p className="text-[9.5px] leading-4 text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">需在“豆包语音”控制台开通录音文件识别极速版。火山方舟聊天 API Key 不能直接代替语音凭据。</p>
              <label className="block text-[10px] font-bold text-slate-700">新版 X-Api-Key
                <input type="password" autoComplete="off" value={safetyConfig.volcengineSttApiKey || ''} onChange={(event) => setSafetyConfig({ volcengineSttApiKey: event.target.value })} placeholder="新版控制台只填这一项" className="mt-1 w-full rounded-lg border border-pink-200 bg-pink-50/30 px-2.5 py-2 font-mono text-[10px] text-slate-800 outline-none focus:border-pink-400" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[9px] font-bold text-slate-600">旧版 APP ID<input value={safetyConfig.volcengineSttAppId || ''} onChange={(event) => setSafetyConfig({ volcengineSttAppId: event.target.value })} placeholder="可选" className="mt-1 w-full rounded-lg border border-pink-200 bg-pink-50/30 px-2 py-2 font-mono text-[9px] text-slate-800 outline-none" /></label>
                <label className="block text-[9px] font-bold text-slate-600">旧版 Access Token<input type="password" value={safetyConfig.volcengineSttAccessKey || ''} onChange={(event) => setSafetyConfig({ volcengineSttAccessKey: event.target.value })} placeholder="可选" className="mt-1 w-full rounded-lg border border-pink-200 bg-pink-50/30 px-2 py-2 font-mono text-[9px] text-slate-800 outline-none" /></label>
              </div>
              <label className="block text-[9px] font-bold text-slate-600">资源 ID<input value={safetyConfig.volcengineSttResourceId || 'volc.bigasr.auc_turbo'} onChange={(event) => setSafetyConfig({ volcengineSttResourceId: event.target.value })} className="mt-1 w-full rounded-lg border border-pink-200 bg-pink-50/30 px-2.5 py-2 font-mono text-[9px] text-slate-800 outline-none focus:border-pink-400" /></label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-pink-50 text-pink-600 border border-pink-200">
              <Vibrate className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">AI 真实语音伴侣 (TTS)</h3>
              <p className="text-[10px] text-slate-500">大模型回复时自动朗读，伴随脉冲律动</p>
            </div>
          </div>

          <button
            onClick={() => useAppStore.getState().speakMessage('这是当前 AI 伴侣的专属声线测试，喜欢这个声音吗？')}
            className="text-xs font-bold px-2.5 py-1 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 active:scale-95 transition-all"
          >
            🔊 试听声线
          </button>
        </div>

        <div className="space-y-3 bg-white p-3.5 rounded-xl border border-pink-100 shadow-sm">
          {/* 语音引擎选择 */}
          <div>
            <label className="text-xs font-bold text-slate-800 block mb-1.5">语音合成引擎 (TTS Engine)</label>
            <div className="space-y-1.5">
              {[
                {
                  id: 'siliconflow',
                  label: '🚀 硅基流动高保真语音 (MOSS / CosyVoice2)',
                  desc: '两种语音模型、8 个官方音色；Cosy 直接选音色，MOSS 使用参考音频；使用独立 TTS Key',
                },
                {
                  id: 'volcengine_tts',
                  label: '🌋 火山豆包语音合成 2.0 (Seed TTS)',
                  desc: '使用独立语音接口与 seed-tts-2.0，复用上方火山方舟 Plan 的 API Key',
                },
                {
                  id: 'edge_neural',
                  label: '🌐 Edge / Android 中文自然语音',
                  desc: '免 API Key；浏览器使用 Edge 音色，APK 使用手机已安装的高质量中文 TTS 音色',
                },
                {
                  id: 'browser_native',
                  label: '💻 浏览器本地基础合成音 (Web Speech)',
                  desc: '完全离线可用，零延迟',
                },
              ].map((eng) => (
                <div
                  key={eng.id}
                  onClick={() => setSafetyConfig({ ttsEngine: eng.id as any })}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                    (safetyConfig.ttsEngine || 'siliconflow') === eng.id
                      ? 'bg-pink-50 border-pink-300 text-pink-700 shadow-sm'
                      : 'bg-white border-pink-100 text-slate-600 hover:border-pink-200'
                  }`}
                >
                  <span className="text-xs font-bold block text-slate-800">{eng.label}</span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">{eng.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {safetyConfig.ttsEngine === 'siliconflow' && (
            <div className="space-y-2.5 rounded-xl border border-[#f2a8c0] bg-[#fff8fa] p-2.5">
              <div>
                <p className="text-[10px] font-black text-[#b93765]">硅基流动 TTS 专用 API Key</p>
                <p className="mt-0.5 text-[9.5px] leading-4 text-[#667085]">仅用于 <span className="font-mono">api.siliconflow.cn/v1/audio/speech</span>，与上方 LLM Key 完全独立。</p>
              </div>
              <div className="relative">
                <input
                  type={showSiliconflowTtsKey ? 'text' : 'password'}
                  value={siliconflowTtsKeyInput}
                  onChange={(event) => {
                    setSiliconflowTtsKeyInput(event.target.value);
                    setSiliconflowTtsKeySaved(false);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-..."
                  className="w-full rounded-xl border border-[#e4bdcc] bg-white py-2.5 pl-3 pr-10 font-mono text-[11px] text-[#263247] outline-none placeholder:text-[#98a2b3] focus:border-[#e96892]"
                />
                <button type="button" onClick={() => setShowSiliconflowTtsKey((visible) => !visible)} aria-label={showSiliconflowTtsKey ? '隐藏硅基流动 TTS Key' : '显示硅基流动 TTS Key'} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#667085]">
                  {showSiliconflowTtsKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSafetyConfig({ siliconflowTtsApiKey: siliconflowTtsKeyInput.trim() });
                  setSiliconflowTtsKeySaved(true);
                }}
                className="w-full rounded-xl bg-[#d94d7f] py-2.5 text-[10px] font-black text-white shadow-sm active:scale-[0.99]"
              >
                {siliconflowTtsKeySaved ? '✓ 专用 Key 已保存' : '保存硅基流动 TTS Key'}
              </button>
              {!siliconflowTtsKeyInput.trim() && <p className="text-[9.5px] font-bold text-[#b45309]">未填写时，硅基流动语音会安全回退到本地语音。</p>}

              <div className="border-t border-[#f3cfda] pt-2.5">
                <div className="mb-2 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black text-[#7d2949]">语音模型</p>
                    <p className="mt-0.5 text-[9px] text-[#667085]">选择后会直接用于语音合成请求</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#fce7ef] px-2 py-1 text-[9px] font-black text-[#b93765]">2 个模型</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SILICONFLOW_TTS_MODELS.map((model) => {
                    const selected = (safetyConfig.siliconflowTtsModel || DEFAULT_SILICONFLOW_TTS_MODEL) === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => setSafetyConfig({ siliconflowTtsModel: model.id })}
                        className={`rounded-xl border p-2.5 text-left transition-all ${selected ? 'border-[#df4f82] bg-[#ffe9f1] shadow-sm' : 'border-[#e5d6dc] bg-white hover:border-[#e986a8]'}`}
                      >
                        <span className={`block text-[10px] font-black ${selected ? 'text-[#a62655]' : 'text-[#263247]'}`}>{model.name}</span>
                        <span className="mt-0.5 block break-all font-mono text-[8.5px] text-[#596579]">{model.id}</span>
                        <span className="mt-1 block text-[9px] leading-4 text-[#667085]">{model.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-[#f3cfda] pt-2.5">
                <div className="mb-2 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black text-[#7d2949]">官方预置音色</p>
                    <p className="mt-0.5 text-[9px] text-[#667085]">男声 4 个、女声 4 个；Cosy 直接调用，MOSS 用作参考音频</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#fce7ef] px-2 py-1 text-[9px] font-black text-[#b93765]">8 个音色</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {SILICONFLOW_TTS_VOICES.map((voice) => {
                    const selected = (safetyConfig.siliconflowTtsVoice || DEFAULT_SILICONFLOW_TTS_VOICE) === voice.id;
                    return (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => setSafetyConfig({ siliconflowTtsVoice: voice.id })}
                        className={`rounded-xl border px-2 py-2 text-left transition-all ${selected ? 'border-[#df4f82] bg-[#df4f82] text-white shadow-sm' : 'border-[#e5d6dc] bg-white text-[#263247] hover:border-[#e986a8]'}`}
                      >
                        <span className="block text-[10px] font-black">{voice.name}</span>
                        <span className={`mt-0.5 block text-[8.5px] ${selected ? 'text-white/90' : 'text-[#667085]'}`}>{voice.gender} · {voice.style}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 rounded-lg border border-[#f1d4de] bg-white px-2.5 py-2">
                  <p className="text-[8.5px] font-bold text-[#667085]">
                    {isMossSiliconflowTtsModel(safetyConfig.siliconflowTtsModel || DEFAULT_SILICONFLOW_TTS_MODEL) ? '当前参考音色' : '当前请求音色 ID'}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[9px] font-bold text-[#a62655]">
                    {isMossSiliconflowTtsModel(safetyConfig.siliconflowTtsModel || DEFAULT_SILICONFLOW_TTS_MODEL)
                      ? `${safetyConfig.siliconflowTtsVoice || DEFAULT_SILICONFLOW_TTS_VOICE}（官方参考音频）`
                      : buildSiliconflowVoiceId(
                        safetyConfig.siliconflowTtsModel || DEFAULT_SILICONFLOW_TTS_MODEL,
                        safetyConfig.siliconflowTtsVoice || DEFAULT_SILICONFLOW_TTS_VOICE,
                      )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {safetyConfig.ttsEngine === 'volcengine_tts' && (
            <div className="space-y-3 rounded-xl border border-[#efb18c] bg-[#fff9f5] p-2.5">
              <div className="rounded-lg border border-[#f3d6c4] bg-white px-2.5 py-2">
                <p className="text-[10px] font-black text-[#9a3f18]">火山豆包语音合成 2.0</p>
                <p className="mt-0.5 break-all text-[9px] leading-4 text-[#667085]">接口：<span className="font-mono">openspeech.bytedance.com/api/v3/plan/tts/unidirectional</span>。复用火山方舟 Plan 的 API Key。</p>
              </div>
              <label className="block text-[10px] font-bold text-[#4b5565]">语音资源 ID
                <input value={safetyConfig.volcengineTtsResourceId || 'seed-tts-2.0'} onChange={(event) => setSafetyConfig({ volcengineTtsResourceId: event.target.value })} className="mt-1 w-full rounded-lg border border-[#e8c8b5] bg-white px-2.5 py-2 font-mono text-[11px] text-[#263247] outline-none focus:border-[#e9793f]" />
              </label>
              <label className="block text-[10px] font-bold text-[#4b5565]">当前音色 ID
                <input value={safetyConfig.volcengineTtsVoice || 'zh_female_vv_uranus_bigtts'} onChange={(event) => setSafetyConfig({ volcengineTtsVoice: event.target.value })} className="mt-1 w-full rounded-lg border border-[#e8c8b5] bg-white px-2.5 py-2 font-mono text-[10px] text-[#263247] outline-none focus:border-[#e9793f]" />
              </label>

              <div className="border-t border-[#f1d8ca] pt-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black text-[#6b2f18]">官方预置音色</p>
                    <p className="mt-0.5 text-[9px] text-[#667085]">按使用场景筛选，点击即可切换</p>
                  </div>
                  <span className="rounded-full bg-[#ffe7d8] px-2 py-1 text-[9px] font-black text-[#a3451b]">24 个</span>
                </div>
                <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                  {VOLCENGINE_TTS_VOICE_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setVolcengineVoiceFilter(category)}
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black ${volcengineVoiceFilter === category ? 'border-[#d85f29] bg-[#d85f29] text-white' : 'border-[#e7c7b5] bg-white text-[#6b4a3a]'}`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {VOLCENGINE_TTS_VOICE_PRESETS
                    .filter((voice) => volcengineVoiceFilter === '全部' || voice.category === volcengineVoiceFilter)
                    .map((voice) => {
                      const selected = (safetyConfig.volcengineTtsVoice || 'zh_female_vv_uranus_bigtts') === voice.id;
                      return (
                        <button
                          key={voice.id}
                          type="button"
                          onClick={() => setSafetyConfig({ volcengineTtsVoice: voice.id })}
                          title={voice.id}
                          className={`rounded-xl border px-2.5 py-2 text-left transition-all ${selected ? 'border-[#d85f29] bg-[#d85f29] text-white shadow-sm' : 'border-[#ead5c9] bg-white text-[#263247] hover:border-[#e9793f]'}`}
                        >
                          <span className="block truncate text-[10px] font-black">{voice.name}</span>
                          <span className={`mt-0.5 block text-[8.5px] ${selected ? 'text-white/90' : 'text-[#667085]'}`}>{voice.gender} · {voice.category}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
              <p className="text-[9px] leading-4 text-[#8a5a42]">音色是否可用仍取决于火山账号已开通的资源；上方输入框保留手动音色 ID，方便使用更多官方或自定义音色。</p>
            </div>
          )}

          {safetyConfig.ttsEngine === 'edge_neural' && (
            <div className="space-y-2 rounded-xl border border-[#b9cbd1] bg-[#f0f5f6] p-2.5">
              <p className="text-[10px] leading-relaxed text-[#40515b]">
                APK 无法直接读取 Windows Edge 的音色，会调用 Android 系统文字转语音服务。首次使用需要手机已安装并启用中文语音数据。
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={checkNativeTts} disabled={checkingNativeTts} className="rounded-lg border border-[#9fb4bc] bg-white px-2 py-2 text-[10px] font-black text-[#40515b] disabled:opacity-50">
                  {checkingNativeTts ? '检测中…' : '检测手机语音'}
                </button>
                <button type="button" onClick={() => void TTSManager.getInstance().openAndroidTtsSettings().then((opened) => { if (!opened) setNativeTtsStatus('请在 APK 中使用此按钮打开 Android 文字转语音设置。'); }).catch((error) => setNativeTtsStatus(`打开设置失败：${error instanceof Error ? error.message : String(error)}`))} className="rounded-lg bg-[#40515b] px-2 py-2 text-[10px] font-black text-white">
                  打开语音设置
                </button>
              </div>
              {nativeTtsStatus && <p className="rounded-lg bg-white px-2.5 py-2 text-[9.5px] font-bold leading-4 text-[#344054]">{nativeTtsStatus}</p>}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-200">AI 回复时自动朗读</span>
            <input
              type="checkbox"
              checked={safetyConfig.autoPlayVoice}
              onChange={(e) => setSafetyConfig({ autoPlayVoice: e.target.checked })}
              className="w-4 h-4 accent-pink-500 rounded cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium">全局语速调节:</span>
              <span className="font-mono font-bold text-pink-400">{safetyConfig.voiceRate.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={0.7}
              max={1.4}
              step={0.1}
              value={safetyConfig.voiceRate}
              onChange={(e) => setSafetyConfig({ voiceRate: Number(e.target.value) })}
              className="w-full accent-pink-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium">全局音调高低:</span>
              <span className="font-mono font-bold text-cyan-400">{safetyConfig.ttsEngine === 'siliconflow' ? '当前引擎不支持' : `${safetyConfig.voicePitch.toFixed(2)}x`}</span>
            </div>
            <input
              type="range"
              min={0.8}
              max={1.3}
              step={0.05}
              value={safetyConfig.voicePitch}
              onChange={(e) => setSafetyConfig({ voicePitch: Number(e.target.value) })}
              disabled={safetyConfig.ttsEngine === 'siliconflow'}
              className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-35"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium">音量增益:</span>
              <span className="font-mono font-bold text-amber-300">{safetyConfig.voiceGain > 0 ? '+' : ''}{safetyConfig.voiceGain.toFixed(0)} dB</span>
            </div>
            <input
              type="range"
              min={-10}
              max={10}
              step={1}
              value={safetyConfig.voiceGain}
              onChange={(e) => setSafetyConfig({ voiceGain: Number(e.target.value) })}
              className="w-full accent-amber-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {isTunableOnlineTts && (
            <div className="space-y-2.5 rounded-xl border border-[#efb0c5] bg-[#fff8fa] p-3 text-[#263247]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-black text-[#9f2854]">角色声线工坊</p>
                  <p className="mt-0.5 text-[9px] leading-4 text-[#667085]">把当前基础音色和上方调节值保存为新角色声线。它是本地预设，不会创建或克隆云端音色。</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#fce3ec] px-2 py-1 text-[8.5px] font-black text-[#b93765]">{currentBaseVoiceName}</span>
              </div>
              <div className="flex gap-2">
                <input
                  value={voiceProfileName}
                  maxLength={60}
                  onChange={(event) => {
                    setVoiceProfileName(event.target.value);
                    setVoiceProfileNotice('');
                  }}
                  placeholder="例如：冷淡女导师、低沉男管家"
                  className="min-w-0 flex-1 rounded-xl border border-[#e4bdcc] bg-white px-3 py-2.5 text-[10px] font-bold text-[#263247] outline-none placeholder:text-[#98a2b3] focus:border-[#df4f82]"
                />
                <button type="button" onClick={handleSaveVoiceProfile} className="shrink-0 rounded-xl bg-[#d94d7f] px-3 py-2.5 text-[10px] font-black text-white shadow-sm active:scale-[0.98]">
                  保存声线
                </button>
              </div>
              {voiceProfileNotice && <p className="rounded-lg bg-white px-2.5 py-2 text-[9px] font-bold text-[#8d3154]">{voiceProfileNotice}</p>}
              {currentEngineVoiceProfiles.length > 0 && (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {currentEngineVoiceProfiles.map((profile) => (
                    <div key={profile.id} className="flex items-center gap-2 rounded-xl border border-[#ead2db] bg-white p-2">
                      <button type="button" onClick={() => applyVoiceProfile(profile.id)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-[10px] font-black text-[#6f2441]">{profile.name}</span>
                        <span className="mt-0.5 block truncate text-[8.5px] text-[#667085]">{profile.baseVoiceName} · {profile.rate.toFixed(1)}x · {profile.gain > 0 ? '+' : ''}{profile.gain}dB{profile.engine === 'volcengine_tts' ? ` · 音调 ${profile.pitch.toFixed(2)}x` : ''}</span>
                      </button>
                      <button type="button" aria-label={`删除角色声线 ${profile.name}`} onClick={() => deleteTtsVoiceProfile(profile.id)} className="rounded-lg p-1.5 text-[#a04a69] hover:bg-[#fff0f5]">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>}

      {/* ================= 手机触感震动 ================= */}
      {activeSection === 'general' && <section className="bg-cyber-card border border-cyber-cardBorder rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-pink-500/20 text-pink-400 border border-pink-500/30">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">触觉震动反馈</h3>
            <p className="text-[10px] text-slate-400">利用手机 Web Vibration API 传递即时脉冲触感</p>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 bg-white/95 rounded-2xl border border-pink-100 shadow-xs">
          <span className="text-xs text-slate-700 font-bold">启用手机震动同步</span>
          <input
            type="checkbox"
            checked={safetyConfig.vibrationFeedback}
            onChange={(e) => setSafetyConfig({ vibrationFeedback: e.target.checked })}
            className="w-4 h-4 accent-pink-500 rounded cursor-pointer"
          />
        </div>
      </section>}

      {/* ================= 数据备份与跨设备迁移 ================= */}
      {activeSection === 'general' && <section className="liquid-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-pink-500/10 text-pink-600 border border-pink-200">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800">配置备份与跨设备还原</h3>
            <p className="text-[10px] text-slate-500">导出人格与系统设置；出于安全考虑，备份不会包含 API Key</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleExportBackup}
            className="py-2.5 px-3 rounded-xl bg-white/90 hover:bg-pink-50 text-xs font-bold text-slate-700 border border-pink-200 flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs"
          >
            <Copy className="w-3.5 h-3.5 text-pink-500" /> 导出并复制备份
          </button>
          <button
            onClick={() => {
              setBackupText('');
              setShowBackupModal(true);
            }}
            className="py-2.5 px-3 rounded-xl bg-white/90 hover:bg-pink-50 text-xs font-bold text-slate-700 border border-pink-200 flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs"
          >
            <Upload className="w-3.5 h-3.5 text-pink-500" /> 导入恢复备份
          </button>
        </div>

        {backupSuccess && (
          <p className="text-center text-xs text-emerald-600 font-bold animate-bounce">
            ✓ 全部配置已复制到剪贴板！可粘贴保存为文本。
          </p>
        )}
      </section>}

      {/* ================= 导入配置弹窗 ================= */}
      {showBackupModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white/98 backdrop-blur-2xl border border-pink-200/90 rounded-3xl w-full max-w-sm p-5 space-y-3.5 shadow-[0_24px_50px_-10px_rgba(244,63,142,0.22)] text-slate-800">
            <div className="flex items-center justify-between border-b border-pink-100 pb-2.5">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-pink-500" /> 导入配置 JSON
              </h3>
              <button onClick={() => setShowBackupModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-xl hover:bg-pink-50 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[11px] text-slate-500 font-bold block mb-1">请粘贴先前导出的 JSON 配置数据：</label>
              <textarea
                rows={6}
                value={backupText}
                onChange={(e) => setBackupText(e.target.value)}
                placeholder='{"llmConfig": {...}, "safetyConfig": {...}}'
                className="w-full bg-slate-50/80 border border-pink-100 text-slate-800 text-xs rounded-xl p-2.5 outline-none font-mono resize-none leading-relaxed focus:border-pink-400 focus:bg-white"
              />
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={() => setShowBackupModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition active:scale-95"
              >
                取消
              </button>
              <button
                onClick={handleImportBackup}
                disabled={!backupText.trim()}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 hover:from-pink-600 disabled:opacity-40 text-white text-xs font-black shadow-sm shadow-pink-500/20 transition active:scale-95"
              >
                立即导入恢复
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
