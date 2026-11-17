import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';

const load = async (relativePath) => {
  const result = await build({ entryPoints: [relativePath], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const urls = await load('src/core/apiBaseUrl.ts');
const config = await load('src/core/llmConfig.ts');
const httpClient = await load('src/core/httpClient.ts');

test('自定义模型接受 http 域名、局域网、端口和本机，也接受 https', () => {
  assert.equal(urls.parseCustomModelApiBaseUrl('http://api.example.com/v1/'), 'http://api.example.com/v1');
  assert.equal(urls.parseCustomModelApiBaseUrl('http://192.168.1.8:11434/v1'), 'http://192.168.1.8:11434/v1');
  assert.equal(urls.parseCustomModelApiBaseUrl('http://10.0.0.5:8000'), 'http://10.0.0.5:8000');
  assert.equal(urls.parseCustomModelApiBaseUrl('http://localhost:11434/v1'), 'http://localhost:11434/v1');
  assert.equal(urls.parseCustomModelApiBaseUrl('http://127.0.0.1:8080/v1'), 'http://127.0.0.1:8080/v1');
  assert.equal(urls.parseCustomModelApiBaseUrl('https://api.example.com/v1'), 'https://api.example.com/v1');
  assert.equal(urls.buildCustomModelChatUrl('http://192.168.1.8:11434/v1'), 'http://192.168.1.8:11434/v1/chat/completions');
  assert.equal(urls.parseApiBaseUrl('http://api.example.com/v1'), null);
  assert.equal(urls.parseApiBaseUrl('http://192.168.1.8:11434/v1'), null);
});

test('自定义模型仍然拒绝其它协议、账号密码、查询串和片段', () => {
  for (const value of [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/plain,hi',
    'http://user:secret@192.168.1.8/v1',
    'https://user:secret@api.example.com/v1',
    'http://192.168.1.8:11434/v1?token=secret',
    'http://api.example.com/v1#fragment',
    'ftp://192.168.1.8/v1',
  ]) {
    assert.equal(urls.parseCustomModelApiBaseUrl(value), null, value);
    assert.equal(urls.buildCustomModelChatUrl(value), null, value);
  }
});

test('保存和重新加载会保留 http 自定义地址', () => {
  const saved = config.normalizeLlmConfig({
    baseUrl: 'http://192.168.1.8:11434/v1/',
    apiKey: 'local-key',
    model: 'qwen2.5:7b',
  });
  assert.equal(saved.baseUrl, 'http://192.168.1.8:11434/v1');
  assert.equal(saved.apiKey, 'local-key');
  assert.equal(saved.model, 'qwen2.5:7b');
  const reloaded = config.normalizeLlmConfig(saved);
  assert.equal(reloaded.baseUrl, saved.baseUrl);
  assert.equal(reloaded.apiKey, saved.apiKey);
  assert.equal(config.normalizeLlmConfig({ baseUrl: 'file:///tmp', apiKey: 'nope', model: 'x' }).baseUrl, 'https://api.siliconflow.cn/v1');
  assert.equal(config.normalizeLlmConfig({ baseUrl: 'file:///tmp', apiKey: 'nope', model: 'x' }).apiKey, '');
});

test('本地假 HTTP 服务能收到按自定义地址发出的对话请求', async () => {
  const seen = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      seen.push({
        url: request.url,
        authorization: request.headers.authorization || '',
        body: Buffer.concat(chunks).toString('utf8'),
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: '局域网已接通' } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const endpoint = urls.buildCustomModelChatUrl(`http://127.0.0.1:${port}/v1`);
    const result = await httpClient.fetchTextWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer local-key' },
      body: JSON.stringify({ model: 'qwen2.5:7b', messages: [{ role: 'user', content: 'ping' }] }),
    }, { timeoutMs: 3000, maxBytes: 100_000 });
    assert.equal(result.response.status, 200);
    assert.match(result.text, /局域网已接通/);
    assert.equal(seen[0].url, '/v1/chat/completions');
    assert.equal(seen[0].authorization, 'Bearer local-key');
    assert.match(seen[0].body, /qwen2\.5:7b/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
