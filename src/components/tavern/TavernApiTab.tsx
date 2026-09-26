import React, { useEffect, useRef, useState } from 'react';
import { DataManagementPanel } from '../DataManagementPanel';
import {
  getTavernCredentialScope,
  getTavernImageCredentialScope,
  TavernStore,
  VOLCENGINE_PLAN_IMAGE_BASE_URL,
  VOLCENGINE_PLAN_IMAGE_MODEL,
} from '../../core/tavern/tavernData';
import { TavernImageModelConfig, TavernModelConfig } from '../../core/tavern/tavernTypes';
import {
  applyTavernGenerationPreset,
  TAVERN_GENERATION_PRESETS,
  TAVERN_PROMPT_SECTION_IDS,
  TAVERN_PROMPT_SECTION_LABELS,
  TavernGenerationConfig,
  TavernGenerationPresetId,
  TavernPromptSectionId,
} from '../../core/tavern/tavernGeneration';
import {
  DEFAULT_SILICONFLOW_IMAGE_MODEL,
  DEFAULT_SILICONFLOW_IMAGE_SIZE,
  DEFAULT_SILICONFLOW_IMAGE_STEPS,
  COMFYUI_DEFAULT_SAMPLER,
  COMFYUI_DEFAULT_SCHEDULER,
  LOCAL_SD_DEFAULT_BACKEND,
  LOCAL_SD_DEFAULT_BASE_URL,
  LOCAL_SD_DEFAULT_CFG_SCALE,
  LOCAL_SD_DEFAULT_HEIGHT,
  LOCAL_SD_DEFAULT_SAMPLER,
  LOCAL_SD_DEFAULT_STEPS,
  LOCAL_SD_DEFAULT_WIDTH,
  LOCAL_SD_SAMPLERS,
  SILICONFLOW_IMAGE_BASE_URL,
  SILICONFLOW_IMAGE_MODELS,
  SILICONFLOW_QWEN_IMAGE_SIZES,
  isSiliconflowImageEditModel,
} from '../../core/tavern/tavernImageModels';
import {
  DZMMApiClient,
  DZMM_API_SETTINGS_URL,
  DZMM_CARD_CHAT_BASE_URL,
} from '../../core/tavern/dzmmApiClient';
import { fetchLocalSdResourceCatalog } from '../../core/tavern/tavernImageGenerator';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  Database,
  ExternalLink,
  Image as ImageIcon,
  KeyRound,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';

type ActiveSection = 'model' | 'generation' | 'image' | 'backup';

export const TavernApiTab: React.FC = () => {
  const store = TavernStore.getInstance();
  const [activeSection, setActiveSection] = useState<ActiveSection>('model');
  const [config, setConfig] = useState<TavernModelConfig>(store.getTavernModelConfig());
  const [imageConfig, setImageConfig] = useState<TavernImageModelConfig>(store.getTavernImageModelConfig());
  const [generationConfig, setGenerationConfig] = useState<TavernGenerationConfig>(store.getGenerationConfig());
  const [savedToast, setSavedToast] = useState(false);
  const [imageSavedToast, setImageSavedToast] = useState(false);
  const [generationSavedToast, setGenerationSavedToast] = useState(false);
  const [officialModels, setOfficialModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelMessage, setModelMessage] = useState<string | null>(null);
  const [localSdModels, setLocalSdModels] = useState<string[]>([]);
  const [localSdSamplers, setLocalSdSamplers] = useState<string[]>([]);
  const [localSdSchedulers, setLocalSdSchedulers] = useState<string[]>([]);
  const [localSdResourcesLoading, setLocalSdResourcesLoading] = useState(false);
  const [localSdResourceMessage, setLocalSdResourceMessage] = useState<string | null>(null);
  const localSdResourceRequestRef = useRef<AbortController | null>(null);

  const applyOfficialModels = (models: string[]) => {
    setOfficialModels(models);
    setConfig((current) => {
      if (models.includes(current.model) || models.length === 0) return current;
      const preferred = models.find((model) => model === 'nalang-max-0826-16k')
        || models.find((model) => model.startsWith('nalang-max'))
        || models[0];
      return { ...current, model: preferred };
    });
  };

  const refreshOfficialModels = async () => {
    setModelsLoading(true);
    setModelMessage(null);
    try {
      const models = (await DZMMApiClient.listCardChatModels()).map((model) => model.id);
      applyOfficialModels(models);
      setModelMessage(`已同步 ${models.length} 个 DZMM Card Chat 模型`);
    } catch (error) {
      setModelMessage(error instanceof Error ? error.message : 'DZMM 模型列表加载失败');
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    if (config.provider !== 'dzmm' || officialModels.length > 0) return;
    const controller = new AbortController();
    setModelsLoading(true);
    DZMMApiClient.listCardChatModels(controller.signal).then(
      (models) => {
        if (controller.signal.aborted) return;
        const ids = models.map((model) => model.id);
        applyOfficialModels(ids);
        setModelMessage(`已同步 ${ids.length} 个 DZMM Card Chat 模型`);
      },
      (error) => {
        if (!controller.signal.aborted) {
          setModelMessage(error instanceof Error ? error.message : 'DZMM 模型列表加载失败');
        }
      }
    ).finally(() => {
      if (!controller.signal.aborted) setModelsLoading(false);
    });
    return () => controller.abort();
  }, [config.provider, officialModels.length]);

  useEffect(() => () => localSdResourceRequestRef.current?.abort(), []);

  // 「已保存」提示的自动消失定时器：组件卸载时必须清理，避免残留回调在卸载后触发状态更新。
  const toastTimersRef = useRef<number[]>([]);
  useEffect(() => () => {
    toastTimersRef.current.forEach((id) => window.clearTimeout(id));
    toastTimersRef.current = [];
  }, []);
  const scheduleToastReset = (reset: () => void, delay = 2000) => {
    const id = window.setTimeout(() => {
      toastTimersRef.current = toastTimersRef.current.filter((item) => item !== id);
      reset();
    }, delay);
    toastTimersRef.current.push(id);
  };

  const openOfficialPage = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSave = () => {
    try {
      store.setTavernModelConfig(config);
      setConfig(store.getTavernModelConfig());
      setSavedToast(true);
      scheduleToastReset(() => setSavedToast(false));
    } catch (error) {
      alert(error instanceof Error ? error.message : '模型连接配置无效');
    }
  };

  const handleImageConfigSave = () => {
    try {
      store.setTavernImageModelConfig(imageConfig);
      setImageConfig(store.getTavernImageModelConfig());
      setImageSavedToast(true);
      scheduleToastReset(() => setImageSavedToast(false));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'AI 生图通道配置无效');
    }
  };

  const selectGenerationPreset = (presetId: TavernGenerationPresetId) => {
    if (presetId === 'custom') {
      setGenerationConfig((current) => ({ ...current, presetId: 'custom' }));
      return;
    }
    setGenerationConfig((current) => applyTavernGenerationPreset(current, presetId));
  };

  const updateGenerationValue = (field: 'temperature' | 'topP' | 'maxTokens' | 'historyMessages' | 'contextWindowTokens' | 'frequencyPenalty' | 'presencePenalty', value: number) => {
    setGenerationConfig((current) => ({ ...current, presetId: 'custom', [field]: value }));
  };

  const togglePromptSection = (section: TavernPromptSectionId) => {
    setGenerationConfig((current) => ({
      ...current,
      enabledPromptSections: current.enabledPromptSections.includes(section)
        ? current.enabledPromptSections.filter((id) => id !== section)
        : [...current.enabledPromptSections, section],
    }));
  };

  const movePromptSection = (section: TavernPromptSectionId, direction: -1 | 1) => {
    setGenerationConfig((current) => {
      const index = current.promptOrder.indexOf(section);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.promptOrder.length) return current;
      const promptOrder = [...current.promptOrder];
      [promptOrder[index], promptOrder[target]] = [promptOrder[target], promptOrder[index]];
      return { ...current, promptOrder };
    });
  };

  const handleGenerationConfigSave = () => {
    const saved = store.saveGenerationConfig(generationConfig);
    if (!saved) {
      alert('生成参数保存失败，本地空间可能不足');
      return;
    }
    setGenerationConfig(saved);
    setGenerationSavedToast(true);
    scheduleToastReset(() => setGenerationSavedToast(false));
  };

  const resetLocalSdResources = () => {
    localSdResourceRequestRef.current?.abort();
    localSdResourceRequestRef.current = null;
    setLocalSdModels([]);
    setLocalSdSamplers([]);
    setLocalSdSchedulers([]);
    setLocalSdResourceMessage(null);
    setLocalSdResourcesLoading(false);
  };

  const refreshLocalSdResources = async () => {
    localSdResourceRequestRef.current?.abort();
    const controller = new AbortController();
    localSdResourceRequestRef.current = controller;
    setLocalSdResourcesLoading(true);
    setLocalSdResourceMessage(null);
    try {
      const catalog = await fetchLocalSdResourceCatalog(
        imageConfig.baseUrl,
        controller.signal,
        imageConfig.localSdBackend || LOCAL_SD_DEFAULT_BACKEND,
      );
      if (controller.signal.aborted) return;
      setLocalSdModels(catalog.models);
      setLocalSdSamplers(catalog.samplers);
      setLocalSdSchedulers(catalog.schedulers);
      setImageConfig((current) => ({
        ...current,
        localSdBackend: catalog.backend,
        model: catalog.models.includes(current.model) ? current.model : catalog.models[0] || '',
        sdSampler: catalog.samplers.includes(current.sdSampler || '')
          ? current.sdSampler
          : catalog.samplers.find((sampler) => sampler === (catalog.backend === 'comfyui' ? COMFYUI_DEFAULT_SAMPLER : LOCAL_SD_DEFAULT_SAMPLER)) || catalog.samplers[0] || current.sdSampler,
        sdScheduler: catalog.schedulers.includes(current.sdScheduler || '')
          ? current.sdScheduler
          : catalog.schedulers.find((scheduler) => scheduler === COMFYUI_DEFAULT_SCHEDULER) || catalog.schedulers[0] || current.sdScheduler,
      }));
      const unavailable = [
        catalog.modelsUnavailable ? '模型列表' : '',
        catalog.samplersUnavailable ? '采样器列表' : '',
      ].filter(Boolean);
      setLocalSdResourceMessage(unavailable.length > 0
        ? `已读取部分配置；${unavailable.join('、')}暂不可用`
        : `已识别 ${catalog.backend === 'comfyui' ? 'ComfyUI' : 'A1111/Forge'}：${catalog.models.length} 个大模型、${catalog.samplers.length} 个采样器${catalog.schedulers.length ? `、${catalog.schedulers.length} 个调度器` : ''}`);
    } catch (error) {
      if (controller.signal.aborted) return;
      setLocalSdModels([]);
      setLocalSdSamplers([]);
      setLocalSdResourceMessage(error instanceof Error ? error.message : '本地 SD 配置读取失败');
    } finally {
      if (localSdResourceRequestRef.current === controller) {
        localSdResourceRequestRef.current = null;
        setLocalSdResourcesLoading(false);
      }
    }
  };

  const sections: { id: ActiveSection; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'model', label: '模型通道', icon: KeyRound },
    { id: 'generation', label: '生成预设', icon: SlidersHorizontal },
    { id: 'image', label: '生图通道', icon: ImageIcon },
    { id: 'backup', label: '备份迁移', icon: Database },
  ];

  return (
    <div className="space-y-3.5 pb-8">
      {/* 顶部现代化分段胶囊导航 */}
      <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-pink-50/60 border border-pink-100/80 backdrop-blur-md shadow-sm">
        {sections.map((sec) => {
          const Icon = sec.icon;
          const isSelected = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiveSection(sec.id)}
              className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl text-[11px] font-bold transition-all duration-200 ${
                isSelected
                  ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md shadow-pink-500/20 scale-[1.02]'
                  : 'text-slate-600 hover:text-pink-600 hover:bg-white/70'
              }`}
            >
              <Icon className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate">{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. 模型通道 */}
      {activeSection === 'model' && (
        <section className="rounded-3xl border border-pink-100/90 bg-white p-4 sm:p-5 shadow-[0_4px_20px_rgba(233,104,146,0.06)] text-slate-800 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-pink-50 border border-pink-200 text-pink-600 shadow-sm">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-800">酒馆模型通道</h4>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">
                可继承 App 通用模型、使用 DZMM 官方 Card Chat v2，或连接你自己的 OpenAI 兼容服务。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-pink-50/60 p-1.5 border border-pink-100">
            {([
              ['system', '系统设置'],
              ['dzmm', 'DZMM 官方'],
              ['custom', '自定义'],
            ] as const).map(([provider, label]) => (
              <button
                key={provider}
                type="button"
                aria-pressed={config.provider === provider}
                onClick={() => setConfig((current) => current.provider === provider ? current : ({
                  ...current,
                  provider,
                  apiKey: '',
                  rememberApiKey: false,
                  ...(provider === 'dzmm' ? {
                    baseUrl: DZMM_CARD_CHAT_BASE_URL,
                    model: /^(nalang|x-apex)/.test(current.model) ? current.model : 'nalang-max-0826-16k',
                  } : {}),
                }))}
                className={`rounded-xl px-2 py-2 text-xs font-bold transition ${
                  config.provider === provider
                    ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm'
                    : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {config.provider === 'system' && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-xs leading-relaxed text-emerald-900">
              <span className="font-bold flex items-center gap-1.5">✨ 已启用全局系统设置</span>
              <p className="mt-1 text-[11px] text-emerald-700/90 leading-relaxed">
                酒馆将直接继承“系统设置”中的 API 地址、模型与通信凭证，无需在此重复配置。
              </p>
            </div>
          )}

          {config.provider === 'dzmm' && (
            <div className="space-y-3.5">
              <div className="rounded-2xl border border-pink-200/80 bg-gradient-to-br from-pink-50/70 via-white to-rose-50/50 p-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-pink-700">
                    <Cloud className="h-4 w-4 text-pink-500" />DZMM Card Chat v2
                  </div>
                  <button
                    type="button"
                    onClick={() => openOfficialPage(DZMM_API_SETTINGS_URL)}
                    className="flex items-center gap-1 rounded-xl bg-pink-100/80 border border-pink-200 px-2.5 py-1.5 text-[10px] font-bold text-pink-700 hover:bg-pink-200/80 transition"
                  >
                    获取 Token<ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-600">
                  角色设定、场景、历史消息与世界书均以 Card Chat 原生格式传输；硬件输出依然由本地安全矩阵独家管控。
                </p>
              </div>

              <div>
                <label htmlFor="dzmm-api-token" className="text-xs font-semibold text-slate-700">DZMM API Token</label>
                <input
                  id="dzmm-api-token"
                  type="password"
                  autoComplete="off"
                  value={config.apiKey}
                  onChange={(event) => setConfig({ ...config, apiKey: event.target.value })}
                  placeholder="从 DZMM 官网 API 页面复制"
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/20 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-200/50 transition"
                />
              </div>

              <div>
                <label htmlFor="dzmm-user-name" className="text-xs font-semibold text-slate-700">酒馆昵称</label>
                <input
                  id="dzmm-user-name"
                  value={config.userName}
                  onChange={(event) => setConfig({ ...config, userName: event.target.value })}
                  maxLength={40}
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/20 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-200/50 transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="dzmm-model" className="text-xs font-semibold text-slate-700">官方模型</label>
                  <button
                    type="button"
                    onClick={() => void refreshOfficialModels()}
                    disabled={modelsLoading}
                    className="flex items-center gap-1 text-[10px] font-bold text-pink-600 hover:text-pink-700 disabled:opacity-50 transition"
                  >
                    <RefreshCw className={`h-3 w-3 ${modelsLoading ? 'animate-spin' : ''}`} />同步列表
                  </button>
                </div>
                {officialModels.length > 0 ? (
                  <select
                    id="dzmm-model"
                    value={config.model}
                    onChange={(event) => setConfig({ ...config, model: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/20 px-3 py-2 text-xs text-slate-800 outline-none focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-200/50 transition"
                  >
                    {officialModels.map((model) => <option key={model} value={model}>{model}</option>)}
                  </select>
                ) : (
                  <input
                    id="dzmm-model"
                    value={config.model}
                    onChange={(event) => setConfig({ ...config, model: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/20 px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-200/50 transition"
                  />
                )}
                {modelMessage && <p className="mt-1 text-[10px] text-pink-600">{modelMessage}</p>}
              </div>

              <label className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-[10.5px] leading-relaxed text-amber-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.rememberApiKey}
                  onChange={(event) => setConfig({ ...config, rememberApiKey: event.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 bg-white accent-pink-500"
                />
                <span><strong>在此设备记住 Token</strong>（默认关闭）。建议仅在完全信任的个人受控设备上启用。</span>
              </label>
            </div>
          )}

          {config.provider === 'custom' && (
            <div className="space-y-3.5">
              <div>
                <label htmlFor="tavern-api-key" className="text-xs font-semibold text-slate-700">API Key</label>
                <input
                  id="tavern-api-key"
                  type="password"
                  autoComplete="off"
                  value={config.apiKey}
                  onChange={(event) => setConfig({ ...config, apiKey: event.target.value })}
                  placeholder="sk-..."
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/20 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-200/50 transition"
                />
              </div>
              <div>
                <label htmlFor="tavern-base-url" className="text-xs font-semibold text-slate-700">兼容 API Base URL</label>
                <input
                  id="tavern-base-url"
                  value={config.baseUrl}
                  onChange={(event) => setConfig((current) => {
                    const next = { ...current, baseUrl: event.target.value };
                    return getTavernCredentialScope(current) === getTavernCredentialScope(next)
                      ? next
                      : { ...next, apiKey: '', rememberApiKey: false };
                  })}
                  placeholder="https://api.openai.com/v1"
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/20 px-3 py-2 font-mono text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-200/50 transition"
                />
              </div>
              <div>
                <label htmlFor="tavern-model" className="text-xs font-semibold text-slate-700">模型 ID</label>
                <input
                  id="tavern-model"
                  value={config.model}
                  onChange={(event) => setConfig({ ...config, model: event.target.value })}
                  placeholder="gpt-4o, claude-3-5-sonnet, deepseek-chat..."
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/20 px-3 py-2 font-mono text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-200/50 transition"
                />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.rememberApiKey}
                  onChange={(event) => setConfig({ ...config, rememberApiKey: event.target.checked })}
                  className="h-3.5 w-3.5 rounded border-pink-200 bg-white accent-pink-500"
                />
                在此设备记住 API Key
              </label>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 py-3 text-xs font-bold text-white shadow-md shadow-pink-500/25 transition active:scale-[0.98] hover:brightness-105"
          >
            {savedToast ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {savedToast ? '已保存设置' : '保存酒馆模型通道'}
          </button>
        </section>
      )}

      {/* 2. 生成预设与 Prompt 管理 */}
      {activeSection === 'generation' && (
        <section className="rounded-3xl border border-pink-100/90 bg-white p-4 sm:p-5 shadow-[0_4px_20px_rgba(233,104,146,0.06)] text-slate-800 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 shadow-sm">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-800">生成预设与 Prompt 管理</h4>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">
                统一控制所有酒馆对话通道。角色卡主体与 App 安全边界始终保持最高优先级。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {([
              ['creative', '创意', '更自由、更有变化'],
              ['balanced', '均衡', '推荐的日常设置'],
              ['precise', '精准', '稳定遵循设定'],
              ['longform', '长篇', '更长回复与历史'],
            ] as const).map(([presetId, label, hint]) => {
              const preset = TAVERN_GENERATION_PRESETS[presetId];
              const isSelected = generationConfig.presetId === presetId;
              return (
                <button
                  key={presetId}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => selectGenerationPreset(presetId)}
                  className={`rounded-2xl border p-3 text-left transition-all duration-200 ${
                    isSelected
                      ? 'border-pink-300 bg-gradient-to-br from-pink-50/90 to-rose-50/60 text-pink-950 shadow-sm'
                      : 'border-pink-100/80 bg-pink-50/20 text-slate-600 hover:border-pink-200 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-pink-700">{label}</span>
                    {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-pink-500 shadow-xs" />}
                  </div>
                  <span className="mt-1 block text-[10px] text-slate-500 leading-snug">{hint}</span>
                  <span className="mt-2 block font-mono text-[9px] text-pink-600/80 font-bold">
                    T {preset.temperature} · P {preset.topP} · {preset.maxTokens} tok
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-4 rounded-2xl border border-pink-100 bg-pink-50/30 p-3.5">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">温度 Temperature</span>
                <span className="rounded-lg border border-pink-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-pink-600 shadow-xs">
                  {generationConfig.temperature.toFixed(2)}
                </span>
              </div>
              <input
                aria-label="酒馆生成温度"
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={generationConfig.temperature}
                onChange={(event) => updateGenerationValue('temperature', Number(event.target.value))}
                className="mt-2 w-full accent-pink-500 cursor-pointer"
              />
              <p className="mt-1 text-[10px] text-slate-500">越低越稳定，越高越有变化；模型自身限制仍会自动生效。</p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">采样范围 Top P</span>
                <span className="rounded-lg border border-pink-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-pink-600 shadow-xs">
                  {generationConfig.topP.toFixed(2)}
                </span>
              </div>
              <input
                aria-label="酒馆 Top P"
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={generationConfig.topP}
                onChange={(event) => updateGenerationValue('topP', Number(event.target.value))}
                className="mt-2 w-full accent-pink-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">频率惩罚 Frequency Penalty</span>
                <span className="rounded-lg border border-pink-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-pink-600 shadow-xs">
                  {(generationConfig.frequencyPenalty ?? 0.35).toFixed(2)}
                </span>
              </div>
              <input
                aria-label="酒馆频率惩罚"
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={generationConfig.frequencyPenalty ?? 0.35}
                onChange={(event) => updateGenerationValue('frequencyPenalty', Number(event.target.value))}
                className="mt-2 w-full accent-pink-500 cursor-pointer"
              />
              <p className="mt-1 text-[10px] text-slate-500">惩罚模型频繁复读相同字词或短语，越高越能杜绝复读死循环。</p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">存在感惩罚 Presence Penalty</span>
                <span className="rounded-lg border border-pink-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-pink-600 shadow-xs">
                  {(generationConfig.presencePenalty ?? 0.25).toFixed(2)}
                </span>
              </div>
              <input
                aria-label="酒馆存在感惩罚"
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={generationConfig.presencePenalty ?? 0.25}
                onChange={(event) => updateGenerationValue('presencePenalty', Number(event.target.value))}
                className="mt-2 w-full accent-pink-500 cursor-pointer"
              />
              <p className="mt-1 text-[10px] text-slate-500">促使模型引入新话题与剧情细节，防止在同一话题上原地打转。</p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">最大输出 Tokens</span>
                <span className="rounded-lg border border-pink-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-pink-600 shadow-xs">
                  {generationConfig.maxTokens} tokens
                </span>
              </div>
              <input
                aria-label="酒馆最大输出 Tokens"
                type="range"
                min="128"
                max="8192"
                step="1"
                value={generationConfig.maxTokens}
                onChange={(event) => updateGenerationValue('maxTokens', Number(event.target.value))}
                className="mt-2 w-full accent-pink-500 cursor-pointer"
              />
            </div>

            <div>
              <label htmlFor="tavern-context-window" className="block text-xs font-semibold text-slate-700">模型上下文上限</label>
              <select
                id="tavern-context-window"
                aria-label="酒馆模型上下文上限"
                value={generationConfig.contextWindowTokens}
                onChange={(event) => updateGenerationValue('contextWindowTokens', Number(event.target.value))}
                className="mt-1.5 w-full rounded-xl border border-pink-100 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-200/50 transition"
              >
                {[8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576].map((tokens) => (
                  <option key={tokens} value={tokens}>
                    {tokens >= 1048576 ? '1,048,576 tokens (1M 上下文)' : `${tokens.toLocaleString()} tokens (${(tokens / 1024).toFixed(0)}K)`}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-500">选择当前模型支持的上下文长度（如 DeepSeek/Claude/Qwen 支持 64K~128K+），系统会自动预留输出空间并按需容纳更多历史消息与世界书。</p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">历史消息安全扫描上限</span>
                <span className="rounded-lg border border-pink-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-pink-600 shadow-xs">
                  {generationConfig.historyMessages} 条
                </span>
              </div>
              <input
                aria-label="酒馆历史消息安全上限"
                type="range"
                min="20"
                max="2000"
                step="20"
                value={generationConfig.historyMessages}
                onChange={(event) => updateGenerationValue('historyMessages', Number(event.target.value))}
                className="mt-2 w-full accent-pink-500 cursor-pointer"
              />
              <p className="mt-1 text-[10px] text-slate-500">结合 128K~1M 长上下文模型（如火山豆包 1M、Kimi 1M），可安全容纳上千条历史对话，让长剧本超强连贯不失忆。</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-slate-800">Prompt 片段装配顺序</h5>
              <span className="text-[10px] text-slate-500">勾选启用 · 顺序自上而下注入</span>
            </div>
            <div className="space-y-1.5">
              {generationConfig.promptOrder.map((section, index) => {
                const enabled = generationConfig.enabledPromptSections.includes(section);
                return (
                  <div
                    key={section}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 transition ${
                      enabled
                        ? 'border-pink-200 bg-white text-slate-800 shadow-xs'
                        : 'border-pink-100/60 bg-pink-50/20 text-slate-400 opacity-60'
                    }`}
                  >
                    <input
                      aria-label={`启用 ${TAVERN_PROMPT_SECTION_LABELS[section]}`}
                      type="checkbox"
                      checked={enabled}
                      onChange={() => togglePromptSection(section)}
                      className="h-4 w-4 rounded accent-pink-500"
                    />
                    <span className="min-w-0 flex-1 text-xs font-semibold">
                      <span className="text-pink-500 font-mono mr-1.5">{index + 1}.</span>
                      {TAVERN_PROMPT_SECTION_LABELS[section]}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => movePromptSection(section, -1)}
                        aria-label={`上移 ${TAVERN_PROMPT_SECTION_LABELS[section]}`}
                        className="rounded-lg border border-pink-200 bg-pink-50/60 p-1 text-slate-600 hover:text-pink-600 hover:bg-white disabled:opacity-30 transition"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={index === TAVERN_PROMPT_SECTION_IDS.length - 1}
                        onClick={() => movePromptSection(section, 1)}
                        aria-label={`下移 ${TAVERN_PROMPT_SECTION_LABELS[section]}`}
                        className="rounded-lg border border-pink-200 bg-pink-50/60 p-1 text-slate-600 hover:text-pink-600 hover:bg-white disabled:opacity-30 transition"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerationConfigSave}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 py-3 text-xs font-bold text-white shadow-md shadow-pink-500/25 transition active:scale-[0.98] hover:brightness-105"
          >
            {generationSavedToast ? <Check className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
            {generationSavedToast ? '生成设置已保存' : '保存生成与 Prompt 设置'}
          </button>
        </section>
      )}

      {/* 3. AI 生图通道 */}
      {activeSection === 'image' && (
        <section className="rounded-3xl border border-pink-100/90 bg-white p-4 sm:p-5 shadow-[0_4px_20px_rgba(233,104,146,0.06)] text-slate-800 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-pink-50 border border-pink-200 text-pink-600 shadow-sm">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-800">AI 生图通道</h4>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">
                用于每条 AI 回复下方的小图片插图生成。底部六宫格仍生成免费本地图卡，两者互不影响。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-pink-50/60 p-1.5 border border-pink-100">
            {([
              ['system', '复用系统设置'],
              ['siliconflow', '硅基流动生图'],
              ['volcengine_plan', '火山 Plan 生图'],
              ['local_sd', '本地 SD / ComfyUI'],
              ['custom', '专用生图 API'],
            ] as const).map(([provider, label]) => {
              const isSelected = imageConfig.provider === provider;
              return (
                <button
                  key={provider}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (imageConfig.provider !== provider) resetLocalSdResources();
                    setImageConfig((current) => {
                      if (current.provider === provider) return current;
                      if (provider === 'siliconflow') return {
                        ...current,
                        provider,
                        baseUrl: SILICONFLOW_IMAGE_BASE_URL,
                        model: DEFAULT_SILICONFLOW_IMAGE_MODEL,
                        imageSize: DEFAULT_SILICONFLOW_IMAGE_SIZE,
                        numInferenceSteps: DEFAULT_SILICONFLOW_IMAGE_STEPS,
                        seed: undefined,
                        negativePrompt: '',
                        apiKey: '',
                        rememberApiKey: false,
                      };
                      if (provider === 'volcengine_plan') return {
                        ...current,
                        provider,
                        baseUrl: VOLCENGINE_PLAN_IMAGE_BASE_URL,
                        model: VOLCENGINE_PLAN_IMAGE_MODEL,
                        apiKey: '',
                        rememberApiKey: false,
                      };
                      if (provider === 'local_sd') return {
                        ...current,
                        provider,
                        baseUrl: LOCAL_SD_DEFAULT_BASE_URL,
                        model: '',
                        numInferenceSteps: LOCAL_SD_DEFAULT_STEPS,
                        seed: undefined,
                        negativePrompt: '',
                        localSdBackend: LOCAL_SD_DEFAULT_BACKEND,
                        sdSampler: LOCAL_SD_DEFAULT_SAMPLER,
                        sdScheduler: COMFYUI_DEFAULT_SCHEDULER,
                        sdCfgScale: LOCAL_SD_DEFAULT_CFG_SCALE,
                        sdWidth: LOCAL_SD_DEFAULT_WIDTH,
                        sdHeight: LOCAL_SD_DEFAULT_HEIGHT,
                        apiKey: '',
                        rememberApiKey: false,
                      };
                      if (provider === 'system') return {
                        ...current,
                        provider,
                        baseUrl: '',
                        model: 'Kwai-Kolors/Kolors',
                        apiKey: '',
                        rememberApiKey: false,
                      };
                      return {
                        ...current,
                        provider,
                        baseUrl: SILICONFLOW_IMAGE_BASE_URL,
                        model: 'Kwai-Kolors/Kolors',
                        apiKey: '',
                        rememberApiKey: false,
                      };
                    });
                  }}
                  className={`rounded-xl px-2.5 py-2 text-xs font-bold transition ${
                    isSelected
                      ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm'
                      : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
                  } ${provider === 'custom' ? 'col-span-2' : ''}`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {imageConfig.provider === 'siliconflow' ? (
            <div className="space-y-3.5">
              <div className="rounded-2xl border border-pink-200 bg-pink-50/70 p-3 text-xs leading-relaxed text-slate-700">
                固定调用 <span className="font-mono text-pink-600 font-bold">{SILICONFLOW_IMAGE_BASE_URL}/images/generations</span>。Image Edit 模型会自动将当前消息图片或角色立绘作为参考图。
              </div>
              <div>
                <label htmlFor="tavern-siliconflow-image-api-key" className="text-xs font-semibold text-slate-700">硅基流动 API Key</label>
                <input
                  id="tavern-siliconflow-image-api-key"
                  type="password"
                  autoComplete="off"
                  value={imageConfig.apiKey}
                  onChange={(event) => setImageConfig({ ...imageConfig, apiKey: event.target.value })}
                  placeholder="sk-..."
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/20 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-200/50 transition"
                />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={imageConfig.rememberApiKey}
                  onChange={(event) => setImageConfig({ ...imageConfig, rememberApiKey: event.target.checked })}
                  className="h-3.5 w-3.5 rounded border-pink-200 bg-white accent-pink-500"
                />
                在此设备记住硅基流动生图 Key
              </label>
            </div>
          ) : imageConfig.provider === 'volcengine_plan' ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs leading-relaxed text-amber-900">
              使用 <span className="font-mono text-amber-700 font-bold">{VOLCENGINE_PLAN_IMAGE_BASE_URL}/images/generations</span> 与 <span className="font-mono text-amber-700 font-bold">{VOLCENGINE_PLAN_IMAGE_MODEL}</span>。需系统设置当前为火山方舟通道并自动复用其 Key；若要保留其他文字模型，请改用专用生图 API。
            </div>
          ) : imageConfig.provider === 'local_sd' ? (
            <div className="space-y-3.5">
              <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-3.5 text-xs leading-relaxed text-sky-900">
                同时支持 ComfyUI 工作流 API 与 AUTOMATIC1111/Forge。电脑网页端使用 127.0.0.1；手机 App 请填写电脑的局域网 IP（例如 http://192.168.1.100:7860）。
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">本地后端引擎</p>
                <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl bg-pink-50/60 p-1 border border-pink-100">
                  {([['auto', '自动识别'], ['a1111', 'A1111/Forge'], ['comfyui', 'ComfyUI']] as const).map(([backend, label]) => (
                    <button
                      key={backend}
                      type="button"
                      aria-pressed={(imageConfig.localSdBackend || LOCAL_SD_DEFAULT_BACKEND) === backend}
                      onClick={() => {
                        resetLocalSdResources();
                        setImageConfig((current) => ({
                          ...current,
                          localSdBackend: backend,
                          sdSampler: backend === 'comfyui' ? COMFYUI_DEFAULT_SAMPLER : backend === 'a1111' ? LOCAL_SD_DEFAULT_SAMPLER : current.sdSampler,
                        }));
                      }}
                      className={`rounded-lg px-2 py-1.5 text-xs font-bold transition ${(imageConfig.localSdBackend || LOCAL_SD_DEFAULT_BACKEND) === backend ? 'bg-pink-500 text-white shadow-xs' : 'text-slate-600 hover:text-pink-600'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="tavern-local-sd-base-url" className="text-xs font-semibold text-slate-700">本地 WebUI / ComfyUI 地址</label>
                <input
                  id="tavern-local-sd-base-url"
                  value={imageConfig.baseUrl}
                  onChange={(event) => {
                    resetLocalSdResources();
                    setImageConfig({ ...imageConfig, baseUrl: event.target.value });
                  }}
                  placeholder="http://192.168.1.100:7860"
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/20 px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-200/50 transition"
                />
              </div>
            </div>
          ) : imageConfig.provider === 'system' ? (
            <div className="space-y-2">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-xs leading-relaxed text-emerald-900">
                复用“系统设置”的 API 地址与密钥，在此单独指定图片模型。当前端点必须支持 <span className="font-mono text-emerald-700 font-bold">/images/generations</span>。
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs leading-relaxed text-amber-900">
                火山方舟 Plan 属于专属纯文本对话通道，不支持图片生成。如需生图请改用专用生图 API 或硅基流动。
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div>
                <label htmlFor="tavern-image-api-key" className="text-xs font-semibold text-slate-700">生图 API Key</label>
                <input
                  id="tavern-image-api-key"
                  type="password"
                  autoComplete="off"
                  value={imageConfig.apiKey}
                  onChange={(event) => setImageConfig({ ...imageConfig, apiKey: event.target.value })}
                  placeholder="sk-..."
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/20 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-200/50 transition"
                />
              </div>
              <div>
                <label htmlFor="tavern-image-base-url" className="text-xs font-semibold text-slate-700">生图 API Base URL</label>
                <input
                  id="tavern-image-base-url"
                  value={imageConfig.baseUrl}
                  onChange={(event) => setImageConfig((current) => {
                    const next = { ...current, baseUrl: event.target.value };
                    return getTavernImageCredentialScope(current) === getTavernImageCredentialScope(next)
                      ? next
                      : { ...next, apiKey: '', rememberApiKey: false };
                  })}
                  placeholder="https://api.siliconflow.cn/v1"
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/20 px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-200/50 transition"
                />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={imageConfig.rememberApiKey}
                  onChange={(event) => setImageConfig({ ...imageConfig, rememberApiKey: event.target.checked })}
                  className="h-3.5 w-3.5 rounded border-pink-200 bg-white accent-pink-500"
                />
                在此设备记住生图 API Key
              </label>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="tavern-image-model" className="text-xs font-semibold text-slate-700">
                {imageConfig.provider === 'local_sd' ? 'SD 大模型 / Checkpoint' : '图片模型 ID'}
              </label>
              {imageConfig.provider === 'local_sd' && (
                <button
                  type="button"
                  disabled={localSdResourcesLoading}
                  onClick={() => void refreshLocalSdResources()}
                  className="flex items-center gap-1 rounded-xl border border-pink-200 bg-pink-50 px-2.5 py-1 text-[10px] font-bold text-pink-700 hover:bg-pink-100 disabled:opacity-50 transition"
                >
                  <RefreshCw className={`h-3 w-3 ${localSdResourcesLoading ? 'animate-spin' : ''}`} />
                  {localSdResourcesLoading ? '读取中' : '读取 WebUI'}
                </button>
              )}
            </div>
            {imageConfig.provider === 'local_sd' && localSdModels.length > 0 ? (
              <select
                id="tavern-image-model"
                value={imageConfig.model}
                onChange={(event) => setImageConfig({ ...imageConfig, model: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-pink-100 bg-white px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-200/50 transition"
              >
                <option value="">使用 WebUI 当前激活模型</option>
                {imageConfig.model && !localSdModels.includes(imageConfig.model) && <option value={imageConfig.model}>{imageConfig.model}</option>}
                {localSdModels.map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
            ) : (
              <input
                id="tavern-image-model"
                value={imageConfig.model}
                readOnly={imageConfig.provider === 'siliconflow'}
                onChange={(event) => setImageConfig({ ...imageConfig, model: event.target.value })}
                placeholder={imageConfig.provider === 'local_sd' ? '留空使用 WebUI 当前模型，或点击右上角读取' : 'Kwai-Kolors/Kolors'}
                className="mt-1.5 w-full rounded-xl border border-pink-100 bg-pink-50/20 px-3 py-2 font-mono text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-200/50 read-only:opacity-80 transition"
              />
            )}
            {imageConfig.provider === 'local_sd' && localSdResourceMessage && (
              <p className={`mt-1.5 text-[10px] leading-4 ${localSdModels.length > 0 || localSdSamplers.length > 0 ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}`}>
                {localSdResourceMessage}
              </p>
            )}
            {imageConfig.provider !== 'local_sd' && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(imageConfig.provider === 'siliconflow'
                  ? SILICONFLOW_IMAGE_MODELS.map((model) => model.id)
                  : ['Kwai-Kolors/Kolors', 'Qwen/Qwen-Image']
                ).map((model) => (
                  <button
                    key={model}
                    type="button"
                    onClick={() => setImageConfig({ ...imageConfig, model })}
                    className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-semibold transition ${
                      imageConfig.model === model
                        ? 'border-pink-400 bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-xs'
                        : 'border-pink-100 bg-pink-50/40 text-slate-600 hover:border-pink-200 hover:text-pink-700 hover:bg-white'
                    }`}
                  >
                    {model}
                  </button>
                ))}
              </div>
            )}
          </div>

          {imageConfig.provider === 'siliconflow' && (
            <div className="space-y-3.5 rounded-2xl border border-pink-100 bg-pink-50/30 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">硅基流动生成参数</span>
                <span className="rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-[9px] font-bold text-pink-600">官方标准</span>
              </div>

              {!isSiliconflowImageEditModel(imageConfig.model) && (
                <div>
                  <label htmlFor="sf-image-size" className="block text-xs font-semibold text-slate-700">图片比例与分辨率</label>
                  <select
                    id="sf-image-size"
                    value={imageConfig.imageSize || DEFAULT_SILICONFLOW_IMAGE_SIZE}
                    onChange={(event) => setImageConfig({ ...imageConfig, imageSize: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-pink-100 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-200/50 transition"
                  >
                    {SILICONFLOW_QWEN_IMAGE_SIZES.map((size) => (
                      <option key={size.id} value={size.id}>{size.label} · {size.id}</option>
                    ))}
                  </select>
                </div>
              )}

              {isSiliconflowImageEditModel(imageConfig.model) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[10px] text-amber-800">
                  编辑模型自动以参考图片尺寸输出，无需设置固定分辨率。
                </div>
              )}

              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">推理步数 Steps</span>
                  <span className="rounded-md border border-pink-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-pink-600 shadow-xs">
                    {imageConfig.numInferenceSteps || DEFAULT_SILICONFLOW_IMAGE_STEPS}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={imageConfig.numInferenceSteps || DEFAULT_SILICONFLOW_IMAGE_STEPS}
                  onChange={(event) => setImageConfig({ ...imageConfig, numInferenceSteps: Number(event.target.value) })}
                  className="mt-2 w-full accent-pink-500 cursor-pointer"
                />
              </div>

              <div>
                <label htmlFor="sf-image-seed" className="block text-xs font-semibold text-slate-700">随机种子 Seed（留空随机）</label>
                <input
                  id="sf-image-seed"
                  type="number"
                  min="0"
                  max="9999999999"
                  step="1"
                  value={imageConfig.seed ?? ''}
                  onChange={(event) => setImageConfig({ ...imageConfig, seed: event.target.value === '' ? undefined : Number(event.target.value) })}
                  placeholder="0 - 9999999999"
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-white px-3 py-2 font-mono text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-200/50 transition"
                />
              </div>

              <div>
                <label htmlFor="sf-negative-prompt" className="block text-xs font-semibold text-slate-700">负面提示词 Negative Prompt</label>
                <textarea
                  id="sf-negative-prompt"
                  value={imageConfig.negativePrompt || ''}
                  onChange={(event) => setImageConfig({ ...imageConfig, negativePrompt: event.target.value })}
                  maxLength={2000}
                  rows={2}
                  placeholder="例如：模糊、低清晰度、多余手指、文字、水印"
                  className="mt-1 w-full resize-y rounded-xl border border-pink-100 bg-white px-3 py-2 text-xs leading-relaxed text-slate-800 placeholder-slate-400 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-200/50 transition"
                />
                <span className="mt-0.5 block text-right text-[9px] text-slate-500">{(imageConfig.negativePrompt || '').length}/2000</span>
              </div>
            </div>
          )}

          {imageConfig.provider === 'local_sd' && (
            <div className="space-y-3.5 rounded-2xl border border-pink-100 bg-pink-50/30 p-3.5">
              <span className="text-xs font-bold text-slate-800">本地 SD / ComfyUI 生成参数</span>

              <div>
                <label htmlFor="sd-sampler" className="block text-xs font-semibold text-slate-700">采样器 Sampler</label>
                <select
                  id="sd-sampler"
                  value={imageConfig.sdSampler || LOCAL_SD_DEFAULT_SAMPLER}
                  onChange={(event) => setImageConfig({ ...imageConfig, sdSampler: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-200/50 transition"
                >
                  {[...new Set([
                    imageConfig.sdSampler || LOCAL_SD_DEFAULT_SAMPLER,
                    ...(localSdSamplers.length > 0 ? localSdSamplers : LOCAL_SD_SAMPLERS),
                  ])].map((sampler) => <option key={sampler} value={sampler}>{sampler}</option>)}
                </select>
              </div>

              {((imageConfig.localSdBackend === 'comfyui') || localSdSchedulers.length > 0) && (
                <div>
                  <label htmlFor="sd-scheduler" className="block text-xs font-semibold text-slate-700">ComfyUI 调度器 Scheduler</label>
                  <select
                    id="sd-scheduler"
                    value={imageConfig.sdScheduler || COMFYUI_DEFAULT_SCHEDULER}
                    onChange={(event) => setImageConfig({ ...imageConfig, sdScheduler: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-pink-100 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-200/50 transition"
                  >
                    {[...new Set([imageConfig.sdScheduler || COMFYUI_DEFAULT_SCHEDULER, ...localSdSchedulers])].map((scheduler) => (
                      <option key={scheduler} value={scheduler}>{scheduler}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="sd-width" className="block text-xs font-semibold text-slate-700">宽度 Width</label>
                  <input
                    id="sd-width"
                    type="number"
                    min="256"
                    max="2048"
                    step="8"
                    value={imageConfig.sdWidth || LOCAL_SD_DEFAULT_WIDTH}
                    onChange={(event) => setImageConfig({ ...imageConfig, sdWidth: Number(event.target.value) })}
                    className="mt-1 w-full rounded-xl border border-pink-100 bg-white px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-200/50 transition"
                  />
                </div>
                <div>
                  <label htmlFor="sd-height" className="block text-xs font-semibold text-slate-700">高度 Height</label>
                  <input
                    id="sd-height"
                    type="number"
                    min="256"
                    max="2048"
                    step="8"
                    value={imageConfig.sdHeight || LOCAL_SD_DEFAULT_HEIGHT}
                    onChange={(event) => setImageConfig({ ...imageConfig, sdHeight: Number(event.target.value) })}
                    className="mt-1 w-full rounded-xl border border-pink-100 bg-white px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-200/50 transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">推理步数 Steps</span>
                  <span className="rounded-md border border-pink-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-pink-600 shadow-xs">
                    {imageConfig.numInferenceSteps || LOCAL_SD_DEFAULT_STEPS}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="150"
                  step="1"
                  value={imageConfig.numInferenceSteps || LOCAL_SD_DEFAULT_STEPS}
                  onChange={(event) => setImageConfig({ ...imageConfig, numInferenceSteps: Number(event.target.value) })}
                  className="mt-2 w-full accent-pink-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">CFG Scale</span>
                  <span className="rounded-md border border-pink-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-pink-600 shadow-xs">
                    {imageConfig.sdCfgScale || LOCAL_SD_DEFAULT_CFG_SCALE}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="30"
                  step="0.5"
                  value={imageConfig.sdCfgScale || LOCAL_SD_DEFAULT_CFG_SCALE}
                  onChange={(event) => setImageConfig({ ...imageConfig, sdCfgScale: Number(event.target.value) })}
                  className="mt-2 w-full accent-pink-500 cursor-pointer"
                />
              </div>

              <div>
                <label htmlFor="sd-seed" className="block text-xs font-semibold text-slate-700">随机种子 Seed（留空随机）</label>
                <input
                  id="sd-seed"
                  type="number"
                  min="0"
                  max="9999999999"
                  step="1"
                  value={imageConfig.seed ?? ''}
                  onChange={(event) => setImageConfig({ ...imageConfig, seed: event.target.value === '' ? undefined : Number(event.target.value) })}
                  placeholder="-1 / 随机"
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-white px-3 py-2 font-mono text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-200/50 transition"
                />
              </div>

              <div>
                <label htmlFor="sd-negative-prompt" className="block text-xs font-semibold text-slate-700">负面提示词 Negative Prompt</label>
                <textarea
                  id="sd-negative-prompt"
                  value={imageConfig.negativePrompt || ''}
                  onChange={(event) => setImageConfig({ ...imageConfig, negativePrompt: event.target.value })}
                  maxLength={2000}
                  rows={2}
                  placeholder="例如：low quality, blurry, watermark, extra fingers"
                  className="mt-1 w-full resize-y rounded-xl border border-pink-100 bg-white px-3 py-2 text-xs leading-relaxed text-slate-800 placeholder-slate-400 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-200/50 transition"
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleImageConfigSave}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 py-3 text-xs font-bold text-white shadow-md shadow-pink-500/25 transition active:scale-[0.98] hover:brightness-105"
          >
            {imageSavedToast ? <Check className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
            {imageSavedToast ? '生图设置已保存' : '保存 AI 生图通道'}
          </button>
        </section>
      )}

      {/* 4. 本地数据备份与迁移 */}
      {activeSection === 'backup' && (
        <section className="rounded-3xl border border-pink-100/90 bg-white p-4 sm:p-5 shadow-[0_4px_20px_rgba(233,104,146,0.06)] text-slate-800 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-pink-50 border border-pink-200 text-pink-600 shadow-sm">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-800">本地数据备份与迁移</h4>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">
                管理酒馆本地角色卡、对话记录、世界书与配置，支持全量 JSON 导出与跨设备迁移码。
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-pink-100 bg-pink-50/30 p-2 text-slate-800">
            <DataManagementPanel compact />
          </div>
        </section>
      )}
    </div>
  );
};
