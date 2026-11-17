import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';

const intervals = new Set();
const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = ((handler, delay, ...args) => {
  const id = originalSetInterval(handler, delay, ...args);
  intervals.add(id);
  return id;
});

const load = async (relativePath) => {
  const result = await build({ entryPoints: [relativePath], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const penalties = await load('src/core/ai/llmRequestPenalties.ts');
const llm = await load('src/core/ai/llmClient.ts');
const dzmm = await load('src/core/tavern/dzmmApiClient.ts');

const stopIntervals = () => {
  for (const id of intervals) clearInterval(id);
  intervals.clear();
};

test('未设置和零值惩罚不进入请求，显式非零值保留', () => {
  assert.deepEqual(penalties.samplingPenaltyFields(undefined), {});
  assert.deepEqual(penalties.samplingPenaltyFields({}), {});
  assert.deepEqual(penalties.samplingPenaltyFields({ frequencyPenalty: 0, presencePenalty: 0 }), {});
  assert.deepEqual(penalties.samplingPenaltyFields({ frequencyPenalty: 0.35, presencePenalty: 0.25 }), {
    frequency_penalty: 0.35,
    presence_penalty: 0.25,
  });
  const normalized = llm.normalizeLlmGenerationOptions(undefined);
  assert.equal(normalized.frequencyPenalty, undefined);
  assert.equal(normalized.presencePenalty, undefined);
  assert.equal(llm.normalizeLlmGenerationOptions({ frequencyPenalty: 0.4 }).frequencyPenalty, 0.4);
});

test('识别常见 penalty 拒绝，并避开认证、额度和其他参数错误', () => {
  const both = ['frequency_penalty', 'presence_penalty'];
  assert.deepEqual(penalties.unsupportedPenaltyParameters(400, JSON.stringify({
    error: { message: 'Penalty is not enabled for this model。', type: 'invalid_request_error' },
  })), both);
  assert.deepEqual(penalties.unsupportedPenaltyParameters(422, 'frequency_penalty is not supported'), ['frequency_penalty']);
  assert.deepEqual(penalties.unsupportedPenaltyParameters(400, JSON.stringify({
    message: 'Unsupported parameter: presence_penalty',
  })), ['presence_penalty']);
  assert.deepEqual(penalties.unsupportedPenaltyParameters(400, JSON.stringify({
    error: { message: '该模型未启用惩罚参数', param: 'presence_penalty' },
  })), ['presence_penalty']);
  assert.deepEqual(penalties.unsupportedPenaltyParameters(400, '不支持 frequency_penalty'), ['frequency_penalty']);
  assert.deepEqual(penalties.unsupportedPenaltyParameters(400, '该模型未启用惩罚参数'), ['frequency_penalty', 'presence_penalty']);
  assert.deepEqual(penalties.unsupportedPenaltyParameters(400, JSON.stringify({
    error: { message: 'The penalty is not the problem. max_tokens is not supported', param: 'max_tokens' },
  })), []);
  assert.deepEqual(penalties.unsupportedPenaltyParameters(401, JSON.stringify({
    error: { message: 'Penalty is not enabled for this model' },
  })), []);
  assert.deepEqual(penalties.unsupportedPenaltyParameters(429, 'rate limit exceeded, penalty applied'), []);
  assert.deepEqual(penalties.unsupportedPenaltyParameters(400, JSON.stringify({
    error: { message: 'max_tokens is not supported', param: 'max_tokens' },
  })), []);
  assert.deepEqual(penalties.unsupportedPenaltyParameters(400, JSON.stringify({
    error: { message: 'frequency_penalty must be between -2 and 2', param: 'frequency_penalty' },
  })), []);
  assert.deepEqual(penalties.unsupportedPenaltyParameters(400, 'Incorrect API key provided'), []);
  assert.deepEqual(penalties.unsupportedPenaltyParameters(400, 'not json {{{ penalty'), []);
  assert.deepEqual(penalties.penaltyKeysToDrop(400, 'Penalty is not enabled for this model', both, true), []);
});

const listen = () => new Promise((resolve) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push(body);
    const plan = server.plan.shift();
    if (!plan) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('no-plan');
      return;
    }
    res.writeHead(plan.status, { 'Content-Type': plan.type || 'application/json' });
    res.end(plan.body);
  });
  server.listen(0, '127.0.0.1', () => resolve({ server, requests }));
});

const clientFor = (port, generation) => new llm.LLMClient({
  baseUrl: `http://127.0.0.1:${port}/v1`,
  apiKey: 'local-test-key',
  model: 'demo-model',
  temperature: 0.7,
}, { hardwareToolsEnabled: false, generation });

test('不支持 penalty 的本地假服务：非流式只去掉被拒绝的参数并重试一次', async () => {
  const { server, requests } = await listen();
  server.plan = [
    { status: 400, body: JSON.stringify({ error: { message: 'Penalty is not enabled for this model。' } }) },
    { status: 200, body: JSON.stringify({ choices: [{ message: { content: '修好了' } }] }) },
  ];
  try {
    const port = server.address().port;
    const result = await clientFor(port, { frequencyPenalty: 0.35, presencePenalty: 0.25 }).sendMessage([
      { role: 'user', content: '你好' },
    ]);
    assert.equal(result.reply, '修好了');
    assert.equal(requests.length, 2);
    assert.equal(requests[0].frequency_penalty, 0.35);
    assert.equal(requests[0].presence_penalty, 0.25);
    assert.equal(requests[1].frequency_penalty, undefined);
    assert.equal(requests[1].presence_penalty, undefined);
    assert.equal(requests[1].model, 'demo-model');
  } finally {
    server.close();
  }
});

test('只拒绝其中一个参数时保留另一个', async () => {
  const { server, requests } = await listen();
  server.plan = [
    { status: 400, body: JSON.stringify({ error: { message: 'frequency_penalty is not supported', param: 'frequency_penalty' } }) },
    { status: 200, body: JSON.stringify({ choices: [{ message: { content: '保留了' } }] }) },
  ];
  try {
    const result = await clientFor(server.address().port, { frequencyPenalty: 0.4, presencePenalty: 0.2 }).sendMessage([
      { role: 'user', content: '你好' },
    ]);
    assert.equal(result.reply, '保留了');
    assert.equal(requests.length, 2);
    assert.equal(requests[1].frequency_penalty, undefined);
    assert.equal(requests[1].presence_penalty, 0.2);
  } finally {
    server.close();
  }
});

test('未设置惩罚时不发送，服务接受显式配置时也不重试', async () => {
  const { server, requests } = await listen();
  server.plan = [
    { status: 200, body: JSON.stringify({ choices: [{ message: { content: '甲' } }] }) },
    { status: 200, body: JSON.stringify({ choices: [{ message: { content: '乙' } }] }) },
  ];
  try {
    const port = server.address().port;
    await clientFor(port).sendMessage([{ role: 'user', content: '甲' }]);
    await clientFor(port, { frequencyPenalty: 0, presencePenalty: 0.3 }).sendMessage([{ role: 'user', content: '乙' }]);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].frequency_penalty, undefined);
    assert.equal(requests[0].presence_penalty, undefined);
    assert.equal(requests[1].frequency_penalty, undefined);
    assert.equal(requests[1].presence_penalty, 0.3);
  } finally {
    server.close();
  }
});

test('认证、额度、其他参数和第二次失败都不继续重试', async () => {
  const cases = [
    { status: 401, body: JSON.stringify({ error: { message: 'Incorrect API key' } }) },
    { status: 429, body: JSON.stringify({ error: { message: 'insufficient quota' } }) },
    { status: 400, body: JSON.stringify({ error: { message: 'max_tokens is not supported', param: 'max_tokens' } }) },
    { status: 400, body: 'Penalty is not enabled for this model' },
  ];
  for (const item of cases) {
    const { server, requests } = await listen();
    server.plan = [item, item];
    try {
      await assert.rejects(
        () => clientFor(server.address().port, { frequencyPenalty: 0.2, presencePenalty: 0.2 }).sendMessage([
          { role: 'user', content: '你好' },
        ]),
        (error) => {
          if (item.status === 401) assert.match(error.message, /Incorrect API key/);
          if (String(item.body).includes('max_tokens')) assert.match(error.message, /max_tokens/);
          return true;
        },
      );
      const expected = item.body.includes('Penalty is not enabled') ? 2 : 1;
      assert.equal(requests.length, expected, item.body);
    } finally {
      server.close();
    }
  }
});

test('流式在收到正文前可回退一次，回退后的正文只出现一次', async () => {
  const { server, requests } = await listen();
  const sse = 'data: {"choices":[{"delta":{"content":"流式"}}]}\n\ndata: [DONE]\n\n';
  server.plan = [
    { status: 400, type: 'text/plain', body: 'Penalty is not enabled for this model。' },
    { status: 200, type: 'text/event-stream', body: sse },
  ];
  const seen = [];
  try {
    const reply = await clientFor(server.address().port, { frequencyPenalty: 0.35, presencePenalty: 0.25 }).sendMessage([
      { role: 'user', content: '你好' },
    ], [], undefined, undefined, (text) => seen.push(text));
    assert.equal(reply.reply, '流式');
    assert.equal(requests.length, 2);
    assert.equal(requests[1].frequency_penalty, undefined);
    assert.equal(requests[1].presence_penalty, undefined);
    assert.equal(requests[1].stream, true);
    assert.deepEqual(seen, ['流式']);
  } finally {
    server.close();
  }
});

test('DZMM 明确拒绝 penalty 时也只重试一次，且不重试其他错误', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (calls.length === 1) {
      return new Response(JSON.stringify({ error: { message: 'Penalty is not enabled for this model' } }), { status: 400 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: 'dzmm-ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const reply = await dzmm.DZMMApiClient.chatWithCard({
      apiToken: 'dzmm-test-token',
      model: 'demo',
      card: { id: 'card', name: '角色' },
      messages: [{ role: 'user', content: '你好' }],
      frequencyPenalty: 0.35,
      presencePenalty: 0,
    });
    assert.equal(reply, 'dzmm-ok');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].frequency_penalty, 0.35);
    assert.equal(calls[0].presence_penalty, undefined);
    assert.equal(calls[1].frequency_penalty, undefined);
    assert.equal(calls[1].request_id, calls[0].request_id);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const otherCalls = [];
  globalThis.fetch = async (_url, init) => {
    otherCalls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401 });
  };
  try {
    await assert.rejects(
      () => dzmm.DZMMApiClient.chatWithCard({
        apiToken: 'dzmm-test-token',
        model: 'demo',
        card: { id: 'card', name: '角色' },
        messages: [{ role: 'user', content: '你好' }],
        frequencyPenalty: 0.35,
      }),
      /invalid api key/,
    );
    assert.equal(otherCalls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test.after(stopIntervals);
