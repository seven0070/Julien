import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchGithubSkillPackage,
  installedSkillFromManifest,
  normalizeSkillManifest,
  parseGithubSkillLocation,
  skillToManifest,
  MARKETPLACE_SKILLS,
} from '../src/skillLibrary.js';

const sampleSkill = {
  format: 'julien-skill/v1',
  id: 'break-reminder',
  name: 'Break Reminder',
  version: '1.0.0',
  description: 'A simple local reminder.',
  author: 'Example author',
  license: 'MIT',
  category: 'wellbeing',
  trigger: 'take a break',
  action: { type: 'task', text: 'Step away from the screen for five minutes' },
};

test('validates safe Julien skill manifests and drops executable or unknown fields', () => {
  const manifest = normalizeSkillManifest({ ...sampleSkill, code: 'fetch("https://evil.invalid")', entrypoint: 'https://evil.invalid/run.js' });
  assert.equal(manifest.trigger, 'take a break');
  assert.equal(manifest.action.type, 'task');
  assert.equal('code' in manifest, false);
  assert.equal('entrypoint' in manifest, false);
  assert.throws(() => normalizeSkillManifest({ ...sampleSkill, format: 'npm-package' }), /Unsupported skill package/);
  assert.throws(() => normalizeSkillManifest({ ...sampleSkill, action: { type: 'shell', text: 'rm -rf /' } }), /Only Julien’s built-in/);
  assert.throws(() => normalizeSkillManifest({ ...sampleSkill, trigger: 'x' }), /exact trigger phrase/);
});

test('all curated marketplace entries have unique exact triggers and valid local actions', () => {
  const manifests = MARKETPLACE_SKILLS.map((manifest) => normalizeSkillManifest(manifest));
  assert.equal(new Set(manifests.map((manifest) => manifest.id)).size, manifests.length);
  assert.equal(new Set(manifests.map((manifest) => manifest.trigger)).size, manifests.length);
  assert.ok(manifests.every((manifest) => ['task', 'memory', 'focus'].includes(manifest.action.type)));
});

test('installs marketplace package metadata into the existing local skill shape', () => {
  const manifest = MARKETPLACE_SKILLS.find((item) => item.id === 'deep-work-sprint');
  const skill = installedSkillFromManifest(manifest, { installedId: 'installed-1', source: { type: 'marketplace', packageId: manifest.id } });
  assert.equal(skill.id, 'installed-1');
  assert.equal(skill.trigger, 'deep work sprint');
  assert.equal(skill.actionType, 'focus');
  assert.equal(skill.source.type, 'marketplace');
  assert.equal(skill.enabled, true);
  assert.equal(skillToManifest(skill).format, 'julien-skill/v1');
});

test('parses GitHub repo, blob, and raw file links into the GitHub API only', () => {
  const repo = parseGithubSkillLocation('https://github.com/julien-labs/skills', 'skills/reset.json', 'main');
  assert.equal(repo.apiUrl, 'https://api.github.com/repos/julien-labs/skills/contents/skills/reset.json?ref=main');
  const blob = parseGithubSkillLocation('https://github.com/julien-labs/skills/blob/v2/skills/reset.json');
  assert.equal(blob.ref, 'v2');
  assert.equal(blob.path, 'skills/reset.json');
  const raw = parseGithubSkillLocation('https://raw.githubusercontent.com/julien-labs/skills/main/skills/reset.json');
  assert.equal(raw.apiUrl, 'https://api.github.com/repos/julien-labs/skills/contents/skills/reset.json?ref=main');
  assert.throws(() => parseGithubSkillLocation('https://evil.example/julien-labs/skills'), /only imports public skills/);
  assert.throws(() => parseGithubSkillLocation('https://github.com/julien-labs/skills?token=abc'), /without credentials/);
  assert.throws(() => parseGithubSkillLocation('https://github.com/julien-labs/skills', '../secret.json'), /relative path/);
});

test('fetches a public GitHub manifest without credentials and records its source SHA', async () => {
  const contents = Buffer.from(JSON.stringify({ ...sampleSkill, script: 'should not be retained' })).toString('base64');
  let fetchOptions;
  const result = await fetchGithubSkillPackage(
    parseGithubSkillLocation('https://github.com/julien-labs/skills', 'skills/break.json', 'main'),
    async (url, options) => {
      assert.match(url, /^https:\/\/api\.github\.com\//);
      fetchOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({ type: 'file', encoding: 'base64', content: contents, size: Buffer.from(contents, 'base64').length, sha: 'abc123', html_url: 'https://github.com/julien-labs/skills/blob/main/skills/break.json' }),
      };
    },
  );
  assert.equal(fetchOptions.credentials, 'omit');
  assert.equal('Authorization' in fetchOptions.headers, false);
  assert.equal(result.manifest.name, 'Break Reminder');
  assert.equal('script' in result.manifest, false);
  assert.equal(result.source.sha, 'abc123');
  assert.equal(result.source.type, 'github');
});
