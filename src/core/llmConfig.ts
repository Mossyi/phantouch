import type { LLMConfig } from '../types';
import {
  VOLCENGINE_ARK_PLAN_BASE_URL,
  isVolcengineArkLegacyApiBaseUrl,
  parseApiBaseUrl,
} from './apiBaseUrl';

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  baseUrl: 'https://api.siliconflow.cn/v1',
  apiKey: '',
  model: 'deepseek-ai/DeepSeek-V3.2',
  temperature: 0.7,
  selectedPersonaId: 'male_dom',
};

export const hasSameApiCredentialScope = (left: unknown, right: unknown): boolean => {
  const leftUrl = parseApiBaseUrl(left);
  const rightUrl = parseApiBaseUrl(right);
  if (!leftUrl || !rightUrl) return false;
  return new URL(leftUrl).origin.toLowerCase() === new URL(rightUrl).origin.toLowerCase();
};

export const normalizeLlmConfig = (
  value: unknown,
  fallback: LLMConfig = DEFAULT_LLM_CONFIG,
): LLMConfig => {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<LLMConfig>
    : {};
  const fallbackBaseUrl = parseApiBaseUrl(fallback.baseUrl) || DEFAULT_LLM_CONFIG.baseUrl;
  const hasBaseUrl = Object.prototype.hasOwnProperty.call(raw, 'baseUrl');
  const parsedInputBaseUrl = parseApiBaseUrl(raw.baseUrl);
  // The old Ark /api/v3 route is pay-as-you-go and must not be used by Plan keys.
  // Migrate historical app presets to the subscription endpoint before any request.
  const parsedBaseUrl = isVolcengineArkLegacyApiBaseUrl(parsedInputBaseUrl)
    ? VOLCENGINE_ARK_PLAN_BASE_URL
    : parsedInputBaseUrl;
  const invalidExplicitBaseUrl = hasBaseUrl && !parsedBaseUrl;
  const hasExplicitApiKey = Object.prototype.hasOwnProperty.call(raw, 'apiKey')
    && typeof raw.apiKey === 'string';
  const changedCredentialScope = Boolean(parsedBaseUrl)
    && !hasSameApiCredentialScope(parsedBaseUrl, fallbackBaseUrl);
  const suppliedApiKey = typeof raw.apiKey === 'string'
    ? raw.apiKey.trim().slice(0, 1000)
    : fallback.apiKey;
  const inheritedApiKey = suppliedApiKey === fallback.apiKey;
  const temperature = Number(raw.temperature ?? fallback.temperature);
  const selectedPersonaId = typeof raw.selectedPersonaId === 'string'
    && /^[a-zA-Z0-9_-]{1,100}$/.test(raw.selectedPersonaId)
    ? raw.selectedPersonaId
    : fallback.selectedPersonaId;

  return {
    baseUrl: parsedBaseUrl || fallbackBaseUrl,
    // Never carry a credential across an invalid endpoint fallback.
    apiKey: invalidExplicitBaseUrl || (changedCredentialScope && (!hasExplicitApiKey || inheritedApiKey))
      ? ''
      : suppliedApiKey,
    model: typeof raw.model === 'string' && raw.model.trim()
      ? (/^doubao-seed-(?:2-0|2\.0)-(?:lite|pro)-?/i.test(raw.model.trim())
          && isVolcengineArkLegacyApiBaseUrl(parsedInputBaseUrl)
        ? 'doubao-seed-2.0-lite'
        : raw.model.trim().slice(0, 200))
      : fallback.model,
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : fallback.temperature,
    selectedPersonaId,
  };
};
