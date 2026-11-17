import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';

const load = async (relativePath) => {
  const result = await build({ entryPoints: [relativePath], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const catalog = await load('src/core/ai/openaiModelCatalog.ts');

test('模型目录地址会剥掉对话端点、斜杠和查询，并停在用户写的主机上', () => {
  assert.equal(catalog.resolveOpenAIModelsUrl('https://api.example.com/v1/').url, 'https://api.example.com/v1/models');
  assert.equal(catalog.resolveOpenAIModelsUrl('https://api.example.com/v1/chat/completions').url, 'https://api.example.com/v1/models');
  assert.equal(catalog.resolveOpenAIModelsUrl('https://api.example.com/v1/models').url, 'https://api.example.com/v1/models');
  assert.equal(catalog.resolveOpenAIModelsUrl('http://localhost:11434/v1').url, 'http://localhost:11434/v1/models');
  assert.equal(catalog.resolveOpenAIModelsUrl('https://api.example.com/v1?x=1').ok, false);
  assert.equal(catalog.resolveOpenAIModelsUrl('http://203.0.113.5/v1').ok, false);
  const plan = catalog.resolveOpenAIModelsUrl('https://ark.cn-beijing.volces.com/api/plan/v3');
  assert.equal(plan.code, 'plan-unsupported');
  assert.equal(plan.requestUrl, undefined);
});

test('解析模型目录时丢掉空 id、重复 id，并拒绝坏结构和非 JSON', () => {
  const parsed = catalog.parseOpenAIModelCatalog(JSON.stringify({
    data: [
      { id: 'alpha' },
      { id: 'alpha' },
      { name: 'beta' },
      { model: 'gamma<script>' },
      { owned_by: 'org' },
      { id: '' },
      'delta',
    ],
  }));
  assert.deepEqual(parsed.models, ['alpha', 'beta', 'gamma<script>', 'delta']);
  assert.equal(catalog.parseOpenAIModelCatalog('not-json').code, 'not-json');
  assert.equal(catalog.parseOpenAIModelCatalog('{"data":{"id":"x"}}').code, 'bad-schema');
  assert.equal(catalog.parseOpenAIModelCatalog('{"models":[]}').code, 'empty');
  assert.equal(catalog.describeModelCatalogHttpStatus(401).code, 'unauthorized');
  assert.equal(catalog.describeModelCatalogHttpStatus(403).code, 'forbidden');
  assert.equal(catalog.describeModelCatalogHttpStatus(404).code, 'not-found');
});

test('获取失败不回写配置，旧请求也不能盖住新地址', async () => {
  const secret = 'fixture-key';
  let seenAuth = '';
  const result = await catalog.fetchOpenAIModelCatalog({
    baseUrl: 'https://models.example/v1/chat/completions',
    apiKey: secret,
    fetchText: async (url, init) => {
      seenAuth = init.headers.Authorization;
      assert.equal(url, 'https://models.example/v1/models');
      assert.equal(init.redirect, 'error');
      return { response: { ok: false, status: 401 }, text: secret };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unauthorized');
  assert.equal(result.message.includes(secret), false);
  assert.equal(seenAuth, `Bearer ${secret}`);

  const picked = catalog.applyPickedModelId({
    pickedId: 'new-model',
    baseUrlInput: 'notaurl',
    apiKeyInput: secret,
    savedBaseUrl: 'https://saved.example/v1',
    savedApiKey: secret,
  });
  assert.equal(picked.saved, null);
  assert.equal(picked.modelInput, 'new-model');

  const saved = catalog.applyPickedModelId({
    pickedId: 'new-model',
    baseUrlInput: 'https://saved.example/v1/',
    apiKeyInput: secret,
    savedBaseUrl: 'https://saved.example/v1',
    savedApiKey: secret,
  });
  assert.equal(saved.saved.model, 'new-model');
  assert.equal(saved.saved.apiKey, secret);
  assert.equal(saved.saved.baseUrl, 'https://saved.example/v1');

  assert.equal(catalog.shouldApplyCatalogResult(
    { baseUrl: 'https://a.example/v1', apiKey: secret },
    { baseUrl: 'https://b.example/v1', apiKey: secret },
    false,
  ), false);
  assert.equal(catalog.shouldApplyCatalogResult(
    { baseUrl: 'https://a.example/v1', apiKey: secret },
    { baseUrl: 'https://a.example/v1', apiKey: secret },
    true,
  ), false);
});
