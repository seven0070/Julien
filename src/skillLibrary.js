const SKILL_CATEGORIES = new Set(['planning', 'focus', 'wellbeing', 'productivity', 'home', 'learning', 'memory', 'other']);
const SKILL_ACTIONS = new Set(['task', 'memory', 'focus']);
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;

export const MARKETPLACE_CATEGORIES = [
  { id: 'all', label: 'All skills' },
  { id: 'planning', label: 'Planning' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'focus', label: 'Focus' },
  { id: 'wellbeing', label: 'Wellbeing' },
  { id: 'home', label: 'Home' },
  { id: 'learning', label: 'Learning' },
];

export const MARKETPLACE_SKILLS = [
  {
    format: 'julien-skill/v1', id: 'morning-three', name: 'Morning Three', version: '1.0.0', author: 'Julien Skills', license: 'CC0-1.0', category: 'planning',
    description: 'Create a gentle reminder to choose three priorities for the day.', trigger: 'morning three', tags: ['daily', 'priorities'],
    action: { type: 'task', text: 'Choose my top three priorities for today' },
  },
  {
    format: 'julien-skill/v1', id: 'weekly-reset', name: 'Weekly Reset', version: '1.0.0', author: 'Julien Skills', license: 'CC0-1.0', category: 'planning',
    description: 'Add a weekly review reminder so you can close out and plan ahead.', trigger: 'weekly reset', tags: ['weekly', 'review'],
    action: { type: 'task', text: 'Review the week and choose priorities for next week' },
  },
  {
    format: 'julien-skill/v1', id: 'tomorrow-prep', name: 'Tomorrow Prep', version: '1.0.0', author: 'Julien Skills', license: 'CC0-1.0', category: 'planning',
    description: 'Make space for a short end-of-day plan for tomorrow.', trigger: 'prepare tomorrow', tags: ['evening', 'planning'],
    action: { type: 'task', text: 'Review tomorrow and choose the first task to start with' },
  },
  {
    format: 'julien-skill/v1', id: 'deep-work-sprint', name: 'Deep Work Sprint', version: '1.0.0', author: 'Julien Skills', license: 'CC0-1.0', category: 'focus',
    description: 'Start Julien’s built-in 25-minute focus timer with an exact phrase.', trigger: 'deep work sprint', tags: ['timer', 'focus'],
    action: { type: 'focus', text: '' },
  },
  {
    format: 'julien-skill/v1', id: 'quiet-hour', name: 'Quiet Hour', version: '1.0.0', author: 'Julien Skills', license: 'CC0-1.0', category: 'focus',
    description: 'Add a reminder to protect an uninterrupted block of time.', trigger: 'protect a quiet hour', tags: ['focus', 'boundaries'],
    action: { type: 'task', text: 'Protect a quiet hour for uninterrupted work' },
  },
  {
    format: 'julien-skill/v1', id: 'stretch-break', name: 'Stretch Break', version: '1.0.0', author: 'Julien Skills', license: 'CC0-1.0', category: 'wellbeing',
    description: 'Create a small reminder to stand up and stretch.', trigger: 'stretch break', tags: ['movement', 'break'],
    action: { type: 'task', text: 'Stand up, stretch, and take a short screen break' },
  },
  {
    format: 'julien-skill/v1', id: 'water-check', name: 'Water Check', version: '1.0.0', author: 'Julien Skills', license: 'CC0-1.0', category: 'wellbeing',
    description: 'Add a simple hydration nudge to your local reminder list.', trigger: 'water check', tags: ['wellbeing', 'daily'],
    action: { type: 'task', text: 'Pause for a glass of water' },
  },
  {
    format: 'julien-skill/v1', id: 'home-reset', name: 'Home Reset', version: '1.0.0', author: 'Julien Skills', license: 'CC0-1.0', category: 'home',
    description: 'Create a short reminder to reset one small area at home.', trigger: 'home reset', tags: ['home', 'routine'],
    action: { type: 'task', text: 'Reset one small area at home for ten minutes' },
  },
  {
    format: 'julien-skill/v1', id: 'reading-minute', name: 'Reading Minute', version: '1.0.0', author: 'Julien Skills', license: 'CC0-1.0', category: 'learning',
    description: 'Make a little room to read or learn something new.', trigger: 'reading minute', tags: ['reading', 'learning'],
    action: { type: 'task', text: 'Read or learn something for fifteen minutes' },
  },
  {
    format: 'julien-skill/v1', id: 'idea-review', name: 'Idea Review', version: '1.0.0', author: 'Julien Skills', license: 'CC0-1.0', category: 'learning',
    description: 'Save a neutral prompt in local memory to revisit an idea later.', trigger: 'review my idea', tags: ['ideas', 'memory'],
    action: { type: 'memory', text: 'Idea to revisit: add the details I want to remember.', memoryCategory: 'project' },
  },
  {
    format: 'julien-skill/v1', id: 'task-wrap-up', name: 'Task Wrap-up', version: '1.0.0', author: 'Julien Skills', license: 'CC0-1.0', category: 'productivity',
    description: 'Add a reminder to close open loops before you finish work.', trigger: 'wrap up my tasks', tags: ['tasks', 'workday'],
    action: { type: 'task', text: 'Review open tasks and choose what can wait' },
  },
  {
    format: 'julien-skill/v1', id: 'gentle-start', name: 'Gentle Start', version: '1.0.0', author: 'Julien Skills', license: 'CC0-1.0', category: 'wellbeing',
    description: 'Add a small prompt to ease into a busy morning.', trigger: 'gentle start', tags: ['morning', 'wellbeing'],
    action: { type: 'task', text: 'Take a breath, pick one small next step, and begin' },
  },
];

export function slugifySkillId(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

export function normalizeSkillManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A skill package must be a JSON object.');
  if (input.format !== 'julien-skill/v1') throw new Error('Unsupported skill package. Expected format “julien-skill/v1”.');

  const name = String(input.name ?? '').trim();
  if (!name || name.length > 80) throw new Error('Skill name is required and must be 80 characters or fewer.');
  const id = String(input.id || slugifySkillId(name)).trim().toLowerCase();
  if (!ID_PATTERN.test(id)) throw new Error('Skill ID must use letters, numbers, dots, dashes, or underscores.');
  const version = String(input.version ?? '1.0.0').trim();
  if (!VERSION_PATTERN.test(version)) throw new Error('Skill version must look like 1.0.0.');
  const trigger = String(input.trigger ?? '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/^[\s,.!?]+|[\s,.!?]+$/g, '');
  if (trigger.length < 2 || trigger.length > 80 || /[\u0000-\u001f]/.test(trigger)) throw new Error('Add an exact trigger phrase between 2 and 80 characters.');
  const description = String(input.description ?? '').trim();
  if (description.length > 360) throw new Error('Skill descriptions must be 360 characters or fewer.');
  const author = String(input.author ?? 'Community').trim().slice(0, 80) || 'Community';
  const license = String(input.license ?? 'Unspecified').trim().slice(0, 50) || 'Unspecified';
  const category = SKILL_CATEGORIES.has(input.category) ? input.category : 'other';
  const action = input.action;
  if (!action || typeof action !== 'object' || Array.isArray(action) || !SKILL_ACTIONS.has(action.type)) {
    throw new Error('Only Julien’s built-in task, memory, and focus actions are supported.');
  }
  const actionText = String(action.text ?? '').trim();
  if (action.type !== 'focus' && (!actionText || actionText.length > 240)) throw new Error('Task and memory actions need text (up to 240 characters).');
  const memoryCategory = ['preference', 'person', 'project', 'routine', 'other'].includes(action.memoryCategory) ? action.memoryCategory : 'other';
  const tags = Array.isArray(input.tags) ? input.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8) : [];

  return {
    format: 'julien-skill/v1',
    id,
    name,
    version,
    description,
    author,
    license,
    category,
    trigger,
    action: { type: action.type, text: action.type === 'focus' ? '' : actionText, ...(action.type === 'memory' ? { memoryCategory } : {}) },
    tags,
  };
}

export function installedSkillFromManifest(input, { installedId, source = { type: 'personal' }, enabled = true } = {}) {
  const manifest = normalizeSkillManifest(input);
  return {
    id: installedId || `skill-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    packageId: manifest.id,
    name: manifest.name,
    trigger: manifest.trigger,
    actionType: manifest.action.type,
    actionText: manifest.action.text,
    category: manifest.action.memoryCategory || 'other',
    skillCategory: manifest.category,
    description: manifest.description,
    version: manifest.version,
    author: manifest.author,
    license: manifest.license,
    tags: manifest.tags,
    source,
    enabled,
    createdAt: Date.now(),
  };
}

export function skillToManifest(skill) {
  return normalizeSkillManifest({
    format: 'julien-skill/v1',
    id: skill.packageId || slugifySkillId(skill.name),
    name: skill.name,
    version: skill.version || '1.0.0',
    description: skill.description || 'A local Julien skill.',
    author: skill.author || 'Julien user',
    license: skill.license || 'Unspecified',
    category: skill.skillCategory || 'other',
    trigger: skill.trigger,
    action: { type: skill.actionType, text: skill.actionText, memoryCategory: skill.category },
    tags: skill.tags || [],
  });
}

function validateGithubPath(path) {
  const normalized = String(path ?? '').trim().replace(/^\/+/, '');
  const segments = normalized.split('/');
  if (!normalized || normalized.length > 300 || segments.some((part) => !part || part === '.' || part === '..' || part.includes('\\'))) {
    throw new Error('Enter a relative path to a skill JSON file, for example skills/my-skill.json.');
  }
  if (!normalized.toLowerCase().endsWith('.json')) throw new Error('GitHub skill packages must be JSON files ending in .json.');
  return normalized;
}

export function parseGithubSkillLocation(repositoryUrl, manifestPath = 'julien-skill.json', ref = 'main') {
  let url;
  try {
    url = new URL(String(repositoryUrl ?? '').trim());
  } catch {
    throw new Error('Enter a valid public GitHub repository or file URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Use a public HTTPS GitHub URL without credentials, query parameters, or fragments.');
  }

  let owner;
  let repository;
  let resolvedPath = manifestPath;
  let resolvedRef = ref;
  const parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));

  if (url.hostname === 'github.com') {
    if (parts.length < 2) throw new Error('GitHub URL needs an owner and repository name.');
    [owner, repository] = parts;
    repository = repository.replace(/\.git$/i, '');
    if (parts[2] === 'blob') {
      if (!parts[3] || parts.length < 5) throw new Error('Use a GitHub blob URL pointing to a skill JSON file.');
      resolvedRef = parts[3];
      resolvedPath = parts.slice(4).join('/');
    } else if (parts[2] === 'tree') {
      if (parts[3]) resolvedRef = parts[3];
      if (parts.length > 4) resolvedPath = parts.slice(4).join('/');
    } else if (parts.length > 2) {
      throw new Error('Use a repository URL or a GitHub blob URL to a skill JSON file.');
    }
  } else if (url.hostname === 'raw.githubusercontent.com') {
    if (parts.length < 4) throw new Error('Raw GitHub URL needs owner, repository, branch, and file path.');
    [owner, repository, resolvedRef] = parts;
    resolvedPath = parts.slice(3).join('/');
  } else {
    throw new Error('For safety, Julien only imports public skills from github.com or raw.githubusercontent.com.');
  }

  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repository)) {
    throw new Error('That GitHub owner or repository name is not valid.');
  }
  resolvedRef = String(resolvedRef ?? '').trim();
  if (!resolvedRef || resolvedRef.length > 120 || /[\u0000-\u001f]/.test(resolvedRef) || resolvedRef.includes('..')) {
    throw new Error('Enter a valid branch, tag, or commit reference.');
  }
  const safePath = validateGithubPath(resolvedPath);
  const encodedPath = safePath.split('/').map(encodeURIComponent).join('/');
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodedPath}?ref=${encodeURIComponent(resolvedRef)}`;
  return {
    owner,
    repository,
    ref: resolvedRef,
    path: safePath,
    apiUrl,
    repoUrl: `https://github.com/${owner}/${repository}`,
    htmlUrl: `https://github.com/${owner}/${repository}/blob/${encodeURIComponent(resolvedRef)}/${encodedPath}`,
  };
}

function decodeGithubContent(content) {
  if (typeof globalThis.atob !== 'function') throw new Error('This browser cannot decode the GitHub response.');
  try {
    const binary = globalThis.atob(String(content).replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('The GitHub file is not valid UTF-8 JSON.');
  }
}

export async function fetchGithubSkillPackage(location, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is not available in this browser.');
  const source = typeof location === 'string' ? parseGithubSkillLocation(location) : location;
  if (!source?.apiUrl?.startsWith('https://api.github.com/repos/')) throw new Error('GitHub import URL was not validated.');
  let response;
  try {
    response = await fetchImpl(source.apiUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
  } catch {
    throw new Error('Could not reach GitHub. Check the connection and try again. No GitHub token is used.');
  }
  if (response.status === 404) throw new Error('Skill file not found. Check that the repository is public and the JSON path and branch are correct.');
  if (response.status === 403) throw new Error('GitHub rate limit reached. Try again later; Julien never asks for a GitHub token.');
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
  let file;
  try {
    file = await response.json();
  } catch {
    throw new Error('GitHub returned an unreadable file response.');
  }
  if (!file || file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') {
    throw new Error('The selected GitHub path must point to a regular JSON file.');
  }
  if (Number(file.size) > 65536 || file.content.length > 100000) throw new Error('Skill packages must be smaller than 64 KB.');
  let rawManifest;
  try {
    rawManifest = JSON.parse(decodeGithubContent(file.content));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('The GitHub file is not valid JSON.');
    throw error;
  }
  const manifest = normalizeSkillManifest(rawManifest);
  return {
    manifest,
    source: {
      type: 'github',
      repoUrl: source.repoUrl,
      htmlUrl: file.html_url || source.htmlUrl,
      path: source.path,
      ref: source.ref,
      sha: file.sha || '',
      checkedAt: Date.now(),
    },
  };
}
