import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMcpClientConfig,
  buildPluginManifest,
  normalizeMcpServerDraft,
  normalizePluginManifest,
  parseMcpClientConfig,
  parsePluginManifest,
  parsePluginRegistry,
} from '../src/extensions.js';

test('normalizes stdio MCP profiles without accepting secret values', () => {
  const profile = normalizeMcpServerDraft({
    name: 'Files workspace',
    transport: 'stdio',
    command: 'npx',
    argsText: '-y\n@sample/files-mcp\n/home/me/Documents',
    envKeys: 'FILES_TOKEN\nHOME',
  });
  assert.equal(profile.id, 'files-workspace');
  assert.deepEqual(profile.args, ['-y', '@sample/files-mcp', '/home/me/Documents']);
  assert.deepEqual(profile.envKeys, ['FILES_TOKEN', 'HOME']);
  assert.equal('env' in profile, false);
  assert.throws(() => normalizeMcpServerDraft({ name: 'Invalid env', command: 'npx', envKeys: 'TOKEN=do-not-save' }), /variable name/);
});

test('requires secure remote endpoints and rejects URL credentials or query secrets', () => {
  assert.equal(normalizeMcpServerDraft({ name: 'Remote', transport: 'streamable-http', url: 'https://mcp.example.com/mcp' }).url, 'https://mcp.example.com/mcp');
  assert.throws(() => normalizeMcpServerDraft({ name: 'Insecure', transport: 'streamable-http', url: 'http://mcp.example.com/mcp' }), /HTTPS/);
  assert.throws(() => normalizeMcpServerDraft({ name: 'Secret URL', transport: 'streamable-http', url: 'https://user:pass@example.com/mcp' }), /credentials/);
  assert.throws(() => normalizeMcpServerDraft({ name: 'Token URL', transport: 'streamable-http', url: 'https://example.com/mcp?token=abc' }), /Query parameters/);
  assert.throws(() => normalizeMcpServerDraft({ name: 'Fragment URL', transport: 'streamable-http', url: 'https://example.com/mcp#token=abc' }), /fragments/);
});

test('exports enabled MCP profiles in a host config with secret placeholders only', () => {
  const servers = [
    normalizeMcpServerDraft({ name: 'GitHub', command: 'npx', args: ['-y', 'github-mcp'], envKeys: ['GITHUB_TOKEN'] }),
    normalizeMcpServerDraft({ name: 'Remote tools', transport: 'streamable-http', url: 'https://tools.example.com/mcp' }),
    { id: 'paused', name: 'Paused', transport: 'stdio', command: 'node', args: [], enabled: false },
  ];
  assert.deepEqual(buildMcpClientConfig(servers), {
    mcpServers: {
      github: { command: 'npx', args: ['-y', 'github-mcp'], env: { GITHUB_TOKEN: '<SET_IN_HOST>' } },
      'remote-tools': { type: 'http', url: 'https://tools.example.com/mcp' },
    },
  });
});

test('imports MCP config while discarding environment variable values', () => {
  const result = parseMcpClientConfig(JSON.stringify({
    mcpServers: {
      local: { command: 'node', args: ['server.js'], env: { TOKEN: 'super-secret', HOME: '/tmp' } },
      remote: { type: 'http', url: 'https://tools.example.com/mcp' },
    },
  }));
  assert.equal(result.servers.length, 2);
  assert.deepEqual(result.servers[0].envKeys, ['TOKEN', 'HOME']);
  assert.equal('env' in result.servers[0], false);
  assert.equal(result.ignoredEnvValues, 2);
  assert.throws(() => parseMcpClientConfig('{"server":"wrong shape"}'), /mcpServers/);
  assert.throws(() => parseMcpClientConfig('{"mcpServers":{"old-sse":{"type":"sse","url":"https://example.com/sse"}}}'), /unsupported remote transport/);
});

test('plugin manifests are declarative, permission-scoped, and never retain executable fields', () => {
  const plugin = parsePluginManifest(JSON.stringify({
    format: 'julien-plugin/v1',
    name: 'Issue helper',
    version: '1.2.0',
    description: 'Read and summarize assigned issues.',
    permissions: ['tasks.read', 'files.read'],
    code: 'alert(1)',
    entrypoint: 'https://evil.invalid/plugin.js',
  }));
  assert.equal(plugin.id, 'issue-helper');
  assert.deepEqual(plugin.permissions, ['tasks.read', 'files.read']);
  assert.equal('code' in plugin, false);
  assert.equal('entrypoint' in plugin, false);
  assert.equal(buildPluginManifest(plugin).format, 'julien-plugin/v1');
  assert.throws(() => normalizePluginManifest({ name: 'Bad permission', permissions: ['execute-code'] }), /not a supported permission/);
  assert.throws(() => normalizePluginManifest({ name: 'Bad version', version: 'latest' }), /semantic version/);
});

test('imports exported plugin registries and rejects duplicate or malformed entries', () => {
  const registry = JSON.stringify({
    format: 'julien-plugin-registry/v1',
    plugins: [
      { format: 'julien-plugin/v1', id: 'one', name: 'One', version: '1.0.0', permissions: ['tasks.read'] },
      { format: 'julien-plugin/v1', id: 'two', name: 'Two', version: '1.1.0', permissions: [] },
    ],
  });
  const imported = parsePluginRegistry(registry);
  assert.deepEqual(imported.map((plugin) => plugin.id), ['one', 'two']);
  assert.throws(() => parsePluginRegistry(registry, [], [{ id: 'one' }]), /already exists/);
  assert.throws(() => parsePluginRegistry('{"format":"julien-plugin-registry/v1","plugins":[null]}'), /manifest object/);
});
