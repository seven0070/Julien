import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignProfileToUnassignedRoutes,
  buildModelRouterConfig,
  defaultRouterConfig,
  makeQwenLocalModelProfileDraft,
  normalizeModelProfileDraft,
  parseModelRouterConfig,
  resolveRoutePreview,
  updateRouterRoute,
} from '../src/modelRouter.js';

test('normalizes API and local model profiles without accepting or persisting key values', () => {
  const api = normalizeModelProfileDraft({ name: 'Primary API', providerId: 'openai', model: 'example-model', apiKeyEnv: 'OPENAI_API_KEY' });
  const local = normalizeModelProfileDraft({ name: 'Ollama local', providerId: 'ollama', model: 'my-local-model', apiKeyEnv: 'SHOULD_IGNORE' });
  assert.equal(api.kind, 'api');
  assert.equal(api.baseUrl, 'https://api.openai.com/v1');
  assert.equal(api.apiKeyEnv, 'OPENAI_API_KEY');
  assert.equal('apiKey' in api, false);
  assert.equal(local.kind, 'local');
  assert.equal(local.baseUrl, 'http://localhost:11434/v1');
  assert.equal(local.apiKeyEnv, '');
  assert.throws(() => normalizeModelProfileDraft({ name: 'Bad key', providerId: 'openai', model: 'x', apiKeyEnv: 'sk-secret' }), /environment-variable name/);
  assert.throws(() => normalizeModelProfileDraft({ name: 'Insecure API', providerId: 'custom-api', model: 'x', baseUrl: 'http://api.example.com/v1' }), /HTTPS/);
  assert.throws(() => normalizeModelProfileDraft({ name: 'Remote labeled local', providerId: 'ollama', model: 'x', baseUrl: 'https://example.com/v1' }), /loopback or private-network/);
  assert.throws(() => normalizeModelProfileDraft({ name: 'Bad source', providerId: 'ollama', model: 'x', sourceUrl: 'http://example.com/model' }), /HTTPS/);
});

test('provides the requested Hugging Face model as an automatic local-first routing preset', () => {
  const profile = makeQwenLocalModelProfileDraft();
  const collidingPreset = makeQwenLocalModelProfileDraft([{ id: profile.id }]);
  const config = assignProfileToUnassignedRoutes(defaultRouterConfig(), profile.id, [profile]);
  assert.equal(profile.kind, 'local');
  assert.equal(profile.model, 'lukey03/Qwen3.5-9B-abliterated');
  assert.equal(profile.sourceUrl, 'https://huggingface.co/lukey03/Qwen3.5-9B-abliterated');
  assert.equal(collidingPreset.id, `${profile.id}-2`);
  for (const task of ['general', 'fast', 'reasoning', 'private']) {
    assert.equal(config.routes.find((route) => route.task === task).primaryProfileId, profile.id);
    assert.equal(resolveRoutePreview(config, [profile], task).profile.id, profile.id);
  }
  const exportConfig = buildModelRouterConfig(config, [profile]);
  assert.equal(exportConfig.profiles[0].model, 'lukey03/Qwen3.5-9B-abliterated');
  assert.ok(exportConfig.routes.every((route) => route.primaryProfileId === profile.id));
});

test('keeps private routes local-only and previews explicit or policy routes without calling models', () => {
  const local = normalizeModelProfileDraft({ name: 'Local', providerId: 'ollama', model: 'local-model' });
  const api = normalizeModelProfileDraft({ name: 'API', providerId: 'openai', model: 'remote-model' });
  let config = defaultRouterConfig();
  config = updateRouterRoute(config, 'private', 'primaryProfileId', local.id, [local, api]);
  assert.throws(() => updateRouterRoute(config, 'private', 'fallbackProfileId', api.id, [local, api]), /local models only/);
  config = updateRouterRoute(config, 'general', 'primaryProfileId', api.id, [local, api]);
  assert.equal(resolveRoutePreview(config, [local, api], 'general').profile.id, api.id);
  assert.equal(resolveRoutePreview(config, [api], 'private').profile, null);
  assert.equal(resolveRoutePreview({ ...defaultRouterConfig(), policy: 'manual' }, [local, api], 'private').profile, null);
  assert.equal(resolveRoutePreview({ ...defaultRouterConfig(), policy: 'local-first' }, [local, api], 'private').profile.id, local.id);
  assert.equal(resolveRoutePreview({ ...defaultRouterConfig(), policy: 'local-first' }, [local, api], 'reasoning').profile.id, local.id);
  assert.equal(resolveRoutePreview({ ...defaultRouterConfig(), policy: 'api-first' }, [local, api], 'reasoning').profile.id, api.id);
});

test('import strips API targets from private routes and key references from local profiles', () => {
  const imported = parseModelRouterConfig(JSON.stringify({
    format: 'julien-model-router/v1',
    policy: 'api-first',
    profiles: [
      { id: 'remote', name: 'Remote', providerId: 'openai', model: 'model', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY' },
      { id: 'local', name: 'Local', providerId: 'ollama', model: 'local-model', baseUrl: 'http://localhost:11434/v1', apiKeyEnv: 'SHOULD_NOT_SURVIVE' },
    ],
    routes: [{ task: 'private', primaryProfileId: 'remote', fallbackProfileId: 'remote' }],
  }));
  const privateRoute = imported.config.routes.find((route) => route.task === 'private');
  assert.equal(privateRoute.primaryProfileId, '');
  assert.equal(privateRoute.fallbackProfileId, '');
  assert.equal(imported.profiles.find((profile) => profile.id === 'local').apiKeyEnv, '');
});

test('export/import includes model routing without raw credentials', () => {
  const profile = { ...normalizeModelProfileDraft({ name: 'API', providerId: 'openai', model: 'model', apiKeyEnv: 'OPENAI_API_KEY', sourceUrl: 'https://huggingface.co/example/model' }), apiKey: 'never-export-this-secret' };
  const config = defaultRouterConfig();
  config.routes[0].primaryProfileId = profile.id;
  const exported = buildModelRouterConfig(config, [profile]);
  const json = JSON.stringify(exported);
  assert.equal(json.includes('never-export-this-secret'), false);
  assert.equal(json.includes('OPENAI_API_KEY'), true);
  const imported = parseModelRouterConfig(json);
  assert.equal(imported.profiles.length, 1);
  assert.equal(imported.profiles[0].apiKeyEnv, 'OPENAI_API_KEY');
  assert.equal(imported.profiles[0].sourceUrl, 'https://huggingface.co/example/model');
  assert.equal(imported.config.routes[0].primaryProfileId, profile.id);
  assert.throws(() => parseModelRouterConfig('{"format":"wrong"}'), /model-router config/);
});
