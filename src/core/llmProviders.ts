import { parseApiBaseUrl } from './apiBaseUrl';

export interface LlmProviderPreset {
  id: string;
  name: string;
  icon: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  keyPlaceholder: string;
  docsUrl: string;
  note: string;
  requiresApiKey: boolean;
}

export const LLM_PROVIDER_PRESETS: LlmProviderPreset[] = [
  {
    id: 'siliconflow',
    name: '硅基流动',
    icon: '⚡',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3.2',
    models: [
      'deepseek-ai/DeepSeek-V3.2',
      'meta-llama/Llama-3.3-70B-Instruct',
      'meta-llama/Meta-Llama-3.1-8B-Instruct',
      'Qwen/Qwen2.5-72B-Instruct',
    ],
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://docs.siliconflow.cn/cn/userguide/quickstart',
    note: '兼容现有高保真语音配置；具体可用模型以控制台为准。',
    requiresApiKey: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek 官方',
    icon: '🐋',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://api-docs.deepseek.com/guides/function_calling/',
    note: '直连 DeepSeek 官方 OpenAI 兼容接口，推荐使用当前 V4 模型。',
    requiresApiKey: true,
  },
  {
    id: 'volcengine-agent-plan',
    name: '火山方舟 Plan',
    icon: '🌋',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    defaultModel: 'doubao-seed-2.0-lite',
    models: [
      'doubao-seed-2.0-lite',
      'doubao-seed-2.0-mini',
      'kimi-k2.7-code',
      'minimax-m3',
      'doubao-seed-evolving',
      'kimi-k3',
      'doubao-seed-2.1-turbo',
      'deepseek-v4-flash',
      'glm-5.3',
      'glm-5.3-flash',
      'deepseek-v4-pro',
    ],
    keyPlaceholder: '方舟 Agent Plan API Key',
    docsUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    note: '使用 Agent Plan 专用 OpenAI Responses API；固定模型直连，不使用 Auto，也不会请求额外计费的 /api/v3。',
    requiresApiKey: true,
  },
  {
    id: 'dashscope',
    name: '阿里云百炼',
    icon: '☁️',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/base-url',
    note: '默认使用北京地域按量付费地址；API Key 必须与地域和计费方案匹配。',
    requiresApiKey: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    icon: '✦',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.7-flash',
    models: ['gemini-3.7-flash'],
    keyPlaceholder: 'Gemini API Key',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    note: '通过 Gemini 官方 OpenAI 兼容层接入；部分 Gemini 原生能力不在兼容层开放。',
    requiresApiKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: '🌐',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'nousresearch/hermes-3-llama-3.1-405b',
    models: ['nousresearch/hermes-3-llama-3.1-405b'],
    keyPlaceholder: 'sk-or-v1-...',
    docsUrl: 'https://openrouter.ai/docs/quickstart',
    note: '可手动填写 OpenRouter 当前提供的其他模型 ID。',
    requiresApiKey: true,
  },
  {
    id: 'ollama',
    name: '本地 Ollama',
    icon: '💻',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:7b',
    models: ['qwen2.5:7b', 'llama3.1:8b'],
    keyPlaceholder: '本地 Ollama 无需 API Key',
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/api.md',
    note: '仅连接当前设备的 localhost；移动端 localhost 指手机本身。',
    requiresApiKey: false,
  },
];

export const findLlmProviderPreset = (baseUrl: unknown): LlmProviderPreset | null => {
  const normalized = parseApiBaseUrl(baseUrl);
  if (!normalized) return null;
  return LLM_PROVIDER_PRESETS.find((provider) => provider.baseUrl === normalized) || null;
};
