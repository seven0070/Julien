const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ROUTER_POLICIES = new Set(['local-first', 'api-first', 'manual']);

export const MODEL_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', kind: 'api', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY', protocol: 'OpenAI-compatible' },
  { id: 'anthropic', name: 'Anthropic', kind: 'api', baseUrl: 'https://api.anthropic.com/v1', apiKeyEnv: 'ANTHROPIC_API_KEY', protocol: 'Anthropic Messages API' },
  { id: 'gemini', name: 'Google Gemini', kind: 'api', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKeyEnv: 'GEMINI_API_KEY', protocol: 'OpenAI-compatible' },
  { id: 'openrouter', name: 'OpenRouter', kind: 'api', baseUrl: 'https://openrouter.ai/api/v1', apiKeyEnv: 'OPENROUTER_API_KEY', protocol: 'OpenAI-compatible' },
  { id: 'custom-api', name: 'Custom API endpoint', kind: 'api', baseUrl: '', apiKeyEnv: 'MODEL_API_KEY', protocol: 'OpenAI-compatible adapter required' },
  { id: 'ollama', name: 'Ollama (local)', kind: 'local', baseUrl: 'http://localhost:11434/v1', apiKeyEnv: '', protocol: 'OpenAI-compatible' },
  { id: 'lm-studio', name: 'LM Studio (local)', kind: 'local', baseUrl: 'http://localhost:1234/v1', apiKeyEnv: '', protocol: 'OpenAI-compatible' },
  { id: 'vllm-local', name: 'vLLM (local)', kind: 'local', baseUrl: 'http://localhost:8000/v1', apiKeyEnv: '', protocol: 'OpenAI-compatible' },
  { id: 'custom-local', name: 'Custom local endpoint', kind: 'local', baseUrl: 'http://localhost:8000/v1', apiKeyEnv: '', protocol: 'OpenAI-compatible' },
];

export const QWEN_LOCAL_MODEL_PRESET = {
  id: 'qwen3.5-9b-abliterated',
  name: 'Qwen3.5 9B Abliterated',
  providerId: 'custom-local',
  model: 'lukey03/Qwen3.5-9B-abliterated',
  baseUrl: 'http://localhost:8000/v1',
  sourceUrl: 'https://huggingface.co/lukey03/Qwen3.5-9B-abliterated',
  enabled: true,
};

export const ROUTER_POLICIES_LIST = [
  { id: 'local-first', label: 'Local first', description: 'Prefer a local model; use an API only as an explicit fallback.' },
  { id: 'api-first', label: 'API first', description: 'Prefer an API profile for ordinary routes; private stays local.' },
  { id: 'manual', label: 'Manual only', description: 'No default target. Every route must be explicitly selected.' },
];

export const ROUTER_TASKS = [
  { id: 'general', label: 'General chat', description: 'Everyday conversation and writing.' },
  { id: 'fast', label: 'Fast tasks', description: 'Short summaries, extraction, and quick replies.' },
  { id: 'reasoning', label: 'Planning & reasoning', description: 'Multi-step plans and more involved analysis.' },
  { id: 'private', label: 'Private / sensitive', description: 'Always restricted to a local profile; never falls back to an API.' },
];

export function defaultRouterConfig() {
  return {
    format: 'julien-model-router/v1',
    name: 'Julien Model Router',
    policy: 'local-first',
    routes: ROUTER_TASKS.map((task) => ({ task: task.id, primaryProfileId: '', fallbackProfileId: '' })),
    createdAt: Date.now(),
  };
}

export function slugifyModelProfileId(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

function isLoopbackOrPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (['localhost', '::1', 'host.docker.internal'].includes(host) || host.endsWith('.local')) return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(host) || /^10(?:\.\d{1,3}){3}$/.test(host) || /^192\.168(?:\.\d{1,3}){2}$/.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,3})(?:\.\d{1,3}){2}$/);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

export function normalizeModelProfileDraft(draft, existingProfiles = []) {
  const provider = MODEL_PROVIDERS.find((item) => item.id === draft?.providerId);
  if (!provider) throw new Error('Choose a supported API or local provider.');
  const name = String(draft?.name ?? '').trim();
  if (!name || name.length > 80) throw new Error('Profile name is required and must be 80 characters or fewer.');
  const id = String(draft?.id || slugifyModelProfileId(name)).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) throw new Error('Profile ID must use letters, numbers, dots, dashes, or underscores.');
  if (existingProfiles.some((profile) => profile.id === id)) throw new Error('A model profile with this ID already exists.');
  const model = String(draft?.model ?? '').trim();
  if (!model || model.length > 160) throw new Error('Enter the exact model ID from your provider or local runtime.');
  const baseUrl = String(draft?.baseUrl ?? provider.baseUrl).trim();
  let endpoint;
  try {
    endpoint = new URL(baseUrl);
  } catch {
    throw new Error('Enter a complete model endpoint URL.');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Only HTTP or HTTPS model endpoints are supported.');
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Do not put credentials, query parameters, or fragments in an endpoint URL.');
  if (provider.kind === 'api' && endpoint.protocol !== 'https:') throw new Error('Remote API profiles must use HTTPS.');
  if (provider.kind === 'local' && !isLoopbackOrPrivateHost(endpoint.hostname)) throw new Error('Local profiles must point to a loopback or private-network host.');
  const apiKeyEnv = provider.kind === 'api' ? String(draft?.apiKeyEnv ?? provider.apiKeyEnv).trim() : '';
  if (apiKeyEnv && !ENV_NAME_PATTERN.test(apiKeyEnv)) throw new Error('Enter an environment-variable name only, not an API key value.');
  const sourceUrl = String(draft?.sourceUrl ?? '').trim();
  if (sourceUrl) {
    let source;
    try {
      source = new URL(sourceUrl);
    } catch {
      throw new Error('Enter a complete HTTPS model source URL.');
    }
    if (source.protocol !== 'https:' || source.username || source.password || source.search || source.hash) throw new Error('Model source links must use HTTPS and cannot include credentials, query parameters, or fragments.');
  }

  return {
    id,
    name,
    providerId: provider.id,
    providerName: provider.name,
    kind: provider.kind,
    protocol: provider.protocol,
    model,
    baseUrl: endpoint.toString().replace(/\/$/, ''),
    sourceUrl,
    apiKeyEnv,
    enabled: draft?.enabled !== false,
    createdAt: Number(draft?.createdAt) || Date.now(),
  };
}

export function makeQwenLocalModelProfileDraft(existingProfiles = []) {
  let id = QWEN_LOCAL_MODEL_PRESET.id;
  let suffix = 2;
  while (existingProfiles.some((profile) => profile.id === id)) {
    id = `${QWEN_LOCAL_MODEL_PRESET.id}-${suffix}`;
    suffix += 1;
  }
  return normalizeModelProfileDraft({ ...QWEN_LOCAL_MODEL_PRESET, id }, existingProfiles);
}

export function updateRouterRoute(config, taskId, role, profileId, profiles = []) {
  if (!ROUTER_TASKS.some((task) => task.id === taskId)) throw new Error('Unknown routing task.');
  if (!['primaryProfileId', 'fallbackProfileId'].includes(role)) throw new Error('Unknown route slot.');
  const profile = profileId ? profiles.find((item) => item.id === profileId) : null;
  if (profileId && !profile) throw new Error('Select a saved model profile.');
  if (taskId === 'private' && profile && profile.kind !== 'local') throw new Error('Private routes can use local models only.');
  const routes = ROUTER_TASKS.map((task) => {
    const existing = config.routes.find((route) => route.task === task.id) || { task: task.id, primaryProfileId: '', fallbackProfileId: '' };
    return task.id === taskId ? { ...existing, [role]: profileId } : existing;
  });
  return { ...config, routes };
}

export function assignProfileToUnassignedRoutes(config, profileId, profiles = []) {
  let next = config;
  for (const task of ROUTER_TASKS) {
    const route = next.routes.find((item) => item.task === task.id);
    if (!route?.primaryProfileId && !route?.fallbackProfileId) {
      next = updateRouterRoute(next, task.id, 'primaryProfileId', profileId, profiles);
    }
  }
  return next;
}

export function resolveRoutePreview(config, profiles, taskId) {
  const route = config.routes.find((item) => item.task === taskId) || { task: taskId, primaryProfileId: '', fallbackProfileId: '' };
  const enabledProfiles = profiles.filter((profile) => profile.enabled !== false);
  if (taskId === 'private') {
    const explicitlySelected = enabledProfiles.find((profile) => profile.id === route.primaryProfileId && profile.kind === 'local');
    const explicitlySelectedFallback = enabledProfiles.find((profile) => profile.id === route.fallbackProfileId && profile.kind === 'local');
    const policyLocal = config.policy === 'manual' ? null : enabledProfiles.find((profile) => profile.kind === 'local');
    const localProfile = explicitlySelected || explicitlySelectedFallback || policyLocal;
    return localProfile
      ? { task: taskId, profile: localProfile, reason: config.policy === 'manual' && !explicitlySelected && !explicitlySelectedFallback ? 'Manual policy requires an explicit local selection; no API fallback is allowed.' : 'Private routes are local-only; no API fallback is allowed.', previewOnly: true }
      : { task: taskId, profile: null, reason: 'No local route is selected or configured. Keep this task on Julien’s local built-in behavior.', previewOnly: true };
  }

  const primary = enabledProfiles.find((profile) => profile.id === route.primaryProfileId);
  const fallback = enabledProfiles.find((profile) => profile.id === route.fallbackProfileId && profile.id !== primary?.id);
  if (primary) return { task: taskId, profile: primary, reason: 'Selected primary route.', previewOnly: true };
  if (fallback) return { task: taskId, profile: fallback, reason: 'Primary is unavailable; selected fallback route.', previewOnly: true };

  const pool = config.policy === 'api-first'
    ? [...enabledProfiles.filter((profile) => profile.kind === 'api'), ...enabledProfiles.filter((profile) => profile.kind === 'local')]
    : [...enabledProfiles.filter((profile) => profile.kind === 'local'), ...enabledProfiles.filter((profile) => profile.kind === 'api')];
  const profile = config.policy === 'manual' ? null : pool[0] || null;
  return {
    task: taskId,
    profile,
    reason: profile ? `${config.policy === 'api-first' ? 'API-first' : 'Local-first'} policy preview.` : 'No route is configured.',
    previewOnly: true,
  };
}

export function buildModelRouterConfig(config, profiles) {
  return {
    format: 'julien-model-router/v1',
    name: config.name,
    policy: config.policy,
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      providerId: profile.providerId,
      kind: profile.kind,
      model: profile.model,
      baseUrl: profile.baseUrl,
      sourceUrl: profile.sourceUrl || '',
      apiKeyEnv: profile.apiKeyEnv || '',
      enabled: profile.enabled !== false,
    })),
    routes: ROUTER_TASKS.map((task) => {
      const route = config.routes.find((item) => item.task === task.id);
      return { task: task.id, primaryProfileId: route?.primaryProfileId || '', fallbackProfileId: route?.fallbackProfileId || '' };
    }),
  };
}

export function parseModelRouterConfig(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!parsed || parsed.format !== 'julien-model-router/v1' || !Array.isArray(parsed.profiles) || !Array.isArray(parsed.routes)) {
    throw new Error('Expected a Julien model-router config with profile and route lists.');
  }
  const profiles = [];
  for (const raw of parsed.profiles) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Every model profile must be an object.');
    const provider = MODEL_PROVIDERS.find((item) => item.id === raw.providerId);
    if (!provider) throw new Error(`Unsupported model provider: ${String(raw.providerId)}.`);
    profiles.push(normalizeModelProfileDraft({ ...raw, apiKey: undefined }, profiles));
  }
  const baseConfig = defaultRouterConfig();
  const policy = ROUTER_POLICIES.has(parsed.policy) ? parsed.policy : 'local-first';
  const config = { ...baseConfig, name: String(parsed.name || baseConfig.name).slice(0, 80), policy, routes: baseConfig.routes };
  for (const route of parsed.routes) {
    if (!route || typeof route !== 'object') continue;
    if (!ROUTER_TASKS.some((task) => task.id === route.task)) continue;
    const primaryProfileId = profiles.some((profile) => profile.id === route.primaryProfileId) ? route.primaryProfileId : '';
    const fallbackProfileId = profiles.some((profile) => profile.id === route.fallbackProfileId) ? route.fallbackProfileId : '';
    const safePrimary = route.task === 'private' && profiles.find((profile) => profile.id === primaryProfileId)?.kind === 'api' ? '' : primaryProfileId;
    const safeFallback = route.task === 'private' && profiles.find((profile) => profile.id === fallbackProfileId)?.kind === 'api' ? '' : fallbackProfileId;
    config.routes = config.routes.map((item) => item.task === route.task ? { task: item.task, primaryProfileId: safePrimary, fallbackProfileId: safeFallback } : item);
  }
  return { config, profiles };
}
