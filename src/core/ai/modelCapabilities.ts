import { isLocalApiBaseUrl, isVolcengineArkPlanApiBaseUrl, parseApiBaseUrl } from '../apiBaseUrl';
import { fetchTextStreamWithTimeout, fetchTextWithTimeout } from '../httpClient';

export type ModelCapability = 'text' | 'stream' | 'conversation' | 'tools';
export interface CapabilityResult { capability: ModelCapability; status: 'passed' | 'failed' | 'unverified' | 'cancelled'; message: string; elapsedMs: number; checkedAt: number }
export const CAPABILITY_LABELS: Record<ModelCapability, string> = { text: '普通回复', stream: '流式回复', conversation: '多轮记忆', tools: '工具调用格式' };
type Config = { baseUrl: string; apiKey: string; model: string };
const textOf = (payload: any): string => {
  if (typeof payload?.choices?.[0]?.message?.content === 'string') return payload.choices[0].message.content;
  if (typeof payload?.output_text === 'string') return payload.output_text;
  return Array.isArray(payload?.output) ? payload.output.flatMap((item: any) => Array.isArray(item.content) ? item.content : []).filter((part: any) => part.type === 'output_text' && typeof part.text === 'string').map((part: any) => part.text).join('') : '';
};
export const parseCapabilityStream = (text: string): string[] => text.split(/\r?\n\r?\n/).flatMap(block => {
  const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
  if (!data || data === '[DONE]') return [];
  let value: any;
  try { value = JSON.parse(data); } catch { return []; }
  if (value.error || value.type === 'error' || value.type === 'response.failed' || value.type === 'response.incomplete') {
    throw new Error('流式响应中途失败或未完整结束，请检查模型服务后重试。');
  }
    const delta = value.type === 'response.output_text.delta' ? value.delta : value.choices?.[0]?.delta?.content;
    return typeof delta === 'string' && delta.length ? [delta] : [];
});

export async function probeModelCapability(config: Config, capability: ModelCapability, signal?: AbortSignal): Promise<CapabilityResult> {
  const start = performance.now();
  const result = (status: CapabilityResult['status'], message: string): CapabilityResult => ({ capability, status, message, elapsedMs: Math.round(performance.now() - start), checkedAt: Date.now() });
  const base = parseApiBaseUrl(config.baseUrl);
  if (!base || !config.model.trim()) return result('failed', '请填写有效地址与模型名。');
  if (!isLocalApiBaseUrl(base) && !config.apiKey.trim()) return result('failed', '请先填写 API Key。');
  const responses = isVolcengineArkPlanApiBaseUrl(base);
  const url = `${base}/${responses ? 'responses' : 'chat/completions'}`;
  const headers = { 'Content-Type': 'application/json', ...(config.apiKey.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}) };
  const options = { timeoutMs: 60000, maxBytes: 1000000, timeoutMessage: '检测超过 60 秒，请重试或检查模型服务。' };
  const payload = (messages: Array<{ role: string; content: string }>, extra = {}) => ({ model: config.model.trim(), ...(responses ? { input: messages, max_output_tokens: 1024 } : { messages, max_tokens: 1024 }), ...extra });
  const request = async (body: object) => {
    const { response, text } = await fetchTextWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body), signal }, options);
    let data: any; try { data = JSON.parse(text); } catch { throw new Error(`HTTP ${response.status}：服务未返回有效 JSON`); }
    if (!response.ok || data.error) throw new Error(`HTTP ${response.status}：${String(data.error?.message || data.message || '服务拒绝请求').slice(0, 180)}`);
    return data;
  };
  try {
    if (signal?.aborted) return result('cancelled', '检测已取消');
    if (capability === 'stream') {
      const { response, text } = await fetchTextStreamWithTimeout(url, { method: 'POST', headers, signal, body: JSON.stringify(payload([{ role: 'user', content: '请用一句话介绍春天。' }], { stream: true })) }, () => {}, options);
      if (!response.ok) return result('failed', `HTTP ${response.status}：流式请求失败`);
      const deltas = parseCapabilityStream(text);
      return deltas.length ? result('passed', `收到 ${deltas.length} 段文本增量；实际逐字速度取决于网络及客户端传输。`) : result('unverified', '未收到文本增量，暂不能确认流式能力。');
    }
    if (capability === 'tools') {
      const definition = { name: 'diagnostic_echo', description: 'Return the diagnostic token. This is a format test only.', parameters: { type: 'object', properties: { token: { type: 'string' } }, required: ['token'], additionalProperties: false } };
      const data = await request(payload([{ role: 'user', content: 'Call diagnostic_echo with token ycy-probe.' }], { tools: [responses ? { type: 'function', ...definition } : { type: 'function', function: definition }], tool_choice: responses ? { type: 'function', name: definition.name } : { type: 'function', function: { name: definition.name } } }));
      const calls = responses ? (Array.isArray(data.output) ? data.output.filter((item: any) => item.type === 'function_call') : []) : (data.choices?.[0]?.message?.tool_calls || []).map((item: any) => item.function);
      const valid = calls.some((item: any) => { try { return item.name === definition.name && JSON.parse(item.arguments).token === 'ycy-probe'; } catch { return false; } });
      return result(valid ? 'passed' : 'unverified', valid ? '返回了正确工具名与参数；未执行任何工具。' : '未返回预期工具参数，暂不能确认工具调用兼容。');
    }
    if (capability === 'conversation') {
      const token = `TEST-${Math.random().toString(36).slice(2, 10)}`;
      const messages = [{ role: 'user', content: `请记住本次口令 ${token}，回复“记住了”。` }];
      const first = textOf(await request(payload(messages)));
      if (!first.trim()) return result('failed', '第一轮未返回文本。');
      const second = textOf(await request(payload([...messages, { role: 'assistant', content: first }, { role: 'user', content: '刚才的口令是什么？仅返回口令。' }])));
      return result(second.includes(token) ? 'passed' : 'unverified', second.includes(token) ? '两轮对话成功，正确返回前文口令。' : '请求完成，但模型未正确返回口令。');
    }
    return textOf(await request(payload([{ role: 'user', content: '仅回复 OK' }]))).trim() ? result('passed', '收到有效文本回复。') : result('unverified', '请求完成但没有文本回复。');
  } catch (error) {
    return result(signal?.aborted ? 'cancelled' : 'failed', signal?.aborted ? '检测已取消' : error instanceof Error ? error.message : '检测失败');
  }
}
