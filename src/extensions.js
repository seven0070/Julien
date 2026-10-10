const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ENV_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PLUGIN_PERMISSION_IDS = new Set([
  'memory.read',
  'memory.write',
  'tasks.read',
  'tasks.write',
  'calendar.read',
  'calendar.write',
  'drafts.create',
  'files.read',
  'network.request',
]);

export const PLUGIN_PERMISSION_OPTIONS = [
  { id: 'memory.read', label: 'Read saved memories', risk: 'Personal data' },
  { id: 'memory.write', label: 'Create or update memories', risk: 'Personal data' },
  { id: 'tasks.read', label: 'Read local reminders', risk: 'Personal data' },
  { id: 'tasks.write', label: 'Create or complete reminders', risk: 'Changes data' },
  { id: 'calendar.read', label: 'Read local planning blocks', risk: 'Personal data' },
  { id: 'calendar.write', label: 'Create or edit planning blocks', risk: 'Changes data' },
  { id: 'drafts.create', label: 'Prepare unsent drafts', risk: 'External content' },
  { id: 'files.read', label: 'Read files exposed by the MCP host', risk: 'File access' },
  { id: 'network.request', label: 'Request external network access', risk: 'Network access' },
];

export const CORE_MODULES = [
  { id: 'memory', name: 'Local memory', description: 'User-approved notes, preferences, and projects stored in this browser.', access: 'Local browser data', icon: 'brain' },
  { id: 'hands', name: 'Hands actions', description: 'Local reminders, planning blocks, unsent drafts, and focus sessions.', access: 'Local actions', icon: 'zap' },
  { id: 'skills', name: 'Personal skills', description: 'Exact-trigger shortcuts you teach, review, enable, or remove.', access: 'User-created shortcuts', icon: 'sparkles' },
];

export function slugifyId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normalizeEnvKeys(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(/[\n,]/);
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
}

export function normalizeMcpServerDraft(draft, existingServers = []) {
  const name = String(draft?.name ?? '').trim();
  if (!name) throw new Error('Give this MCP server a name.');
  if (name.length > 80) throw new Error('Server names must be 80 characters or fewer.');

  const id = String(draft?.id || slugifyId(name)).trim().toLowerCase();
  if (!ID_PATTERN.test(id)) throw new Error('Use a short server ID with letters, numbers, dots, dashes, or underscores.');
  if (existingServers.some((server) => server.id === id)) throw new Error('A server with this ID already exists.');

  const transport = draft?.transport === 'streamable-http' ? 'streamable-http' : 'stdio';
  const enabled = draft?.enabled !== false;
  const base = { id, name, transport, enabled, createdAt: Number(draft?.createdAt) || Date.now() };

  if (transport === 'stdio') {
    const command = String(draft?.command ?? '').trim();
    if (!command) throw new Error('Enter the executable or package-manager command.');
    if (command.length > 240) throw new Error('The command must be 240 characters or fewer.');
    const rawArgs = Array.isArray(draft?.args) ? draft.args : String(draft?.argsText ?? '').split('\n');
    const args = rawArgs.map((item) => String(item).trim()).filter(Boolean);
    const envKeys = normalizeEnvKeys(draft?.envKeys);
    const invalidKey = envKeys.find((key) => !ENV_PATTERN.test(key));
    if (invalidKey) throw new Error(`“${invalidKey}” is not a valid environment variable name. Enter names only—never secret values.`);
    return { ...base, command, args, envKeys };
  }

  const urlText = String(draft?.url ?? '').trim();
  let endpoint;
  try {
    endpoint = new URL(urlText);
  } catch {
    throw new Error('Enter a complete MCP endpoint URL beginning with https://.');
  }
  if (!['https:', 'http:'].includes(endpoint.protocol)) throw new Error('Only HTTP or HTTPS MCP endpoints are supported.');
  if (endpoint.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]', '::1'].includes(endpoint.hostname)) {
    throw new Error('Use HTTPS for remote MCP servers. Plain HTTP is allowed only for localhost.');
  }
  if (endpoint.username || endpoint.password) throw new Error('Do not put credentials (usernames, passwords, or tokens) in the endpoint URL.');
  if (endpoint.search) throw new Error('Query parameters are not saved because they can contain secrets. Configure authentication in your MCP host instead.');
  if (endpoint.hash) throw new Error('URL fragments are not saved because they can contain secrets. Configure authentication in your MCP host instead.');
  return { ...base, url: endpoint.toString() };
}

export function buildMcpClientConfig(servers = []) {
  const mcpServers = {};
  for (const server of servers.filter((item) => item?.enabled !== false)) {
    if (!server?.id) continue;
    if (server.transport === 'streamable-http') {
      mcpServers[server.id] = { type: 'http', url: server.url };
      continue;
    }
    const config = { command: server.command, args: Array.isArray(server.args) ? server.args : [] };
    const envKeys = normalizeEnvKeys(server.envKeys);
    if (envKeys.length) config.env = Object.fromEntries(envKeys.map((key) => [key, '<SET_IN_HOST>']));
    mcpServers[server.id] = config;
  }
  return { mcpServers };
}

export function parseMcpClientConfig(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.mcpServers || typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers)) {
    throw new Error('Expected a config object with an “mcpServers” map.');
  }
  const servers = [];
  let ignoredEnvValues = 0;
  const usedIds = new Set();

  for (const [rawName, value] of Object.entries(parsed.mcpServers)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const baseName = String(rawName).trim() || 'MCP server';
    let id = slugifyId(baseName) || `mcp-server-${servers.length + 1}`;
    let suffix = 2;
    while (usedIds.has(id)) id = `${slugifyId(baseName).slice(0, 58)}-${suffix++}`;
    usedIds.add(id);

    if (typeof value.command === 'string' && value.command.trim()) {
      const env = value.env && typeof value.env === 'object' && !Array.isArray(value.env) ? value.env : {};
      const envKeys = Object.keys(env).filter((key) => ENV_PATTERN.test(key));
      ignoredEnvValues += envKeys.filter((key) => env[key] !== undefined && env[key] !== null && env[key] !== '' && env[key] !== '<SET_IN_HOST>').length;
      const server = normalizeMcpServerDraft({
        id,
        name: baseName,
        transport: 'stdio',
        command: value.command,
        args: Array.isArray(value.args) ? value.args.filter((arg) => typeof arg === 'string') : [],
        envKeys,
        enabled: true,
      });
      servers.push(server);
      continue;
    }

    if (typeof value.url === 'string' && value.url.trim()) {
      if (value.type && !['http', 'streamable-http'].includes(value.type)) throw new Error(`“${baseName}” uses an unsupported remote transport.`);
      servers.push(normalizeMcpServerDraft({ id, name: baseName, transport: 'streamable-http', url: value.url, enabled: true }));
      continue;
    }

    throw new Error(`“${baseName}” does not contain a supported command or HTTP URL.`);
  }

  if (!servers.length) throw new Error('No supported MCP server entries were found.');
  return { servers, ignoredEnvValues };
}

export function normalizePluginManifest(draft, mcpServers = [], existingPlugins = []) {
  const name = String(draft?.name ?? '').trim();
  if (!name) throw new Error('Give this plugin a name.');
  if (name.length > 80) throw new Error('Plugin names must be 80 characters or fewer.');
  const id = String(draft?.id || slugifyId(name)).trim().toLowerCase();
  if (!ID_PATTERN.test(id)) throw new Error('Use a short plugin ID with letters, numbers, dots, dashes, or underscores.');
  if (existingPlugins.some((plugin) => plugin.id === id)) throw new Error('A plugin with this ID already exists.');
  const version = String(draft?.version || '1.0.0').trim();
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error('Use a semantic version such as 1.0.0.');
  const description = String(draft?.description ?? '').trim();
  if (description.length > 400) throw new Error('Descriptions must be 400 characters or fewer.');
  const serverId = String(draft?.serverId ?? '').trim();
  if (serverId && !mcpServers.some((server) => server.id === serverId)) throw new Error('Choose an MCP server that is saved in Julien.');
  const rawPermissions = Array.isArray(draft?.permissions) ? draft.permissions : [];
  const invalidPermission = rawPermissions.find((permission) => !PLUGIN_PERMISSION_IDS.has(permission));
  if (invalidPermission) throw new Error(`“${invalidPermission}” is not a supported permission.`);
  const permissions = [...new Set(rawPermissions)];

  return {
    format: 'julien-plugin/v1',
    id,
    name,
    version,
    description,
    serverId: serverId || '',
    permissions,
    enabled: draft?.enabled !== false,
    createdAt: Number(draft?.createdAt) || Date.now(),
  };
}

export function buildPluginManifest(plugin) {
  return {
    format: 'julien-plugin/v1',
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    serverId: plugin.serverId || '',
    permissions: Array.isArray(plugin.permissions) ? plugin.permissions : [],
  };
}

export function parsePluginManifest(text, mcpServers = [], existingPlugins = []) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('A plugin manifest must be a JSON object.');
  if (parsed.format && parsed.format !== 'julien-plugin/v1') throw new Error('This plugin manifest format is not supported.');
  return normalizePluginManifest(parsed, mcpServers, existingPlugins);
}

export function parsePluginRegistry(text, mcpServers = [], existingPlugins = []) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!parsed || parsed.format !== 'julien-plugin-registry/v1' || !Array.isArray(parsed.plugins)) {
    throw new Error('Expected a Julien plugin registry with a “plugins” array.');
  }
  const available = [...existingPlugins];
  const plugins = parsed.plugins.map((manifest) => {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Each plugin entry must be a manifest object.');
    if (manifest.format && manifest.format !== 'julien-plugin/v1') throw new Error('A plugin entry uses an unsupported format.');
    const plugin = normalizePluginManifest(manifest, mcpServers, available);
    available.push(plugin);
    return plugin;
  });
  return plugins;
}
