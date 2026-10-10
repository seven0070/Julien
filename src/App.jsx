import { useEffect, useMemo, useRef, useState } from 'react';
import { classifyIntent } from './classifier.js';
import { INTEGRATION_GROUPS, INTEGRATIONS } from './integrations.js';
import {
  assignProfileToUnassignedRoutes,
  buildModelRouterConfig,
  defaultRouterConfig,
  makeQwenLocalModelProfileDraft,
  MODEL_PROVIDERS,
  normalizeModelProfileDraft,
  parseModelRouterConfig,
  QWEN_LOCAL_MODEL_PRESET,
  resolveRoutePreview,
  ROUTER_POLICIES_LIST,
  ROUTER_TASKS,
  updateRouterRoute,
} from './modelRouter.js';
import {
  fetchGithubSkillPackage,
  installedSkillFromManifest,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_SKILLS,
  normalizeSkillManifest,
  parseGithubSkillLocation,
  skillToManifest,
} from './skillLibrary.js';
import { isActionVerifiedInState, OUTCOME_STATES, SOUL_CURRENT_SCOPE, SOUL_NAME, SOUL_PRINCIPLES, SOUL_PURPOSE, SOUL_VERSION } from './soul.js';
import {
  buildMcpClientConfig,
  buildPluginManifest,
  CORE_MODULES,
  normalizeMcpServerDraft,
  normalizePluginManifest,
  parseMcpClientConfig,
  parsePluginManifest,
  parsePluginRegistry,
  PLUGIN_PERMISSION_OPTIONS,
} from './extensions.js';
import {
  ArrowUp,
  ArrowUpRight,
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Copy,
  Download,
  FileText,
  LockKeyhole,
  Mail,
  Menu,
  MessageCircle,
  Mic,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2,
  X,
  Zap,
  UserRound,
  ListTodo,
  CalendarPlus,
  PenLine,
  MoreHorizontal,
  MicOff,
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
  Cpu,
  Link2,
  Server,
  Puzzle,
  Upload,
  BookOpen,
  Github,
  RefreshCw,
} from 'lucide-react';

const STORAGE_KEYS = {
  memories: 'julien.memories.v1',
  tasks: 'julien.tasks.v1',
  events: 'julien.events.v1',
  drafts: 'julien.drafts.v1',
  activity: 'julien.activity.v1',
  messages: 'julien.messages.v1',
  conversations: 'julien.conversations.v1',
  activeConversation: 'julien.active-conversation.v1',
  learningProfile: 'julien.learning-profile.v1',
  skills: 'julien.skills.v1',
  connectionRequests: 'julien.connection-requests.v1',
  mcpServers: 'julien.mcp-servers.v1',
  pluginManifests: 'julien.plugin-manifests.v1',
  modelProfiles: 'julien.model-profiles.v1',
  modelRouterConfig: 'julien.model-router-config.v1',
  modelPresetDismissed: 'julien.model-preset-dismissed.v1',
  settings: 'julien.settings.v1',
};

const MEMORY_CATEGORIES = [
  { id: 'preference', label: 'Preference' },
  { id: 'person', label: 'Person' },
  { id: 'project', label: 'Project' },
  { id: 'routine', label: 'Routine' },
  { id: 'other', label: 'Other' },
];

const LEARNING_DEFAULTS = { brevity: 'balanced', tone: 'balanced', appliedSignalCounts: {}, dismissedSignalCounts: {} };
const LEARNING_CHOICES = [
  { value: 'concise', kind: 'brevity', label: 'Keep replies concise', description: 'Favor shorter, more direct replies.' },
  { value: 'detailed', kind: 'brevity', label: 'Add more detail', description: 'Include a little more context.' },
  { value: 'warm', kind: 'tone', label: 'Use a warmer tone', description: 'Keep the wording friendly and encouraging.' },
  { value: 'direct', kind: 'tone', label: 'Be more direct', description: 'Lead with the useful answer.' },
];

const WELCOME_TEXT =
  'I can remember the details you choose to share, help turn a thought into a plan, and prepare small actions for you to approve. I’ll be clear about what I can do—and nothing here is sent to an outside account.';

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `j-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeWelcomeMessage() {
  return { id: 'welcome', role: 'assistant', text: WELCOME_TEXT, createdAt: Date.now(), welcome: true };
}

function readStorage(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function persist(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The app remains usable if browser storage is disabled or full.
  }
}

function loadModelRouterState() {
  const storedProfiles = readStorage(STORAGE_KEYS.modelProfiles, null);
  const profiles = (Array.isArray(storedProfiles) ? storedProfiles : []).reduce((valid, profile) => {
    try {
      valid.push(normalizeModelProfileDraft(profile, valid));
    } catch {
      // Ignore invalid legacy or manually edited local-storage entries.
    }
    return valid;
  }, []);
  const presetDismissed = readStorage(STORAGE_KEYS.modelPresetDismissed, false) === true;
  if (!presetDismissed && !profiles.some((profile) => profile.kind === 'local' && profile.model === QWEN_LOCAL_MODEL_PRESET.model)) {
    profiles.unshift(makeQwenLocalModelProfileDraft(profiles));
  }
  const saved = readStorage(STORAGE_KEYS.modelRouterConfig, null);
  const defaults = defaultRouterConfig();
  const policy = ROUTER_POLICIES_LIST.some((item) => item.id === saved?.policy) ? saved.policy : defaults.policy;
  let config = {
    ...defaults,
    name: typeof saved?.name === 'string' && saved.name.trim() ? saved.name.trim().slice(0, 80) : defaults.name,
    policy,
    createdAt: Number(saved?.createdAt) || defaults.createdAt,
  };

  if (Array.isArray(saved?.routes)) {
    for (const route of saved.routes) {
      if (!route || !ROUTER_TASKS.some((task) => task.id === route.task)) continue;
      const isAllowed = (id) => profiles.find((profile) => profile.id === id
        && (route.task !== 'private' || profile.kind === 'local'))?.id ?? '';
      config = updateRouterRoute(config, route.task, 'primaryProfileId', isAllowed(route.primaryProfileId), profiles);
      config = updateRouterRoute(config, route.task, 'fallbackProfileId', isAllowed(route.fallbackProfileId), profiles);
    }
  }

  const qwenProfile = profiles.find((profile) => profile.kind === 'local' && profile.model === QWEN_LOCAL_MODEL_PRESET.model && profile.enabled !== false);
  if (qwenProfile) config = assignProfileToUnassignedRoutes(config, qwenProfile.id, profiles);
  return { config, profiles };
}

function downloadJsonFile(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function loadChatState() {
  const storedConversations = readStorage(STORAGE_KEYS.conversations, null);
  const validConversations = Array.isArray(storedConversations)
    ? storedConversations
      .filter((item) => item && item.id && Array.isArray(item.messages))
      .map((item) => ({ ...item, title: item.title || getConversationTitle(item.messages), updatedAt: Number(item.updatedAt) || Date.now() }))
    : [];

  if (validConversations.length) {
    const savedActiveId = readStorage(STORAGE_KEYS.activeConversation, validConversations[0].id);
    const activeId = validConversations.some((item) => item.id === savedActiveId) ? savedActiveId : validConversations[0].id;
    const active = validConversations.find((item) => item.id === activeId);
    return {
      conversations: validConversations,
      activeId,
      messages: active.messages.length ? active.messages : [makeWelcomeMessage()],
    };
  }

  const legacyMessages = readStorage(STORAGE_KEYS.messages, null);
  const initialMessages = Array.isArray(legacyMessages) && legacyMessages.length ? legacyMessages : [makeWelcomeMessage()];
  const firstConversation = {
    id: makeId(),
    title: 'New conversation',
    messages: initialMessages,
    updatedAt: Date.now(),
  };
  return { conversations: [firstConversation], activeId: firstConversation.id, messages: initialMessages };
}

function getConversationTitle(messages) {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  if (!firstUserMessage?.text) return 'New conversation';
  const firstLine = firstUserMessage.text.trim().replace(/\s+/g, ' ').split(/[.!?]/)[0];
  if (!firstLine) return 'New conversation';
  return firstLine.length > 36 ? `${firstLine.slice(0, 35).trimEnd()}…` : firstLine;
}

function prettyDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function shortTime(value) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(
    new Date(value),
  );
}

function relativeTime(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - Number(value)) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function confidencePercent(value) {
  return `${Math.min(99, Math.round(value * 100))}%`;
}

function categoryLabel(id) {
  return MEMORY_CATEGORIES.find((category) => category.id === id)?.label ?? 'Other';
}

function normalizeSkillTriggerText(value) {
  return String(value ?? '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/^[\s,.!?]+|[\s,.!?]+$/g, '');
}

function describeSkillAction(skill) {
  if (skill.actionType === 'task') return `Add a local reminder: ${skill.actionText}`;
  if (skill.actionType === 'memory') return `Save a local memory: ${skill.actionText}`;
  return 'Start Julien’s 25-minute focus timer';
}

function categoryForText(text) {
  const value = text.toLowerCase();
  if (/prefer|like|love|avoid|style|tone|format|rather than/.test(value)) return 'preference';
  if (/work on|working on|project|launch|build|goal/.test(value)) return 'project';
  if (/every day|every morning|routine|usually|habit|weekly/.test(value)) return 'routine';
  if (/my (?:friend|partner|manager|sister|brother|colleague|team)|\b(?:sam|alex|jordan)\b/.test(value)) return 'person';
  return 'other';
}

function extractDue(text) {
  const value = text.toLowerCase();
  let day = '';
  if (/\b(today|tonight)\b/.test(value)) day = 'Today';
  else if (/\btomorrow\b/.test(value)) day = 'Tomorrow';
  else if (/\bthis week\b/.test(value)) day = 'This week';
  else if (/\bnext week\b/.test(value)) day = 'Next week';
  else {
    const weekday = value.match(/\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if (weekday) day = weekday[1][0].toUpperCase() + weekday[1].slice(1);
  }
  const time = text.match(/\b(?:at\s+)?(\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?))\b/i);
  if (time) {
    const normalized = time[1].replace(/\./g, '').toUpperCase().replace(/\s+/g, ' ');
    return `${day || 'Scheduled'} · ${normalized}`;
  }
  return day || 'No date';
}

function cleanTaskTitle(text) {
  return text
    .replace(/^\s*(?:please\s+)?(?:can you\s+)?(?:could you\s+)?/i, '')
    .replace(/^remind me(?:\s+(?:today|tomorrow|tonight|on\s+\w+))?\s+to\s+/i, '')
    .replace(/^(?:add|create)\s+(?:a\s+)?(?:task|reminder)(?:\s+to)?\s*/i, '')
    .replace(/^(?:don't let me forget|do not let me forget|don't forget to|do not forget to|remember to|i need to|i have to|todo:|to-do:)\s*/i, '')
    .replace(/\b(?:today|tomorrow|tonight|this week|next week|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi, '')
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '');
}

function cleanEventTitle(text) {
  return text
    .replace(/^\s*(?:please\s+)?(?:can you\s+)?(?:could you\s+)?/i, '')
    .replace(/^put\s+(.+?)\s+on\s+(?:my\s+)?calendar(?:\s+.*)?$/i, '$1')
    .replace(/^(?:add|create|make)\s+(?:a|an)\s+(?:calendar\s+)?(?:event|block)\s+(?:for\s+)?/i, '')
    .replace(/^(?:schedule|put\s+(?:this\s+)?on\s+my\s+calendar|block\s+(?:some\s+)?time(?:\s+for)?)\s*/i, '')
    .replace(/^(?:a|an)\s+(?:calendar\s+)?(?:event|block)\s+(?:for\s+)?/i, '')
    .replace(/\b(?:today|tomorrow|tonight|this week|next week|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi, '')
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:a|an)\s+/i, '')
    .replace(/[.!?]+$/, '');
}

function getTopic(text) {
  const match = text.match(/\b(?:about|regarding|saying|to say)\s+(.+?)(?:\s+(?:by|before)\s+.+)?$/i);
  return match?.[1]?.trim().replace(/[.!?]+$/, '') ?? '';
}

function buildDraftDetails(text) {
  const recipientMatch = text.match(/\bto\s+(.+?)(?=\s+(?:about|regarding|saying|with subject)\b|$)/i);
  const recipient = recipientMatch?.[1]?.trim().replace(/[.!?,]+$/, '') ?? '';
  const topic = getTopic(text);
  const subject = topic ? topic[0].toUpperCase() + topic.slice(1) : 'A quick note';
  const greeting = recipient ? `Hi ${recipient.split(/\s+/)[0]},` : 'Hi there,';
  const body = `${greeting}\n\nI wanted to reach out about ${topic || '[add a few details about what you would like to say]'}.\n\nLet me know what you think.\n\nBest,\nYou`;
  return { to: recipient, subject, body };
}

function IconButton({ label, onClick, children, className = '', disabled = false, title }) {
  return (
    <button
      className={`icon-button ${className}`}
      type="button"
      aria-label={label}
      title={title || label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function SectionHeading({ eyebrow, title, description, action }) {
  return (
    <div className="section-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="section-heading-action">{action}</div>}
    </div>
  );
}

function ActionOutcome({ action }) {
  const outcome = action?.outcome ?? 'unverified';
  const Icon = outcome === 'verified' ? CheckCircle2 : outcome === 'executed' ? Clock3 : Circle;
  const label = outcome === 'verified' ? 'VERIFIED IN LOCAL STATE' : outcome === 'executed' ? 'EXECUTED · NOT YET VERIFIED' : outcome === 'proposed' ? 'PROPOSED · NOT RUN' : 'STATUS NOT VERIFIED';
  return <span className={`action-outcome outcome-${outcome}`}><Icon size={12} />{label}</span>;
}

function ActionReceipt({ action, onCopy }) {
  if (!action) return null;
  if (['memory', 'task', 'event', 'forget', 'focus'].includes(action.type)) {
    const icon = action.type === 'memory' || action.type === 'forget' ? <Brain size={16} /> : action.type === 'task' ? <ListTodo size={16} /> : action.type === 'event' ? <CalendarDays size={16} /> : <Clock3 size={16} />;
    const iconClass = action.type === 'memory' || action.type === 'forget' ? 'memory-icon' : action.type === 'task' ? 'task-icon' : action.type === 'event' ? 'calendar-icon' : 'focus-icon';
    const label = action.type === 'memory'
      ? `MEMORY SAVE · ${categoryLabel(action.category).toUpperCase()}`
      : action.type === 'forget'
        ? 'MEMORY REMOVAL'
        : action.type === 'task'
          ? `LOCAL REMINDER · ${action.due}`
          : action.type === 'event'
            ? `LOCAL PLANNING BLOCK · ${action.when}`
            : 'LOCAL FOCUS TIMER';
    const title = action.type === 'focus' ? '25-minute focus session' : action.title;
    return (
      <div className="receipt-card">
        <span className={`receipt-icon ${iconClass}`}>{icon}</span>
        <div className="receipt-copy">
          <span className="receipt-label">{label}</span>
          <strong>{title}</strong>
          <ActionOutcome action={action} />
        </div>
      </div>
    );
  }
  if (action.type === 'draft') {
    return (
      <div className="draft-receipt">
        <div className="draft-receipt-head">
          <span className="receipt-icon mail-icon"><Mail size={16} /></span>
          <span className="receipt-label">DRAFT ONLY · NOT SENT</span>
          <ActionOutcome action={action} />
          <button type="button" className="copy-link" onClick={() => onCopy(`${action.subject}\n\n${action.body}`)}>
            <Copy size={13} /> Copy
          </button>
        </div>
        {action.to && <div className="draft-to">To: {action.to}</div>}
        <div className="draft-subject">{action.subject}</div>
        <pre>{action.body}</pre>
      </div>
    );
  }
  return null;
}

function ChatMessage({ message, conversationId, onSpeak, onCopy, onFeedback }) {
  const isAgent = message.role === 'assistant';
  return (
    <div className={`message-row ${isAgent ? 'agent-message' : 'user-message'}`}>
      {isAgent && (
        <div className="agent-avatar small-avatar" aria-hidden="true">
          <Sparkles size={15} strokeWidth={1.8} />
        </div>
      )}
      <div className="message-main">
        <div className={`message-meta ${isAgent ? '' : 'user-message-meta'}`}>
          <span>{isAgent ? 'JULIEN' : 'YOU'}</span>
          <span className="message-time">{shortTime(message.createdAt)}</span>
          {!isAgent && message.classification && (
            <span className={`intent-chip ${message.classification.highConfidence ? 'intent-confident' : 'intent-held'}`} title={`Local classifier · ${message.classification.elapsedMs.toFixed(2)} ms`}>
              <Cpu size={10} />
              {message.classification.highConfidence
                ? `${message.classification.label} · ${confidencePercent(message.classification.confidence)}`
                : message.classification.predictedIntent !== 'conversation'
                  ? `Held · ${message.classification.predictedLabel}`
                  : 'Conversation'}
            </span>
          )}
        </div>
        <div className={`message-bubble ${isAgent ? 'agent-bubble' : 'user-bubble'}`}>
          {message.text}
        </div>
        <ActionReceipt action={message.action} onCopy={onCopy} />
        {isAgent && !message.welcome && (
          <div className="message-controls">
            <button type="button" className={`message-feedback ${message.feedback?.rating === 'helpful' ? 'chosen' : ''}`} aria-pressed={message.feedback?.rating === 'helpful'} onClick={() => onFeedback(conversationId, message.id, 'helpful')} title="Mark this reply helpful">
              <ThumbsUp size={13} /> <span>Helpful</span>
            </button>
            <button type="button" className={`message-feedback ${message.feedback?.rating === 'needs_work' ? 'chosen' : ''}`} aria-pressed={message.feedback?.rating === 'needs_work'} onClick={() => onFeedback(conversationId, message.id, 'needs_work')} title="Suggest an improvement">
              <ThumbsDown size={13} /> <span>Improve</span>
            </button>
            <button type="button" className="message-speak" onClick={() => onSpeak(message.text)}><Volume2 size={13} /> Listen</button>
          </div>
        )}
      </div>
    </div>
  );
}

function RightRail({ memories, tasks, events, focusRunning, focusRemaining, onGoMemory, onAddTask, onToggleTask }) {
  const openTasks = tasks.filter((task) => !task.done).slice(0, 3);
  const upcomingEvents = events.slice(0, 2);
  return (
    <aside className="right-rail">
      <section className="rail-card memory-rail-card">
        <div className="rail-card-head">
          <div className="rail-title"><span className="rail-title-icon"><Brain size={15} /></span> YOUR MEMORY</div>
          <span className="count-badge">{memories.length}</span>
        </div>
        {memories.length === 0 ? (
          <div className="rail-empty-memory">
            <span className="empty-sparkle"><Sparkles size={14} /></span>
            <p>Nothing saved yet.<br /><strong>That’s yours to change.</strong></p>
          </div>
        ) : (
          <div className="rail-memory-list">
            {memories.slice(0, 2).map((memory) => (
              <div className="rail-memory-item" key={memory.id}>
                <span className={`memory-dot dot-${memory.category}`} />
                <p>{memory.text}</p>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="rail-link" onClick={onGoMemory}>
          {memories.length ? 'Manage memories' : 'Add your first memory'} <ChevronRight size={14} />
        </button>
      </section>

      <section className="rail-card tasks-rail-card">
        <div className="rail-card-head">
          <div className="rail-title"><span className="rail-title-icon task-rail-icon"><ListTodo size={15} /></span> ON YOUR LIST</div>
          <IconButton label="Add a task" className="tiny-add" onClick={onAddTask}><Plus size={15} /></IconButton>
        </div>
        {openTasks.length === 0 && upcomingEvents.length === 0 ? (
          <div className="rail-empty-list">
            <p>Your mind can rest.<br /><span>No open tasks or plans.</span></p>
            <button type="button" className="soft-add" onClick={onAddTask}><Plus size={13} /> Add a reminder</button>
          </div>
        ) : (
          <div className="rail-task-list">
            {openTasks.map((task) => (
              <button type="button" className="rail-task" key={task.id} onClick={() => onToggleTask(task.id)}>
                <span className="task-checkbox"><Circle size={16} /></span>
                <span className="rail-task-content"><strong>{task.title}</strong><small>{task.due}</small></span>
              </button>
            ))}
            {upcomingEvents.map((event) => (
              <div className="rail-event" key={event.id}>
                <span className="event-dot" />
                <span><strong>{event.title}</strong><small>{event.when}</small></span>
              </div>
            ))}
          </div>
        )}
      </section>

      {focusRunning && (
        <section className="focus-mini-card">
          <div className="focus-mini-top"><span className="live-dot" /> FOCUS SESSION</div>
          <strong>{String(Math.floor(focusRemaining / 60)).padStart(2, '0')}:{String(focusRemaining % 60).padStart(2, '0')}</strong>
          <span>One thing at a time.</span>
        </section>
      )}

      <div className="rail-note">
        <LockKeyhole size={14} />
        <span>Your space is private.<br />Actions stay yours to approve.</span>
      </div>
    </aside>
  );
}

function ActionModal({ modal, onClose, onSubmit, onClear }) {
  const initial = modal?.seed ?? {};
  const [text, setText] = useState(initial.text ?? '');
  const [category, setCategory] = useState(initial.category ?? 'preference');
  const [due, setDue] = useState(initial.due ?? 'No date');
  const [date, setDate] = useState(initial.date ?? '');
  const [time, setTime] = useState(initial.time ?? '');
  const [to, setTo] = useState(initial.to ?? '');
  const [subject, setSubject] = useState(initial.subject ?? '');
  const [body, setBody] = useState(initial.body ?? '');
  const textInputRef = useRef(null);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (modal?.type !== 'clear') textInputRef.current?.focus();
  }, [modal?.type]);

  if (!modal) return null;

  const configs = {
    memory: { title: initial.id ? 'Update this memory' : 'Keep a thought close', eyebrow: 'YOUR MEMORY', icon: <Brain size={18} /> },
    task: { title: 'Make a little reminder', eyebrow: 'YOUR LIST', icon: <ListTodo size={18} /> },
    event: { title: 'Make room for it', eyebrow: 'LOCAL PLAN', icon: <CalendarDays size={18} /> },
    draft: { title: 'Start with a draft', eyebrow: 'NOT SENT', icon: <Mail size={18} /> },
  };
  const config = configs[modal.type];

  const submit = (event) => {
    event.preventDefault();
    if (modal.type === 'memory') onSubmit({ type: 'memory', text, category, id: initial.id });
    if (modal.type === 'task') onSubmit({ type: 'task', title: text, due });
    if (modal.type === 'event') onSubmit({ type: 'event', title: text, date, time });
    if (modal.type === 'draft') onSubmit({ type: 'draft', to, subject, body });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading">
          <div className={`modal-icon modal-${modal.type}`}>{config?.icon ?? <Trash2 size={18} />}</div>
          <div className="modal-title-copy">
            <div className="eyebrow">{config?.eyebrow ?? 'WORKSPACE'}</div>
            <h2 id="modal-title">{config?.title ?? 'Clear this workspace?'}</h2>
          </div>
          <IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton>
        </div>

        {modal.type === 'clear' ? (
          <div className="clear-confirm">
            <p>This removes your memories, reminders, plans, drafts, conversation history, feedback, skills, connection requests, MCP profiles, plugin manifests, and learning preferences from this browser. This can’t be undone.</p>
            <div className="modal-actions">
              <button type="button" className="button-secondary" onClick={onClose}>Keep my data</button>
              <button type="button" className="button-danger" onClick={onClear}><Trash2 size={15} /> Clear workspace</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            {modal.type === 'memory' && (
              <>
                <label className="field-label" htmlFor="memory-text">What would you like Julien to remember?</label>
                <textarea ref={textInputRef} id="memory-text" autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="For example: I prefer concise, direct updates." rows={3} required />
                <label className="field-label" htmlFor="memory-category">Keep it under</label>
                <select id="memory-category" value={category} onChange={(event) => setCategory(event.target.value)}>
                  {MEMORY_CATEGORIES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
                </select>
                <p className="modal-helper"><LockKeyhole size={13} /> Saved only in this browser. You can edit or delete it any time.</p>
              </>
            )}
            {modal.type === 'task' && (
              <>
                <label className="field-label" htmlFor="task-text">What do you want to remember to do?</label>
                <input ref={textInputRef} id="task-text" autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="Call the dentist" required />
                <label className="field-label" htmlFor="task-due">When should it be on your mind?</label>
                <select id="task-due" value={due} onChange={(event) => setDue(event.target.value)}>
                  <option>No date</option><option>Today</option><option>Tomorrow</option><option>This week</option><option>Next week</option>
                </select>
                <p className="modal-helper"><Clock3 size={13} /> This is a saved reminder, not a push notification.</p>
              </>
            )}
            {modal.type === 'event' && (
              <>
                <label className="field-label" htmlFor="event-text">What do you want to make time for?</label>
                <input ref={textInputRef} id="event-text" autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="A quiet hour to plan" required />
                <div className="field-row">
                  <div><label className="field-label" htmlFor="event-date">Date</label><input id="event-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
                  <div><label className="field-label" htmlFor="event-time">Time</label><input id="event-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></div>
                </div>
                <p className="modal-helper"><LockKeyhole size={13} /> Saved to Julien’s local plan; no calendar account is connected.</p>
              </>
            )}
            {modal.type === 'draft' && (
              <>
                <div className="field-row">
                  <div><label className="field-label" htmlFor="draft-to">To <span>(optional)</span></label><input ref={textInputRef} id="draft-to" autoFocus value={to} onChange={(event) => setTo(event.target.value)} placeholder="Name or email" /></div>
                  <div><label className="field-label" htmlFor="draft-subject">Subject</label><input id="draft-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="A quick note" required /></div>
                </div>
                <label className="field-label" htmlFor="draft-body">Message</label>
                <textarea id="draft-body" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write your first thought…" rows={6} required />
                <p className="modal-helper"><Mail size={13} /> Drafts stay here. Julien never sends an email.</p>
              </>
            )}
            <div className="modal-actions">
              <button type="button" className="button-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="button-primary">
                {modal.type === 'memory' && <><Check size={15} /> Save memory</>}
                {modal.type === 'task' && <><Plus size={15} /> Add reminder</>}
                {modal.type === 'event' && <><CalendarPlus size={15} /> Save plan</>}
                {modal.type === 'draft' && <><FileText size={15} /> Save draft</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function EvolutionModal({ modal, onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('');
  const [actionType, setActionType] = useState('task');
  const [actionText, setActionText] = useState('');
  const [category, setCategory] = useState('other');

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!modal) return null;

  const submitSkill = (event) => {
    event.preventDefault();
    onSubmit({ type: 'skill', name, trigger, actionType, actionText, category });
  };

  const feedbackChoices = [
    { value: 'concise', title: 'Shorter replies', description: 'Lead with the key point.' },
    { value: 'detailed', title: 'More detail', description: 'Include a little more context.' },
    { value: 'warm', title: 'Warmer tone', description: 'Make it feel friendlier.' },
    { value: 'direct', title: 'More direct', description: 'Skip the extra preamble.' },
    { value: 'other', title: 'Something else', description: 'Just record that this needs work.' },
  ];

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card evolution-modal" role="dialog" aria-modal="true" aria-labelledby="evolution-modal-title">
        <div className="modal-heading">
          <div className={`modal-icon ${modal.type === 'skill' ? 'modal-task' : 'modal-memory'}`}>{modal.type === 'skill' ? <Zap size={18} /> : <TrendingUp size={18} />}</div>
          <div className="modal-title-copy">
            <div className="eyebrow">{modal.type === 'skill' ? 'PERSONAL SKILL' : 'REPLY FEEDBACK'}</div>
            <h2 id="evolution-modal-title">{modal.type === 'skill' ? 'Teach Julien a shortcut' : 'What should I learn from this?'}</h2>
          </div>
          <IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton>
        </div>

        {modal.type === 'feedback' ? (
          <div className="feedback-choice-list">
            <p>Your feedback is a signal, not an instruction. Julien will only turn a repeated pattern into a standing preference after you approve it.</p>
            {feedbackChoices.map((choice) => (
              <button type="button" className="feedback-choice" key={choice.value} onClick={() => onSubmit({ type: 'feedback', ...modal.seed, preference: choice.value })}>
                <span className="feedback-choice-icon"><ThumbsDown size={14} /></span>
                <span><strong>{choice.title}</strong><small>{choice.description}</small></span>
                <ChevronRight size={15} />
              </button>
            ))}
            <button type="button" className="feedback-cancel" onClick={onClose}>Cancel</button>
          </div>
        ) : (
          <form onSubmit={submitSkill}>
            <label className="field-label" htmlFor="skill-name">Name this skill</label>
            <input id="skill-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Weekly reset" required />
            <label className="field-label" htmlFor="skill-trigger">When I say…</label>
            <input id="skill-trigger" value={trigger} onChange={(event) => setTrigger(event.target.value)} placeholder="weekly reset" required />
            <label className="field-label" htmlFor="skill-action">Julien should…</label>
            <select id="skill-action" value={actionType} onChange={(event) => setActionType(event.target.value)}>
              <option value="task">Add a reminder</option><option value="memory">Save a memory</option><option value="focus">Start a focus session</option>
            </select>
            {actionType !== 'focus' && (
              <>
                <label className="field-label" htmlFor="skill-action-text">{actionType === 'task' ? 'Reminder text' : 'Memory to save'}</label>
                <input id="skill-action-text" value={actionText} onChange={(event) => setActionText(event.target.value)} placeholder={actionType === 'task' ? 'Review the week and plan Monday' : 'I do a weekly reset on Sunday'} required />
              </>
            )}
            {actionType === 'memory' && (
              <>
                <label className="field-label" htmlFor="skill-category">Memory category</label>
                <select id="skill-category" value={category} onChange={(event) => setCategory(event.target.value)}>{MEMORY_CATEGORIES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select>
              </>
            )}
            <p className="modal-helper"><LockKeyhole size={13} /> Skills use existing local actions only. Say the trigger or “run {trigger || 'your phrase'}” to use one; no code or external services are run.</p>
            <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button-primary"><Plus size={15} /> Save skill</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

function ModelProfileModal({ initial, existingProfiles, onClose, onSave }) {
  const initialProvider = MODEL_PROVIDERS.find((provider) => provider.id === initial?.providerId) ?? MODEL_PROVIDERS[0];
  const [providerId, setProviderId] = useState(initialProvider.id);
  const [name, setName] = useState(initial?.name ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? initialProvider.baseUrl);
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? '');
  const [apiKeyEnv, setApiKeyEnv] = useState(initial?.apiKeyEnv ?? initialProvider.apiKeyEnv);
  const [enabled, setEnabled] = useState(initial?.enabled !== false);
  const [error, setError] = useState('');
  const provider = MODEL_PROVIDERS.find((item) => item.id === providerId) ?? MODEL_PROVIDERS[0];

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const changeProvider = (nextProviderId) => {
    const nextProvider = MODEL_PROVIDERS.find((item) => item.id === nextProviderId);
    if (!nextProvider) return;
    setProviderId(nextProvider.id);
    setBaseUrl(nextProvider.baseUrl);
    setApiKeyEnv(nextProvider.apiKeyEnv);
    setError('');
  };

  const submit = (event) => {
    event.preventDefault();
    try {
      const existing = existingProfiles.filter((profile) => profile.id !== initial?.id);
      const profile = normalizeModelProfileDraft({
        id: initial?.id,
        name,
        providerId,
        model,
        baseUrl,
        sourceUrl,
        apiKeyEnv: provider.kind === 'api' ? apiKeyEnv : '',
        enabled,
        createdAt: initial?.createdAt,
      }, existing);
      onSave(profile);
    } catch (validationError) {
      setError(validationError.message);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card extension-modal router-profile-modal" role="dialog" aria-modal="true" aria-labelledby="model-profile-modal-title">
        <div className="modal-heading">
          <div className="modal-icon model-router-modal-icon"><Cpu size={18} /></div>
          <div className="modal-title-copy"><div className="eyebrow">MODEL ROUTER · PROFILE</div><h2 id="model-profile-modal-title">{initial ? 'Edit model profile' : 'Add a model profile'}</h2></div>
          <IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="model-provider">Provider type</label>
          <select id="model-provider" value={providerId} onChange={(event) => changeProvider(event.target.value)}>
            {MODEL_PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.kind === 'local' ? 'local' : 'API'}</option>)}
          </select>
          <label className="field-label" htmlFor="model-profile-name">Profile name</label>
          <input id="model-profile-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={provider.kind === 'local' ? 'My local model' : 'Primary API model'} maxLength={80} required />
          <label className="field-label" htmlFor="model-profile-model">Exact model ID</label>
          <input id="model-profile-model" value={model} onChange={(event) => setModel(event.target.value)} placeholder={provider.kind === 'local' ? 'e.g. qwen2.5:7b' : 'e.g. provider-model-id'} maxLength={160} required />
          <label className="field-label" htmlFor="model-profile-source">Model card / repository URL <span>optional · HTTPS only</span></label>
          <input id="model-profile-source" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://huggingface.co/owner/model" autoComplete="off" />
          <label className="field-label" htmlFor="model-profile-endpoint">Base endpoint URL</label>
          <input id="model-profile-endpoint" type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={provider.baseUrl || 'https://api.example.com/v1'} autoComplete="off" required />
          {provider.kind === 'api' ? (
            <>
              <label className="field-label" htmlFor="model-profile-key-env">API-key environment variable name <span>name only · no key value</span></label>
              <input id="model-profile-key-env" value={apiKeyEnv} onChange={(event) => setApiKeyEnv(event.target.value)} placeholder="OPENAI_API_KEY" autoComplete="off" spellCheck="false" />
              <p className="modal-helper"><LockKeyhole size={13} /> Julien does not read this variable or make provider calls. A future trusted runtime must supply the secret value.</p>
            </>
          ) : (
            <p className="modal-helper"><Server size={13} /> Repository links are metadata only—Julien does not download model weights. A trusted agent runtime must load and serve the model; this browser preview will not call localhost or your private network.</p>
          )}
          <label className="extension-switch-row"><span><strong>Profile available to route previews</strong><small>Paused profiles stay saved but are skipped when previewing routes.</small></span><button type="button" role="switch" aria-checked={enabled} className={`toggle ${enabled ? 'on' : ''}`} onClick={() => setEnabled((current) => !current)}><span /></button></label>
          {error && <p className="extension-form-error" role="alert">{error}</p>}
          <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button-primary"><Check size={15} /> Save profile</button></div>
        </form>
      </div>
    </div>
  );
}

function McpServerModal({ initial, existingServers, onClose, onSave }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [transport, setTransport] = useState(initial?.transport ?? 'stdio');
  const [command, setCommand] = useState(initial?.command ?? '');
  const [argsText, setArgsText] = useState(Array.isArray(initial?.args) ? initial.args.join('\n') : '');
  const [envText, setEnvText] = useState(Array.isArray(initial?.envKeys) ? initial.envKeys.join('\n') : '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled !== false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (event) => {
    event.preventDefault();
    try {
      const existing = existingServers.filter((server) => server.id !== initial?.id);
      const server = normalizeMcpServerDraft({
        id: initial?.id,
        name,
        transport,
        command,
        argsText,
        envKeys: envText,
        url,
        enabled,
        createdAt: initial?.createdAt,
      }, existing);
      onSave(server);
    } catch (validationError) {
      setError(validationError.message);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card extension-modal" role="dialog" aria-modal="true" aria-labelledby="mcp-modal-title">
        <div className="modal-heading">
          <div className="modal-icon extension-modal-icon"><Server size={18} /></div>
          <div className="modal-title-copy"><div className="eyebrow">MCP SERVER PROFILE</div><h2 id="mcp-modal-title">{initial ? 'Edit server config' : 'Add an MCP server'}</h2></div>
          <IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="mcp-server-name">Server name</label>
          <input id="mcp-server-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="My tools server" maxLength={80} required />
          <label className="field-label" htmlFor="mcp-transport">Transport</label>
          <select id="mcp-transport" value={transport} onChange={(event) => setTransport(event.target.value)}><option value="stdio">STDIO · desktop host</option><option value="streamable-http">Streamable HTTP · remote</option></select>
          {transport === 'stdio' ? (
            <>
              <label className="field-label" htmlFor="mcp-command">Executable / command</label>
              <input id="mcp-command" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="npx" autoComplete="off" />
              <label className="field-label" htmlFor="mcp-args">Arguments <span>one per line · no shell string</span></label>
              <textarea id="mcp-args" value={argsText} onChange={(event) => setArgsText(event.target.value)} placeholder={'-y\n@vendor/mcp-server'} rows={3} />
              <label className="field-label" htmlFor="mcp-env">Environment variable names <span>names only, never values</span></label>
              <textarea id="mcp-env" value={envText} onChange={(event) => setEnvText(event.target.value)} placeholder={'API_TOKEN\nWORKSPACE_ID'} rows={2} />
            </>
          ) : (
            <>
              <label className="field-label" htmlFor="mcp-url">MCP endpoint URL</label>
              <input id="mcp-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/mcp" autoComplete="off" />
              <p className="modal-helper"><LockKeyhole size={13} /> Use HTTPS for remote hosts. Credentials, query parameters, and URL fragments are rejected.</p>
            </>
          )}
          <label className="extension-switch-row"><span><strong>Include in exported config</strong><small>This saves a profile; it does not start or connect the server.</small></span><button type="button" role="switch" aria-checked={enabled} className={`toggle ${enabled ? 'on' : ''}`} onClick={() => setEnabled((current) => !current)}><span /></button></label>
          {error && <p className="extension-form-error" role="alert">{error}</p>}
          <p className="modal-helper extension-safety-note"><ShieldCheck size={13} /> Julien’s browser build cannot launch STDIO processes or make MCP tool calls. This profile is saved locally for export to a compatible host.</p>
          <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button-primary"><Check size={15} /> Save profile</button></div>
        </form>
      </div>
    </div>
  );
}

function PluginManifestModal({ initial, mcpServers, existingPlugins, onClose, onSave }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [version, setVersion] = useState(initial?.version ?? '1.0.0');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [serverId, setServerId] = useState(initial?.serverId ?? '');
  const [permissions, setPermissions] = useState(initial?.permissions ?? []);
  const [enabled, setEnabled] = useState(initial?.enabled !== false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const togglePermission = (permissionId) => setPermissions((current) => current.includes(permissionId)
    ? current.filter((item) => item !== permissionId)
    : [...current, permissionId]);

  const submit = (event) => {
    event.preventDefault();
    try {
      const existing = existingPlugins.filter((plugin) => plugin.id !== initial?.id);
      const manifest = normalizePluginManifest({
        id: initial?.id,
        name,
        version,
        description,
        serverId,
        permissions,
        enabled,
        createdAt: initial?.createdAt,
      }, mcpServers, existing);
      onSave(manifest);
    } catch (validationError) {
      setError(validationError.message);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card extension-modal plugin-modal" role="dialog" aria-modal="true" aria-labelledby="plugin-modal-title">
        <div className="modal-heading">
          <div className="modal-icon plugin-modal-icon"><Puzzle size={18} /></div>
          <div className="modal-title-copy"><div className="eyebrow">DECLARATIVE PLUGIN</div><h2 id="plugin-modal-title">{initial ? 'Edit plugin manifest' : 'Create a plugin manifest'}</h2></div>
          <IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="plugin-name">Plugin name</label>
          <input id="plugin-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Issue helper" maxLength={80} required />
          <div className="field-row">
            <div><label className="field-label" htmlFor="plugin-version">Version</label><input id="plugin-version" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="1.0.0" required /></div>
            <div><label className="field-label" htmlFor="plugin-server">MCP server <span>optional</span></label><select id="plugin-server" value={serverId} onChange={(event) => setServerId(event.target.value)}><option value="">Not linked</option>{mcpServers.map((server) => <option value={server.id} key={server.id}>{server.name}</option>)}</select></div>
          </div>
          <label className="field-label" htmlFor="plugin-description">What does it do?</label>
          <textarea id="plugin-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the plugin’s purpose. No code is run from this manifest." rows={3} maxLength={400} />
          <div className="permission-heading"><strong>REQUESTED PERMISSIONS</strong><span>Metadata only · host approval required</span></div>
          <div className="plugin-permission-list">{PLUGIN_PERMISSION_OPTIONS.map((permission) => <label className="plugin-permission-option" key={permission.id}><input type="checkbox" checked={permissions.includes(permission.id)} onChange={() => togglePermission(permission.id)} /><span><strong>{permission.label}</strong><small>{permission.risk}</small></span></label>)}</div>
          <label className="extension-switch-row"><span><strong>Include in plugin registry export</strong><small>Does not activate or execute a plugin.</small></span><button type="button" role="switch" aria-checked={enabled} className={`toggle ${enabled ? 'on' : ''}`} onClick={() => setEnabled((current) => !current)}><span /></button></label>
          {error && <p className="extension-form-error" role="alert">{error}</p>}
          <p className="modal-helper extension-safety-note"><ShieldCheck size={13} /> Plugin manifests contain descriptive metadata only. Julien does not load JavaScript, binaries, or arbitrary code.</p>
          <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button-primary"><Puzzle size={14} /> Save manifest</button></div>
        </form>
      </div>
    </div>
  );
}

function GithubSkillModal({ onClose, onImported }) {
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [manifestPath, setManifestPath] = useState('julien-skill.json');
  const [ref, setRef] = useState('main');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const location = parseGithubSkillLocation(repositoryUrl, manifestPath, ref);
      const result = await fetchGithubSkillPackage(location);
      onImported(result);
      onClose();
    } catch (importError) {
      setError(importError.message || 'Could not import this GitHub skill.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className="modal-card skill-github-modal" role="dialog" aria-modal="true" aria-labelledby="github-skill-title">
        <div className="modal-heading"><div className="modal-icon github-modal-icon"><Github size={18} /></div><div className="modal-title-copy"><div className="eyebrow">PUBLIC GITHUB SKILL</div><h2 id="github-skill-title">Connect a skill from GitHub</h2></div><IconButton label="Close dialog" onClick={onClose} disabled={busy}><X size={18} /></IconButton></div>
        <p className="github-import-intro">Import a public <code>julien-skill/v1</code> JSON manifest. Julien fetches it from GitHub’s public API without a token, validates its action, and stores a local copy.</p>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="github-repository-url">GitHub repository or file URL</label>
          <input id="github-repository-url" autoFocus value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="https://github.com/owner/repo" required />
          <div className="field-row">
            <div><label className="field-label" htmlFor="github-manifest-path">Manifest path</label><input id="github-manifest-path" value={manifestPath} onChange={(event) => setManifestPath(event.target.value)} placeholder="skills/my-skill.json" /></div>
            <div><label className="field-label" htmlFor="github-manifest-ref">Branch / ref</label><input id="github-manifest-ref" value={ref} onChange={(event) => setRef(event.target.value)} placeholder="main" /></div>
          </div>
          <p className="github-import-example">You can also paste a direct GitHub <code>/blob/ref/path.json</code> or raw file URL. The file must be public and under 64 KB.</p>
          <div className="github-safety-panel"><ShieldCheck size={14} /><span>Only declarative task, memory, and focus actions are installable. Scripts, dependencies, and executable code are ignored. GitHub skills run only through Julien’s existing local actions.</span></div>
          {error && <p className="extension-form-error" role="alert">{error}</p>}
          <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="button-primary" disabled={busy}>{busy ? <RefreshCw size={14} className="spin-icon" /> : <Github size={15} />}{busy ? 'Checking GitHub…' : 'Import skill'}</button></div>
        </form>
      </div>
    </div>
  );
}

function SkillUpdateModal({ skill, update, onClose, onApply }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!skill || !update) return null;
  const before = describeSkillAction(skill);
  const after = describeSkillAction({ actionType: update.manifest.action.type, actionText: update.manifest.action.text });

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card skill-update-modal" role="dialog" aria-modal="true" aria-labelledby="skill-update-title">
        <div className="modal-heading"><div className="modal-icon github-modal-icon"><RefreshCw size={17} /></div><div className="modal-title-copy"><div className="eyebrow">GITHUB UPDATE · REVIEW REQUIRED</div><h2 id="skill-update-title">Review {skill.name}</h2></div><IconButton label="Close update review" onClick={onClose}><X size={18} /></IconButton></div>
        <p className="skill-update-intro">A newer manifest was found in <strong>{update.source.repoUrl}</strong>. It will not replace your installed skill until you approve this change.</p>
        <div className="skill-update-comparison">
          <article><span>INSTALLED · v{skill.version || '1.0.0'}</span><strong>“{skill.trigger}”</strong><p>{before}</p></article>
          <div className="skill-update-arrow"><ChevronRight size={15} /></div>
          <article className="skill-update-new"><span>GITHUB · v{update.manifest.version}</span><strong>“{update.manifest.trigger}”</strong><p>{after}</p></article>
        </div>
        <p className="modal-helper"><ShieldCheck size={13} /> Only this validated local action changes. No code is downloaded or executed.</p>
        <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>Keep current</button><button type="button" className="button-primary" onClick={onApply}><Check size={14} /> Approve update</button></div>
      </div>
    </div>
  );
}

function IntegrationModal({ integration, requested, onRequest, onClose }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!integration) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card integration-modal" role="dialog" aria-modal="true" aria-labelledby="integration-modal-title">
        <div className="modal-heading">
          <div className="integration-mark integration-mark-large" style={{ '--app-color': integration.color, '--app-surface': integration.surface }}>{integration.brand}</div>
          <div className="modal-title-copy"><div className="eyebrow">{integration.type.toUpperCase()} · {integration.method.toUpperCase()}</div><h2 id="integration-modal-title">Set up {integration.name}</h2></div>
          <IconButton label="Close connection details" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <p className="integration-modal-description">{integration.description}</p>
        <div className="connection-not-ready"><span className="connection-warning-icon"><LockKeyhole size={15} /></span><div><strong>Live authorization is not configured yet</strong><p>This build has no OAuth server or app credentials. Saving a request below does not connect the account or send any data.</p></div></div>
        <div className="integration-method-row"><span>Connection method</span><strong>{integration.method}</strong></div>
        <div className="scope-section"><div className="scope-heading">POTENTIAL PERMISSIONS <span>REVIEW BEFORE CONNECTING</span></div><ul>{integration.scopes.map((scope) => <li key={scope}><Check size={13} />{scope}</li>)}</ul></div>
        <p className="modal-helper"><ShieldCheck size={13} /> Julien will never ask you to paste a password or API secret into this local demo.</p>
        <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>Close</button><button type="button" className={requested ? 'button-secondary request-remove-button' : 'button-primary'} onClick={() => onRequest(integration.id)}>{requested ? <><X size={14} /> Remove setup request</> : <><Plus size={15} /> Add to setup list</>}</button></div>
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('chat');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loadedChatState] = useState(() => loadChatState());
  const [conversations, setConversations] = useState(() => loadedChatState.conversations);
  const [activeConversationId, setActiveConversationId] = useState(() => loadedChatState.activeId);
  const [memories, setMemories] = useState(() => readStorage(STORAGE_KEYS.memories, []));
  const [tasks, setTasks] = useState(() => readStorage(STORAGE_KEYS.tasks, []));
  const [events, setEvents] = useState(() => readStorage(STORAGE_KEYS.events, []));
  const [drafts, setDrafts] = useState(() => readStorage(STORAGE_KEYS.drafts, []));
  const [activity, setActivity] = useState(() => readStorage(STORAGE_KEYS.activity, []));
  const [messages, setMessages] = useState(() => loadedChatState.messages);
  const [learningProfile, setLearningProfile] = useState(() => {
    const saved = readStorage(STORAGE_KEYS.learningProfile, {});
    return {
      ...LEARNING_DEFAULTS,
      ...saved,
      appliedSignalCounts: saved.appliedSignalCounts ?? {},
      dismissedSignalCounts: saved.dismissedSignalCounts ?? {},
    };
  });
  const [skills, setSkills] = useState(() => readStorage(STORAGE_KEYS.skills, []));
  const [skillPageTab, setSkillPageTab] = useState('library');
  const [skillSearch, setSkillSearch] = useState('');
  const [skillCategory, setSkillCategory] = useState('all');
  const [githubSkillModal, setGithubSkillModal] = useState(false);
  const [syncingSkillId, setSyncingSkillId] = useState('');
  const [pendingSkillUpdate, setPendingSkillUpdate] = useState(null);
  const [connectionRequests, setConnectionRequests] = useState(() => readStorage(STORAGE_KEYS.connectionRequests, []));
  const [mcpServers, setMcpServers] = useState(() => readStorage(STORAGE_KEYS.mcpServers, []));
  const [pluginManifests, setPluginManifests] = useState(() => readStorage(STORAGE_KEYS.pluginManifests, []));
  const [loadedModelRouterState] = useState(() => loadModelRouterState());
  const [modelProfiles, setModelProfiles] = useState(() => loadedModelRouterState.profiles);
  const [routerConfig, setRouterConfig] = useState(() => loadedModelRouterState.config);
  const [modelProfileModal, setModelProfileModal] = useState(null);
  const [mcpServerModal, setMcpServerModal] = useState(null);
  const [pluginManifestModal, setPluginManifestModal] = useState(null);
  const [integrationQuery, setIntegrationQuery] = useState('');
  const [integrationGroup, setIntegrationGroup] = useState('all');
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [settings, setSettings] = useState(() => readStorage(STORAGE_KEYS.settings, { autoSpeak: false }));
  const [draftText, setDraftText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [modal, setModal] = useState(null);
  const [evolutionModal, setEvolutionModal] = useState(null);
  const [toast, setToast] = useState('');
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryFilter, setMemoryFilter] = useState('all');
  const [focusRemaining, setFocusRemaining] = useState(0);
  const [focusRunning, setFocusRunning] = useState(false);
  const toastTimer = useRef(null);
  const recognitionRef = useRef(null);
  const threadRef = useRef(null);
  const pendingResponseRef = useRef(null);
  const mcpImportRef = useRef(null);
  const pluginImportRef = useRef(null);
  const modelRouterImportRef = useRef(null);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0];
  const recentConversations = useMemo(() => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt), [conversations]);

  useEffect(() => persist(STORAGE_KEYS.conversations, conversations), [conversations]);
  useEffect(() => persist(STORAGE_KEYS.activeConversation, activeConversationId), [activeConversationId]);
  useEffect(() => persist(STORAGE_KEYS.memories, memories), [memories]);
  useEffect(() => persist(STORAGE_KEYS.tasks, tasks), [tasks]);
  useEffect(() => persist(STORAGE_KEYS.events, events), [events]);
  useEffect(() => persist(STORAGE_KEYS.drafts, drafts), [drafts]);
  useEffect(() => persist(STORAGE_KEYS.activity, activity), [activity]);
  useEffect(() => persist(STORAGE_KEYS.messages, messages), [messages]);
  useEffect(() => persist(STORAGE_KEYS.learningProfile, learningProfile), [learningProfile]);
  useEffect(() => persist(STORAGE_KEYS.skills, skills), [skills]);
  useEffect(() => persist(STORAGE_KEYS.connectionRequests, connectionRequests), [connectionRequests]);
  useEffect(() => persist(STORAGE_KEYS.mcpServers, mcpServers), [mcpServers]);
  useEffect(() => persist(STORAGE_KEYS.pluginManifests, pluginManifests), [pluginManifests]);
  useEffect(() => persist(STORAGE_KEYS.modelProfiles, modelProfiles), [modelProfiles]);
  useEffect(() => persist(STORAGE_KEYS.modelRouterConfig, routerConfig), [routerConfig]);
  useEffect(() => persist(STORAGE_KEYS.settings, settings), [settings]);

  useEffect(() => {
    setMessages((current) => {
      let verifiedAny = false;
      const next = current.map((message) => {
        if (!message.action || ['verified', 'proposed'].includes(message.action.outcome)) return message;
        if (!isActionVerifiedInState(message.action, { memories, tasks, events, drafts, focusRunning, focusRemaining })) return message;
        verifiedAny = true;
        return { ...message, action: { ...message.action, outcome: 'verified', verifiedAt: Date.now(), verification: 'local-browser-state' } };
      });
      return verifiedAny ? next : current;
    });
  }, [memories, tasks, events, drafts, focusRunning, focusRemaining, messages]);

  useEffect(() => {
    setConversations((current) => {
      if (!current.some((conversation) => conversation.id === activeConversationId)) return current;
      const title = getConversationTitle(messages);
      return current.map((conversation) => conversation.id === activeConversationId
        ? { ...conversation, title, messages, updatedAt: Date.now() }
        : conversation);
    });
  }, [messages, activeConversationId]);

  useEffect(() => {
    if (messages.length > 1 && threadRef.current) {
      threadRef.current.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isThinking]);

  useEffect(() => {
    if (!focusRunning) return undefined;
    const ticker = window.setInterval(() => setFocusRemaining((remaining) => Math.max(0, remaining - 1)), 1000);
    return () => window.clearInterval(ticker);
  }, [focusRunning]);

  useEffect(() => {
    if (focusRunning && focusRemaining === 0) {
      setFocusRunning(false);
      showToast('Focus session complete. Take a breath.');
    }
  }, [focusRemaining, focusRunning]);

  useEffect(() => () => {
    window.clearTimeout(toastTimer.current);
    window.clearTimeout(pendingResponseRef.current);
    recognitionRef.current?.stop?.();
    window.speechSynthesis?.cancel?.();
  }, []);

  const openTasks = useMemo(() => tasks.filter((task) => !task.done), [tasks]);
  const filteredMemories = useMemo(() => memories.filter((memory) => {
    const matchesFilter = memoryFilter === 'all' || memory.category === memoryFilter;
    const matchesQuery = !memoryQuery || memory.text.toLowerCase().includes(memoryQuery.toLowerCase());
    return matchesFilter && matchesQuery;
  }), [memories, memoryFilter, memoryQuery]);
  const filteredIntegrations = useMemo(() => INTEGRATIONS.filter((integration) => {
    const matchesGroup = integrationGroup === 'all' || integration.group === integrationGroup;
    const query = integrationQuery.trim().toLowerCase();
    const matchesQuery = !query || `${integration.name} ${integration.type} ${integration.description}`.toLowerCase().includes(query);
    return matchesGroup && matchesQuery;
  }), [integrationGroup, integrationQuery]);
  const filteredSkills = useMemo(() => {
    const query = skillSearch.trim().toLowerCase();
    return skills.filter((skill) => !query || `${skill.name} ${skill.trigger} ${skill.description || ''} ${skill.source?.repoUrl || ''}`.toLowerCase().includes(query));
  }, [skills, skillSearch]);
  const filteredMarketplaceSkills = useMemo(() => {
    const query = skillSearch.trim().toLowerCase();
    return MARKETPLACE_SKILLS.filter((skill) => {
      const matchesCategory = skillCategory === 'all' || skill.category === skillCategory;
      const matchesQuery = !query || `${skill.name} ${skill.description} ${skill.trigger} ${(skill.tags || []).join(' ')}`.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [skillCategory, skillSearch]);
  const feedbackItems = useMemo(() => conversations.flatMap((conversation) => {
    const threadMessages = conversation.id === activeConversationId ? messages : conversation.messages;
    return threadMessages.filter((message) => message.feedback).map((message) => ({ ...message.feedback, messageId: message.id, conversationId: conversation.id }));
  }), [conversations, activeConversationId, messages]);
  const learningProposals = useMemo(() => LEARNING_CHOICES.map((choice) => {
    const count = feedbackItems.filter((item) => item.rating === 'needs_work' && item.preference === choice.value).length;
    const appliedCount = learningProfile.appliedSignalCounts?.[choice.value] ?? 0;
    const dismissedCount = learningProfile.dismissedSignalCounts?.[choice.value] ?? 0;
    return { ...choice, count, appliedCount, dismissedCount };
  }).filter((proposal) => proposal.count >= 2
    && proposal.count > proposal.appliedCount
    && proposal.count > proposal.dismissedCount
    && learningProfile[proposal.kind] !== proposal.value), [feedbackItems, learningProfile]);
  const helpfulCount = feedbackItems.filter((item) => item.rating === 'helpful').length;
  const needsWorkCount = feedbackItems.filter((item) => item.rating === 'needs_work').length;
  const classifierHistory = useMemo(() => conversations.flatMap((conversation) => {
    const threadMessages = conversation.id === activeConversationId ? messages : conversation.messages;
    return threadMessages.filter((message) => message.role === 'user' && message.classification);
  }).sort((a, b) => b.createdAt - a.createdAt), [conversations, activeConversationId, messages]);
  const latestClassification = classifierHistory[0]?.classification ?? null;
  const routedActionCount = classifierHistory.filter((message) => message.classification.highConfidence && ['save_memory', 'forget_memory', 'task', 'calendar', 'draft', 'focus', 'skill'].includes(message.classification.intent)).length;
  const averageClassifierMs = classifierHistory.length
    ? classifierHistory.reduce((sum, message) => sum + message.classification.elapsedMs, 0) / classifierHistory.length
    : 0;

  function showToast(message) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2800);
  }

  function logActivity(type, label) {
    const item = { id: makeId(), type, label, createdAt: Date.now() };
    setActivity((current) => [item, ...current].slice(0, 30));
  }

  function createMemory(text, category = 'other') {
    const item = { id: makeId(), text: text.trim(), category, createdAt: Date.now() };
    setMemories((current) => [item, ...current]);
    logActivity('memory', `Remembered: ${item.text}`);
    return item;
  }

  function createTask(title, due = 'No date') {
    const item = { id: makeId(), title: title.trim(), due, done: false, createdAt: Date.now() };
    setTasks((current) => [item, ...current]);
    logActivity('task', `Added reminder: ${item.title}`);
    return item;
  }

  function createEvent(title, date = '', time = '') {
    let when = date ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`)) : 'Unscheduled';
    if (time) {
      const [hours, minutes] = time.split(':').map(Number);
      const value = new Date();
      value.setHours(hours, minutes, 0, 0);
      when += ` · ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(value)}`;
    }
    const item = { id: makeId(), title: title.trim(), date, time, when, createdAt: Date.now() };
    setEvents((current) => [item, ...current]);
    logActivity('event', `Planned: ${item.title}`);
    return item;
  }

  function createDraft(to, subject, body) {
    const item = { id: makeId(), to: to.trim(), subject: subject.trim(), body: body.trim(), createdAt: Date.now() };
    setDrafts((current) => [item, ...current]);
    logActivity('draft', `Prepared a draft: ${item.subject}`);
    return item;
  }

  function navigate(tab) {
    setActiveTab(tab);
    setMobileNavOpen(false);
  }

  function startNewConversation() {
    window.clearTimeout(pendingResponseRef.current);
    pendingResponseRef.current = null;
    setIsThinking(false);
    recognitionRef.current?.stop?.();
    setIsListening(false);
    const conversation = { id: makeId(), title: 'New conversation', messages: [makeWelcomeMessage()], updatedAt: Date.now() };
    setConversations((current) => [conversation, ...current]);
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages);
    setDraftText('');
    navigate('chat');
  }

  function selectConversation(id) {
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation) return;
    window.clearTimeout(pendingResponseRef.current);
    pendingResponseRef.current = null;
    setIsThinking(false);
    recognitionRef.current?.stop?.();
    setIsListening(false);
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages.length ? conversation.messages : [makeWelcomeMessage()]);
    setDraftText('');
    navigate('chat');
  }

  function deleteConversation(id) {
    const remaining = conversations.filter((conversation) => conversation.id !== id);
    if (remaining.length === conversations.length) return;
    window.clearTimeout(pendingResponseRef.current);
    pendingResponseRef.current = null;
    setIsThinking(false);
    if (id === activeConversationId) {
      if (remaining.length) {
        setActiveConversationId(remaining[0].id);
        setMessages(remaining[0].messages.length ? remaining[0].messages : [makeWelcomeMessage()]);
      } else {
        const freshConversation = { id: makeId(), title: 'New conversation', messages: [makeWelcomeMessage()], updatedAt: Date.now() };
        remaining.push(freshConversation);
        setActiveConversationId(freshConversation.id);
        setMessages(freshConversation.messages);
      }
    }
    setConversations(remaining);
    showToast('Conversation removed.');
  }

  function openModal(type, seed = {}) {
    setModal({ type, seed });
  }

  function handleModalSubmit(payload) {
    if (payload.type === 'memory') {
      if (!payload.text.trim()) return;
      if (payload.id) {
        const updatedText = payload.text.trim();
        setMemories((current) => current.map((item) => item.id === payload.id ? { ...item, text: updatedText, category: payload.category, updatedAt: Date.now() } : item));
        logActivity('memory', `Updated memory: ${updatedText}`);
        showToast('Memory updated on this device.');
      } else {
        createMemory(payload.text, payload.category);
        showToast('Saved to your memory on this device.');
      }
    }
    if (payload.type === 'task') {
      if (!payload.title.trim()) return;
      createTask(payload.title, payload.due);
      showToast('Reminder added to your list.');
    }
    if (payload.type === 'event') {
      if (!payload.title.trim()) return;
      createEvent(payload.title, payload.date, payload.time);
      showToast('Added to your local plan.');
    }
    if (payload.type === 'draft') {
      if (!payload.subject.trim() || !payload.body.trim()) return;
      createDraft(payload.to, payload.subject, payload.body);
      showToast('Draft saved here. It has not been sent.');
    }
    setModal(null);
  }

  function handleClearWorkspace() {
    window.clearTimeout(pendingResponseRef.current);
    pendingResponseRef.current = null;
    setIsThinking(false);
    setMemories([]);
    setTasks([]);
    setEvents([]);
    setDrafts([]);
    setActivity([]);
    setSkills([]);
    setConnectionRequests([]);
    setMcpServers([]);
    setPluginManifests([]);
    setModelProfiles([]);
    setRouterConfig(defaultRouterConfig());
    persist(STORAGE_KEYS.modelPresetDismissed, true);
    setModelProfileModal(null);
    setSelectedIntegration(null);
    setMcpServerModal(null);
    setPluginManifestModal(null);
    setGithubSkillModal(false);
    setPendingSkillUpdate(null);
    setLearningProfile({ ...LEARNING_DEFAULTS });
    setEvolutionModal(null);
    const freshConversation = { id: makeId(), title: 'New conversation', messages: [makeWelcomeMessage()], updatedAt: Date.now() };
    setConversations([freshConversation]);
    setActiveConversationId(freshConversation.id);
    setMessages(freshConversation.messages);
    setSettings({ autoSpeak: false });
    setFocusRunning(false);
    setFocusRemaining(0);
    setModal(null);
    showToast('Your local workspace has been cleared.');
  }

  function toggleTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    setTasks((current) => current.map((item) => item.id === id ? { ...item, done: !item.done } : item));
    logActivity(task.done ? 'task' : 'complete', task.done ? `Reopened: ${task.title}` : `Completed: ${task.title}`);
    showToast(task.done ? 'Reminder reopened.' : 'Nicely done. Marked complete.');
  }

  function deleteMemory(id) {
    const item = memories.find((memory) => memory.id === id);
    setMemories((current) => current.filter((memory) => memory.id !== id));
    if (item) logActivity('memory', `Forgot: ${item.text}`);
    showToast('Memory removed.');
  }

  function deleteTask(id) {
    const item = tasks.find((task) => task.id === id);
    setTasks((current) => current.filter((task) => task.id !== id));
    if (item) logActivity('task', `Removed reminder: ${item.title}`);
    showToast('Reminder removed.');
  }

  function deleteEvent(id) {
    const item = events.find((event) => event.id === id);
    setEvents((current) => current.filter((event) => event.id !== id));
    if (item) logActivity('event', `Removed plan: ${item.title}`);
    showToast('Planning block removed.');
  }

  function deleteDraft(id) {
    const item = drafts.find((draft) => draft.id === id);
    setDrafts((current) => current.filter((draft) => draft.id !== id));
    if (item) logActivity('draft', `Removed draft: ${item.subject}`);
    showToast('Draft removed.');
  }

  function updateConversationMessage(conversationId, messageId, feedback) {
    setConversations((current) => current.map((conversation) => conversation.id === conversationId
      ? { ...conversation, messages: conversation.messages.map((message) => message.id === messageId ? { ...message, feedback } : message), updatedAt: Date.now() }
      : conversation));
    if (conversationId === activeConversationId) {
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, feedback } : message));
    }
  }

  function handleMessageFeedback(conversationId, messageId, rating) {
    if (rating === 'needs_work') {
      setEvolutionModal({ type: 'feedback', seed: { conversationId, messageId } });
      return;
    }
    const feedback = feedbackItems.find((item) => item.conversationId === conversationId && item.messageId === messageId);
    const alreadyHelpful = feedback?.rating === 'helpful';
    updateConversationMessage(conversationId, messageId, alreadyHelpful ? null : { rating: 'helpful', createdAt: Date.now() });
    logActivity('learning', alreadyHelpful ? 'Removed reply feedback' : 'Marked a reply helpful');
    showToast(alreadyHelpful ? 'Feedback removed.' : 'Thanks. I’ll keep that signal in mind.');
  }

  function handleEvolutionSubmit(payload) {
    if (payload.type === 'feedback') {
      const choice = LEARNING_CHOICES.find((item) => item.value === payload.preference);
      updateConversationMessage(payload.conversationId, payload.messageId, {
        rating: 'needs_work', preference: payload.preference, createdAt: Date.now(),
      });
      logActivity('learning', choice ? `Feedback: ${choice.label.toLowerCase()}` : 'Marked a reply for review');
      setEvolutionModal(null);
      showToast('Feedback saved. Similar signals can become a proposal for you to approve.');
      return;
    }
    if (payload.type === 'skill') {
      if (!payload.name.trim() || !payload.trigger.trim()) return;
      const trigger = normalizeSkillTriggerText(payload.trigger);
      const triggerConflict = skills.find((item) => normalizeSkillTriggerText(item.trigger) === trigger);
      if (triggerConflict) {
        showToast(`The trigger “${trigger}” is already used by ${triggerConflict.name}.`);
        return;
      }
      const skill = {
        id: makeId(),
        name: payload.name.trim(),
        trigger,
        actionType: payload.actionType,
        actionText: payload.actionText.trim(),
        category: payload.category,
        enabled: true,
        createdAt: Date.now(),
      };
      setSkills((current) => [skill, ...current]);
      logActivity('skill', `Added personal skill: ${skill.name}`);
      setEvolutionModal(null);
      showToast('Skill saved. It will only run when you use its trigger.');
    }
  }

  function approveLearning(proposal) {
    setLearningProfile((current) => ({
      ...current,
      [proposal.kind]: proposal.value,
      appliedSignalCounts: { ...current.appliedSignalCounts, [proposal.value]: proposal.count },
      updatedAt: Date.now(),
    }));
    logActivity('learning', `Approved learning: ${proposal.label.toLowerCase()}`);
    showToast('Preference approved. Julien will use it in supported replies.');
  }

  function dismissLearning(proposal) {
    setLearningProfile((current) => ({
      ...current,
      dismissedSignalCounts: { ...current.dismissedSignalCounts, [proposal.value]: proposal.count },
    }));
    showToast('Suggestion dismissed.');
  }

  function updateLearningPreference(kind, value) {
    setLearningProfile((current) => ({ ...current, [kind]: value, updatedAt: Date.now() }));
    logActivity('learning', `Changed ${kind === 'brevity' ? 'reply length' : 'tone'} to ${value}`);
    showToast('Julien’s preference was updated.');
  }

  function installSkillPackage(rawManifest, source) {
    let manifest;
    try {
      manifest = normalizeSkillManifest(rawManifest);
    } catch (error) {
      showToast(error.message || 'This skill package is not valid.');
      return false;
    }
    const existing = skills.find((skill) => normalizeSkillTriggerText(skill.trigger) === manifest.trigger);
    if (existing) {
      if (source.type === 'marketplace' && existing.source?.packageId === manifest.id) showToast(`${manifest.name} is already in your library.`);
      else showToast(`The trigger “${manifest.trigger}” is already used by ${existing.name}. Change one trigger before installing.`);
      setSkillPageTab('library');
      return false;
    }
    const skill = installedSkillFromManifest(manifest, { installedId: makeId(), source, enabled: true });
    setSkills((current) => [skill, ...current]);
    setSkillPageTab('library');
    logActivity('skill', `Installed skill: ${skill.name}`);
    showToast(`${skill.name} installed. It runs only when you use its exact trigger.`);
    return true;
  }

  function handleGithubSkillImport(result) {
    installSkillPackage(result.manifest, result.source);
  }

  function exportSkillManifest(skill) {
    const manifest = skillToManifest(skill);
    downloadJsonFile(`${manifest.id}.json`, manifest);
    showToast(`${skill.name} manifest exported. You can publish this JSON file in a public GitHub repository.`);
  }

  async function checkSkillForUpdates(skill) {
    if (skill.source?.type !== 'github') return;
    setSyncingSkillId(skill.id);
    try {
      const location = parseGithubSkillLocation(skill.source.repoUrl, skill.source.path, skill.source.ref);
      const result = await fetchGithubSkillPackage(location);
      if (result.source.sha && result.source.sha === skill.source.sha) {
        setSkills((current) => current.map((item) => item.id === skill.id ? { ...item, source: result.source } : item));
        showToast(`${skill.name} is up to date with GitHub.`);
      } else {
        setPendingSkillUpdate({ skillId: skill.id, manifest: result.manifest, source: result.source });
      }
    } catch (error) {
      showToast(error.message || 'Could not check this GitHub skill.');
    } finally {
      setSyncingSkillId('');
    }
  }

  function approveSkillUpdate() {
    if (!pendingSkillUpdate) return;
    const currentSkill = skills.find((item) => item.id === pendingSkillUpdate.skillId);
    if (!currentSkill) {
      setPendingSkillUpdate(null);
      return;
    }
    const manifest = normalizeSkillManifest(pendingSkillUpdate.manifest);
    const conflict = skills.find((item) => item.id !== currentSkill.id && normalizeSkillTriggerText(item.trigger) === manifest.trigger);
    if (conflict) {
      showToast(`Update not applied: “${manifest.trigger}” is already used by ${conflict.name}.`);
      return;
    }
    const replacement = installedSkillFromManifest(manifest, { installedId: currentSkill.id, source: pendingSkillUpdate.source, enabled: currentSkill.enabled });
    replacement.createdAt = currentSkill.createdAt;
    setSkills((current) => current.map((item) => item.id === currentSkill.id ? replacement : item));
    logActivity('skill', `Updated GitHub skill: ${manifest.name}`);
    setPendingSkillUpdate(null);
    showToast(`${manifest.name} updated after your approval.`);
  }

  function toggleSkill(id) {
    setSkills((current) => current.map((skill) => skill.id === id ? { ...skill, enabled: !skill.enabled } : skill));
    const skill = skills.find((item) => item.id === id);
    if (skill) showToast(skill.enabled ? 'Skill paused.' : 'Skill enabled.');
  }

  function deleteSkill(id) {
    const skill = skills.find((item) => item.id === id);
    setSkills((current) => current.filter((item) => item.id !== id));
    if (skill) logActivity('skill', `Removed personal skill: ${skill.name}`);
    showToast('Skill removed.');
  }

  function toggleConnectionRequest(id) {
    const integration = INTEGRATIONS.find((item) => item.id === id);
    const alreadyRequested = connectionRequests.some((item) => item.id === id);
    setConnectionRequests((current) => alreadyRequested
      ? current.filter((item) => item.id !== id)
      : [{ id, requestedAt: Date.now() }, ...current]);
    setSelectedIntegration(null);
    if (integration) showToast(alreadyRequested ? 'Setup request removed.' : `${integration.name} added to your local setup list. Not connected yet.`);
  }

  function saveMcpServer(server) {
    setMcpServers((current) => current.some((item) => item.id === server.id)
      ? current.map((item) => item.id === server.id ? server : item)
      : [server, ...current]);
    setMcpServerModal(null);
    showToast('MCP server profile saved locally. It is not connected yet.');
  }

  function deleteMcpServer(id) {
    const server = mcpServers.find((item) => item.id === id);
    setMcpServers((current) => current.filter((item) => item.id !== id));
    setPluginManifests((current) => current.map((plugin) => plugin.serverId === id ? { ...plugin, serverId: '' } : plugin));
    showToast(server ? `${server.name} profile removed.` : 'MCP profile removed.');
  }

  function toggleMcpServer(id) {
    setMcpServers((current) => current.map((server) => server.id === id ? { ...server, enabled: server.enabled === false } : server));
  }

  function savePluginManifest(manifest) {
    setPluginManifests((current) => current.some((plugin) => plugin.id === manifest.id)
      ? current.map((plugin) => plugin.id === manifest.id ? manifest : plugin)
      : [manifest, ...current]);
    setPluginManifestModal(null);
    showToast('Plugin manifest saved locally. No plugin code was loaded.');
  }

  function togglePluginManifest(id) {
    setPluginManifests((current) => current.map((plugin) => plugin.id === id ? { ...plugin, enabled: plugin.enabled === false } : plugin));
  }

  function deletePluginManifest(id) {
    const plugin = pluginManifests.find((item) => item.id === id);
    setPluginManifests((current) => current.filter((item) => item.id !== id));
    showToast(plugin ? `${plugin.name} manifest removed.` : 'Plugin manifest removed.');
  }

  function saveModelProfile(profile) {
    const previous = modelProfiles.find((item) => item.id === profile.id);
    const hasQwenAfterSave = modelProfiles.some((item) => item.id !== profile.id && item.kind === 'local' && item.model === QWEN_LOCAL_MODEL_PRESET.model)
      || (profile.kind === 'local' && profile.model === QWEN_LOCAL_MODEL_PRESET.model);
    if (hasQwenAfterSave) persist(STORAGE_KEYS.modelPresetDismissed, false);
    else if (previous?.kind === 'local' && previous.model === QWEN_LOCAL_MODEL_PRESET.model) persist(STORAGE_KEYS.modelPresetDismissed, true);
    setModelProfiles((current) => current.some((item) => item.id === profile.id)
      ? current.map((item) => item.id === profile.id ? profile : item)
      : [profile, ...current]);
    setModelProfileModal(null);
    showToast('Model profile saved locally. No model was contacted.');
  }

  function toggleModelProfile(id) {
    setModelProfiles((current) => current.map((profile) => profile.id === id ? { ...profile, enabled: profile.enabled === false } : profile));
  }

  function addQwenModelPreset() {
    if (modelProfiles.some((profile) => profile.kind === 'local' && profile.model === QWEN_LOCAL_MODEL_PRESET.model)) {
      showToast('The Qwen local model profile is already in your router.');
      return;
    }
    const profile = makeQwenLocalModelProfileDraft(modelProfiles);
    const nextProfiles = [profile, ...modelProfiles];
    setModelProfiles(nextProfiles);
    persist(STORAGE_KEYS.modelPresetDismissed, false);
    setRouterConfig((current) => assignProfileToUnassignedRoutes(current, profile.id, nextProfiles));
    showToast('Qwen added as the primary target for unassigned routes. A trusted backend must load and serve the model.');
  }

  function deleteModelProfile(id) {
    const profile = modelProfiles.find((item) => item.id === id);
    const otherQwenProfileExists = modelProfiles.some((item) => item.id !== id && item.kind === 'local' && item.model === QWEN_LOCAL_MODEL_PRESET.model);
    if (profile?.kind === 'local' && profile.model === QWEN_LOCAL_MODEL_PRESET.model && !otherQwenProfileExists) persist(STORAGE_KEYS.modelPresetDismissed, true);
    setModelProfiles((current) => current.filter((item) => item.id !== id));
    setRouterConfig((current) => ({
      ...current,
      routes: current.routes.map((route) => ({
        ...route,
        primaryProfileId: route.primaryProfileId === id ? '' : route.primaryProfileId,
        fallbackProfileId: route.fallbackProfileId === id ? '' : route.fallbackProfileId,
      })),
    }));
    showToast(profile ? `${profile.name} profile removed from local routing.` : 'Model profile removed.');
  }

  function changeRouterPolicy(policy) {
    if (ROUTER_POLICIES_LIST.some((item) => item.id === policy)) setRouterConfig((current) => ({ ...current, policy }));
  }

  function changeRouteProfile(taskId, role, profileId) {
    try {
      setRouterConfig(updateRouterRoute(routerConfig, taskId, role, profileId, modelProfiles));
    } catch (error) {
      showToast(error.message || 'Could not update this route.');
    }
  }

  function exportModelRouter() {
    downloadJsonFile('julien-model-router.json', buildModelRouterConfig(routerConfig, modelProfiles));
    showToast('Router config exported with environment-variable names only; no secret values are included.');
  }

  async function importModelRouter(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parseModelRouterConfig(await file.text());
      setModelProfiles(imported.profiles);
      setRouterConfig(imported.config);
      persist(STORAGE_KEYS.modelPresetDismissed, !imported.profiles.some((profile) => profile.kind === 'local' && profile.model === QWEN_LOCAL_MODEL_PRESET.model));
      showToast(`Imported ${imported.profiles.length} model profile${imported.profiles.length === 1 ? '' : 's'} and route rules. Secrets were not imported.`);
    } catch (error) {
      showToast(error.message || 'Could not import this model-router config.');
    } finally {
      event.target.value = '';
    }
  }

  function exportMcpConfig() {
    const config = buildMcpClientConfig(mcpServers);
    const included = Object.keys(config.mcpServers).length;
    downloadJsonFile('julien-mcp-config.json', config);
    showToast(`Exported ${included} MCP profile${included === 1 ? '' : 's'}; set any placeholder secrets in your host.`);
  }

  function exportOnePlugin(plugin) {
    downloadJsonFile(`${plugin.id}-plugin.json`, buildPluginManifest(plugin));
    showToast(`${plugin.name} manifest exported.`);
  }

  function exportPluginRegistry() {
    const plugins = pluginManifests.filter((plugin) => plugin.enabled !== false).map(buildPluginManifest);
    downloadJsonFile('julien-plugin-registry.json', { format: 'julien-plugin-registry/v1', plugins });
    showToast(`Exported ${plugins.length} plugin manifest${plugins.length === 1 ? '' : 's'}. No code is included.`);
  }

  async function importMcpConfig(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = parseMcpClientConfig(await file.text());
      const existingIds = new Set(mcpServers.map((server) => server.id));
      const additions = result.servers.filter((server) => {
        if (existingIds.has(server.id)) return false;
        existingIds.add(server.id);
        return true;
      });
      setMcpServers((current) => [...additions, ...current]);
      const detail = result.ignoredEnvValues ? ` ${result.ignoredEnvValues} environment value${result.ignoredEnvValues === 1 ? ' was' : 's were'} discarded; names only were kept.` : '';
      showToast(`${additions.length} MCP profile${additions.length === 1 ? '' : 's'} imported.${detail}`);
    } catch (error) {
      showToast(error.message || 'Could not import this MCP config.');
    } finally {
      event.target.value = '';
    }
  }

  async function importPluginManifest(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const manifests = parsed?.format === 'julien-plugin-registry/v1'
        ? parsePluginRegistry(text, mcpServers, pluginManifests)
        : [parsePluginManifest(text, mcpServers, pluginManifests)];
      setPluginManifests((current) => [...manifests, ...current]);
      showToast(`${manifests.length} plugin manifest${manifests.length === 1 ? '' : 's'} imported. Executable fields were ignored.`);
    } catch (error) {
      showToast(error.message || 'Could not import this plugin manifest.');
    } finally {
      event.target.value = '';
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard.');
    } catch {
      showToast('Clipboard access is not available in this browser.');
    }
  }

  function speakText(text) {
    if (!('speechSynthesis' in window)) {
      showToast('Spoken replies are not supported in this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  function startListening() {
    if (isListening) {
      recognitionRef.current?.stop?.();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Voice input is not supported in this browser. You can type instead.');
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = navigator.language || 'en-US';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results).map((result) => result[0].transcript).join(' ').trim();
        setDraftText(transcript);
      };
      recognition.onerror = (event) => {
        setIsListening(false);
        if (event.error !== 'aborted') showToast(event.error === 'not-allowed' ? 'Microphone permission was not granted.' : 'I couldn’t hear that. Try again or type it.');
      };
      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };
      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
      showToast('Listening. Your words will appear here to review.');
    } catch {
      setIsListening(false);
      showToast('Could not start voice input. Check microphone permission.');
    }
  }

  function createAssistantMessage(text, action) {
    let styledText = text;
    if (learningProfile.brevity === 'concise') {
      if (styledText.startsWith('I’m listening.')) styledText = 'I can save memories, add reminders or plans, start focus, or draft a message. Open-ended reasoning and outside services aren’t connected yet.';
      else if (styledText.startsWith('I can keep memories you choose')) styledText = 'I can save memories, add local reminders or plans, start a focus timer, and prepare unsent drafts. Try “Remember that…” or “Remind me to…”.';
      else if (styledText.startsWith('On it. I added a reminder')) styledText = 'Reminder added to your local list. It won’t send a notification.';
      else if (styledText.startsWith('Got it. I’ll keep that close')) styledText = 'Saved on this device. You can review or remove it in Memory.';
      else if (styledText.startsWith('I’ve put together a starting point.')) styledText = 'Draft ready. It’s saved here; nothing was sent.';
      else if (styledText.startsWith('Let’s keep it simple.')) styledText = `${styledText.split('\nChoose one important thing')[0]}\nPick one priority and give it 25 quiet minutes.`;
    }
    if (learningProfile.brevity === 'detailed') {
      if (styledText.startsWith('On it. I added a reminder')) styledText += ' You can mark it complete or remove it later from Hands.';
      else if (styledText.startsWith('Got it. I’ll keep that close')) styledText += ' I won’t infer any other details from what you shared.';
      else if (styledText.startsWith('Let’s keep it simple.')) styledText += '\nThe aim is to make the day manageable, not to fill every open space.';
      else if (styledText.startsWith('I can keep memories you choose')) styledText += ' You can review or remove any saved item at any time.';
      else if (styledText.startsWith('I’m listening.')) styledText += ' The local actions are reminders, planning blocks, focus sessions, and unsent drafts.';
    }
    if (learningProfile.tone === 'warm') {
      styledText = styledText.replace(/^On it\./, 'Absolutely.').replace(/^Got it\./, 'Got it—thanks for sharing that.').replace(/^Done\./, 'Done—glad to help.').replace(/^I’m listening\./, 'I’m here with you.');
    } else if (learningProfile.tone === 'direct') {
      if (styledText.startsWith('On it. I added a reminder')) styledText = 'Reminder saved locally. No notification will be sent.';
      else if (styledText.startsWith('Got it. I’ll keep that close')) styledText = 'Memory saved locally. Review or remove it in Memory.';
      else if (styledText.startsWith('I’m listening.')) styledText = 'I can save memories, add a reminder or plan, start a focus session, or draft a message. Open-ended AI and outside services are not connected.';
    }
    const actionReceipt = action ? { ...action, outcome: action.outcome ?? 'executed' } : undefined;
    return { id: makeId(), role: 'assistant', text: styledText, action: actionReceipt, createdAt: Date.now() };
  }

  function interpretMessage(raw, classification = classifyIntent(raw)) {
    const text = raw.trim();
    const lower = text.toLowerCase();

    if (classification.intent === 'model_router') {
      navigate('router');
      return createAssistantMessage('I’ve opened the model-router builder. I can save API and local profiles, route previews, and an exportable config. No key is needed to design it—but this prototype has no provider runtime, so it will not call a model or claim a connection.');
    }

    if (classification.intent === 'memory_query') {
      if (memories.length === 0) {
        return createAssistantMessage('Nothing yet—and that’s intentional. Tell me “Remember that…” or add a memory from the Memory page, and I’ll keep it on this device.');
      }
      const summary = memories.slice(0, 5).map((memory) => `• ${memory.text}`).join('\n');
      return createAssistantMessage(`Here’s what you’ve asked me to keep in mind:\n${summary}`);
    }

    if (classification.intent === 'forget_memory') {
      const query = lower.replace(/^.*?\bforget\s+(?:that\s+)?/i, '').replace(/[.!?]+$/, '').trim();
      const match = memories.find((memory) => memory.text.toLowerCase().includes(query) || query.includes(memory.text.toLowerCase()));
      if (match) {
        setMemories((current) => current.filter((memory) => memory.id !== match.id));
        logActivity('memory', `Forgot: ${match.text}`);
        return createAssistantMessage('Done. I removed that memory from this browser.', { type: 'forget', recordId: match.id, title: match.text });
      }
      return createAssistantMessage('I couldn’t find a matching memory, so I haven’t changed anything. You can review everything on the Memory page.');
    }

    const skillCommand = normalizeSkillTriggerText(lower.replace(/^[\s,.!?]+/, '').replace(/^(?:please\s+|can you\s+|could you\s+)/, '').trim());
    const matchedSkill = skills.find((skill) => {
      if (!skill.enabled) return false;
      const trigger = normalizeSkillTriggerText(skill.trigger);
      return skillCommand === trigger || ['run', 'use', 'do'].some((verb) => skillCommand === `${verb} ${trigger}`);
    });
    if (matchedSkill) {
      logActivity('skill', `Used personal skill: ${matchedSkill.name}`);
      if (matchedSkill.actionType === 'task') {
        const item = createTask(matchedSkill.actionText, 'No date');
        return createAssistantMessage(`Ran “${matchedSkill.name}” and added a reminder to your local list.`, { type: 'task', recordId: item.id, title: item.title, due: item.due });
      }
      if (matchedSkill.actionType === 'memory') {
        const item = createMemory(matchedSkill.actionText, matchedSkill.category);
        return createAssistantMessage(`Ran “${matchedSkill.name}” and saved the memory on this device.`, { type: 'memory', recordId: item.id, title: item.text, category: item.category });
      }
      setFocusRemaining(25 * 60);
      setFocusRunning(true);
      logActivity('focus', `Started focus session via ${matchedSkill.name}`);
      return createAssistantMessage(`Ran “${matchedSkill.name}”. Your 25-minute focus session is running.`, { type: 'focus' });
    }

    if (classification.intent === 'save_memory') {
      const memoryMatch = text.match(/\b(?:remember|save|keep in mind|note)(?: that)?\s+(.+)/i);
      const savedText = (memoryMatch?.[1] ?? text).trim().replace(/[.!?]+$/, '');
      const item = createMemory(savedText, categoryForText(savedText));
      return createAssistantMessage('Got it. I’ll keep that close on this device. You can see, edit, or remove it in Memory.', {
        type: 'memory', recordId: item.id, title: item.text, category: item.category,
      });
    }

    if (classification.intent === 'draft') {
      const details = buildDraftDetails(text);
      const item = createDraft(details.to, details.subject, details.body);
      return createAssistantMessage('I’ve put together a starting point. It’s saved here as a draft; nothing has been sent.', {
        type: 'draft', recordId: item.id, to: item.to, subject: item.subject, body: item.body,
      });
    }

    if (classification.intent === 'calendar') {
      const title = cleanEventTitle(text) || 'A calendar block';
      const when = extractDue(text);
      const item = createEvent(title, '', '');
      item.when = when === 'No date' ? 'Unscheduled' : when;
      setEvents((current) => current.map((event) => event.id === item.id ? item : event));
      return createAssistantMessage('Added a planning block to your local list. It isn’t connected to an external calendar.', {
        type: 'event', recordId: item.id, title: item.title, when: item.when,
      });
    }

    if (classification.intent === 'task') {
      const title = cleanTaskTitle(text) || text;
      const due = extractDue(text);
      const item = createTask(title, due);
      return createAssistantMessage('On it. I added a reminder to your local list. This won’t trigger a notification, but it’ll be here when you come back.', {
        type: 'task', recordId: item.id, title: item.title, due: item.due,
      });
    }

    if (classification.intent === 'focus') {
      setFocusRemaining(25 * 60);
      setFocusRunning(true);
      logActivity('focus', 'Started a 25-minute focus session');
      return createAssistantMessage('Your 25-minute focus session is running. I’ll keep the timer here; pause or reset it any time from Hands.', { type: 'focus' });
    }

    if (classification.intent === 'plan') {
      const dueToday = openTasks.filter((task) => ['Today', 'Tomorrow', 'This week'].some((label) => task.due.startsWith(label)));
      const planLines = [
        events.length ? `Local plans: ${events.slice(0, 2).map((event) => `${event.title} (${event.when})`).join('; ')}.` : 'No calendar blocks are saved yet.',
        dueToday.length ? `Reminders to consider: ${dueToday.slice(0, 3).map((task) => task.title).join('; ')}.` : 'No time-sensitive reminders are on your list.',
      ];
      return createAssistantMessage(`Let’s keep it simple.\n${planLines.join('\n')}\nChoose one important thing, give it a first 25-minute block, and leave some room between commitments. I can add a reminder or plan a focus block if you want.`);
    }

    if (classification.intent === 'help') {
      return createAssistantMessage('I can keep memories you choose, make local reminders and planning blocks, start a focus timer, and prepare email drafts that are never sent. Say “Remember that…”, “Remind me to…”, or “Draft an email to…” to try one. You can also ask me to “create a model router” to configure API and local profiles; its route previews do not contact models.');
    }

    if (classification.intent === 'gratitude') {
      return createAssistantMessage('You’re welcome. I’m here whenever you want to pick this back up.');
    }

    const actionIntents = ['save_memory', 'forget_memory', 'task', 'calendar', 'draft', 'focus'];
    if (!classification.highConfidence && actionIntents.includes(classification.predictedIntent)) {
      if (classification.predictedIntent === 'calendar') {
        return createAssistantMessage('I can’t read an outside calendar here. If you meant to save a local plan, say “Schedule a block for tomorrow.” I didn’t create anything.');
      }
      const examples = {
        save_memory: 'Remember that…', forget_memory: 'Forget…', task: 'Remind me to…',
        draft: 'Draft an email to…', focus: 'Start a focus session',
      };
      return createAssistantMessage(`I wasn’t confident enough to ${classification.predictedLabel.toLowerCase()}. Nothing was changed. Try saying “${examples[classification.predictedIntent]}” so I can route it safely.`);
    }

    return createAssistantMessage('I’m listening. I can help make this concrete by saving a memory, adding a reminder or planning block, starting a focus session, or preparing an email draft. For open-ended reasoning and outside services, a model or account connection would need to be added first.');
  }

  function handleSend(value = draftText) {
    const text = value.trim();
    if (!text || isThinking) return;
    const classification = classifyIntent(text, { skills });
    recognitionRef.current?.stop?.();
    setIsListening(false);
    setDraftText('');
    setMessages((current) => [...current, { id: makeId(), role: 'user', text, classification, createdAt: Date.now() }]);
    setIsThinking(true);
    pendingResponseRef.current = window.setTimeout(() => {
      pendingResponseRef.current = null;
      const response = interpretMessage(text, classification);
      setMessages((current) => [...current, response]);
      setIsThinking(false);
      if (settings.autoSpeak) speakText(response.text);
    }, 380);
  }

  function startFocus() {
    setFocusRemaining(25 * 60);
    setFocusRunning(true);
    logActivity('focus', 'Started a 25-minute focus session');
    showToast('Focus session started. You’ve got this.');
  }

  function toggleAutoSpeak() {
    setSettings((current) => ({ ...current, autoSpeak: !current.autoSpeak }));
  }

  function exportData() {
    const data = { exportedAt: new Date().toISOString(), memories, tasks, events, drafts, activity, conversations, activeConversationId, learningProfile, skills, connectionRequests, mcpServers, pluginManifests, modelRouter: buildModelRouterConfig(routerConfig, modelProfiles), settings };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'julien-personal-data.json';
    link.click();
    URL.revokeObjectURL(url);
    showToast('Your data export is ready.');
  }

  const qwenLocalProfile = modelProfiles.find((profile) => profile.kind === 'local' && profile.model === QWEN_LOCAL_MODEL_PRESET.model);
  const qwenPrimaryRouteCount = qwenLocalProfile ? routerConfig.routes.filter((route) => route.primaryProfileId === qwenLocalProfile.id).length : 0;
  const navItems = [
    { id: 'chat', label: 'Chat', icon: <MessageCircle size={17} />, badge: null },
    { id: 'memory', label: 'Memory', icon: <Brain size={17} />, badge: memories.length || null },
    { id: 'skills', label: 'Skill library', icon: <BookOpen size={17} />, badge: skills.length || null },
    { id: 'hands', label: 'Hands', icon: <Zap size={17} />, badge: null },
    { id: 'connections', label: 'Connections', icon: <Link2 size={17} />, badge: connectionRequests.length || null },
    { id: 'router', label: 'Model router', icon: <Cpu size={17} />, badge: modelProfiles.length || null },
    { id: 'extensions', label: 'MCP & Plugins', icon: <Puzzle size={17} />, badge: mcpServers.length + pluginManifests.length || null },
    { id: 'evolve', label: 'Evolve', icon: <TrendingUp size={17} />, badge: learningProposals.length || null },
    { id: 'soul', label: 'Soul', icon: <ShieldCheck size={17} />, badge: null },
  ];
  const pageTitle = { chat: 'Your space', memory: 'Memory', skills: 'Skill Library', hands: 'Hands', connections: 'Connections', router: 'Model router', extensions: 'MCP & Plugins', evolve: 'Evolve', soul: 'Soul of Julien', settings: 'Settings' }[activeTab];

  return (
    <div className="app-shell">
      {mobileNavOpen && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Sparkles size={18} strokeWidth={2} /></div>
          <div className="brand-text"><strong>julien</strong><span>PERSONAL AGENT</span></div>
          <IconButton label="Close navigation" className="mobile-close" onClick={() => setMobileNavOpen(false)}><X size={18} /></IconButton>
        </div>

        <div className="space-switcher">
          <div className="space-avatar"><UserRound size={16} /></div>
          <div className="space-name"><strong>Your space</strong><span>Personal workspace</span></div>
          <MoreHorizontal size={17} className="space-more" />
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button type="button" className={`nav-item ${activeTab === item.id ? 'active' : ''}`} key={item.id} onClick={() => navigate(item.id)}>
              <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
              {item.badge && <span className="nav-badge">{item.badge}</span>}
              {item.id === 'hands' && <span className="nav-ready-dot" />}
            </button>
          ))}
        </nav>

        <div className="conversation-history-section">
          <div className="conversation-history-heading">
            <div className="sidebar-section-label">RECENT CHATS</div>
            <button type="button" className="history-new-button" onClick={startNewConversation}><Plus size={13} /> New chat</button>
          </div>
          <div className="conversation-history" aria-label="Recent conversations">
            {recentConversations.map((conversation) => (
              <div className={`conversation-history-row ${activeTab === 'chat' && conversation.id === activeConversationId ? 'current' : ''}`} key={conversation.id}>
                <button type="button" className="conversation-history-item" title={conversation.title} onClick={() => selectConversation(conversation.id)}>
                  <MessageCircle size={14} />
                  <span><strong>{conversation.title}</strong><small>{relativeTime(conversation.updatedAt)}</small></span>
                </button>
                {conversations.length > 1 && <button type="button" className="history-delete-button" aria-label={`Delete conversation: ${conversation.title}`} title="Delete conversation" onClick={() => deleteConversation(conversation.id)}><X size={13} /></button>}
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-section-label tools-label">YOUR TOOLS</div>
        <div className="sidebar-shortcuts">
          <button type="button" onClick={() => openModal('task')}><span className="shortcut-icon shortcut-yellow"><ListTodo size={15} /></span><span>Reminder</span><Plus size={14} /></button>
          <button type="button" onClick={() => openModal('draft')}><span className="shortcut-icon shortcut-lilac"><PenLine size={15} /></span><span>Draft a note</span><Plus size={14} /></button>
        </div>

        <div className="sidebar-spacer" />
        <div className="local-status-card">
          <div className="local-status-top"><span className="status-check"><ShieldCheck size={14} /></span><span>PRIVATE BY DESIGN</span></div>
          <p>Your memories and plans stay in this browser.</p>
          <button type="button" onClick={() => navigate('settings')}>Privacy details <ArrowUpRight size={13} /></button>
        </div>
        <button type="button" className={`settings-nav ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}>
          <Settings2 size={17} /><span>Settings</span><ChevronRight size={15} />
        </button>
        <div className="sidebar-footer"><div className="footer-avatar">Y</div><div><strong>Your profile</strong><span>Local workspace</span></div><MoreHorizontal size={17} /></div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <IconButton label="Open navigation" className="mobile-menu-button" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></IconButton>
            <span className="topbar-context">JULIEN</span><span className="crumb-divider">/</span><span className="topbar-current">{pageTitle}</span>
          </div>
          <div className="topbar-right">
            <div className="secure-pill"><span className="secure-dot" /><LockKeyhole size={13} /><span>ON THIS DEVICE</span></div>
            <IconButton label="Open settings" onClick={() => navigate('settings')}><Settings2 size={17} /></IconButton>
          </div>
        </header>

        <div className={`main-layout ${activeTab === 'chat' ? 'with-rail' : 'single-column'}`}>
          <main className={`primary-content page-${activeTab}`}>
            {activeTab === 'chat' && (
              <section className="chat-screen">
                <div className="chat-scroll" ref={threadRef}>
                  {messages.length === 1 ? (
                    <div className="chat-page-heading">
                      <div className="eyebrow date-eyebrow"><span className="date-mark" />{prettyDate().toUpperCase()}</div>
                      <h1>Make room for<br className="mobile-break" /> <em>what matters.</em></h1>
                      <p>Think it through. Keep what matters. I’ll help with the next step.</p>
                    </div>
                  ) : (
                    <div className="conversation-toolbar">
                      <div className="conversation-toolbar-avatar"><Sparkles size={16} /></div>
                      <div className="conversation-toolbar-copy"><strong>{activeConversation?.title ?? 'Conversation'}</strong><span><span className="secure-dot" /> PRIVATE CHAT · SAVED ON THIS DEVICE</span></div>
                      <button type="button" className="conversation-new-action" onClick={startNewConversation}><Plus size={14} /> New chat</button>
                    </div>
                  )}

                  <div className="conversation-list">
                    {messages.map((message) => (
                      <ChatMessage key={message.id} message={message} conversationId={activeConversationId} onSpeak={speakText} onCopy={copyText} onFeedback={handleMessageFeedback} />
                    ))}
                    {isThinking && (
                      <div className="thinking-row"><div className="agent-avatar small-avatar"><Sparkles size={15} /></div><div className="thinking-bubble"><span /><span /><span /></div></div>
                    )}
                  </div>

                  {messages.length === 1 && (
                    <div className="starter-area">
                      <div className="starter-label">A FEW GOOD PLACES TO START</div>
                      <div className="starter-grid">
                        <button type="button" className="starter-card" onClick={() => openModal('memory')}>
                          <span className="starter-icon starter-memory"><Brain size={17} /></span>
                          <span className="starter-card-copy"><strong>Remember something</strong><small>Keep a detail close</small></span><ChevronRight size={15} className="starter-chevron" />
                        </button>
                        <button type="button" className="starter-card" onClick={() => openModal('task')}>
                          <span className="starter-icon starter-task"><ListTodo size={17} /></span>
                          <span className="starter-card-copy"><strong>Make a reminder</strong><small>Get it out of your head</small></span><ChevronRight size={15} className="starter-chevron" />
                        </button>
                        <button type="button" className="starter-card" onClick={() => openModal('draft')}>
                          <span className="starter-icon starter-draft"><Mail size={17} /></span>
                          <span className="starter-card-copy"><strong>Draft a message</strong><small>Start with a few words</small></span><ChevronRight size={15} className="starter-chevron" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="composer-wrap">
                  <form className="composer" onSubmit={(event) => { event.preventDefault(); handleSend(); }}>
                    <textarea
                      aria-label="Message Julien"
                      value={draftText}
                      onChange={(event) => setDraftText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); }
                      }}
                      placeholder="Ask Julien, or tell me what to remember…"
                      rows={1}
                    />
                    <div className="composer-bottom">
                      <div className="composer-note"><LockKeyhole size={13} /><span>Your words stay in this browser</span></div>
                      <div className="composer-buttons">
                        <button type="button" className={`mic-button ${isListening ? 'listening' : ''}`} aria-label={isListening ? 'Stop listening' : 'Use voice input'} title={isListening ? 'Stop listening' : 'Speak to Julien'} onClick={startListening}>
                          {isListening ? <MicOff size={17} /> : <Mic size={17} />}
                        </button>
                        <button type="submit" className="send-button" aria-label="Send message" disabled={!draftText.trim() || isThinking}>
                          <ArrowUp size={17} />
                        </button>
                      </div>
                    </div>
                  </form>
                  <div className="composer-caption">Julien can save and organize locally. No outside accounts are connected.</div>
                </div>
              </section>
            )}

            {activeTab === 'memory' && (
              <section className="content-page memory-page">
                <SectionHeading
                  eyebrow="YOUR PERSONAL CONTEXT"
                  title={<>A memory that<br className="desktop-break" /> belongs to <em>you.</em></>}
                  description="Keep the details that make help feel personal. You choose what stays, and you can change it any time."
                  action={<button type="button" className="button-primary" onClick={() => openModal('memory')}><Plus size={16} /> Add memory</button>}
                />
                <div className="memory-banner">
                  <div className="memory-banner-icon"><Brain size={23} /></div>
                  <div className="memory-banner-copy"><div className="eyebrow">PRIVATE BY DESIGN</div><h2>Nothing assumed. Nothing hidden.</h2><p>Julien only remembers what you choose to add. Your list lives in this browser, not in a connected account.</p></div>
                  <div className="memory-banner-count"><strong>{memories.length.toString().padStart(2, '0')}</strong><span>MEMORIES</span></div>
                </div>
                <div className="memory-toolbar">
                  <label className="search-field"><Search size={16} /><input value={memoryQuery} onChange={(event) => setMemoryQuery(event.target.value)} placeholder="Find a memory" /></label>
                  <div className="filter-pills" aria-label="Filter memories">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'preference', label: 'Preferences' },
                      { id: 'person', label: 'People' },
                      { id: 'project', label: 'Projects' },
                      { id: 'routine', label: 'Routines' },
                      { id: 'other', label: 'Other' },
                    ].map((filter) => (
                      <button type="button" key={filter.id} className={memoryFilter === filter.id ? 'selected' : ''} onClick={() => setMemoryFilter(filter.id)}>{filter.label}</button>
                    ))}
                  </div>
                </div>
                {filteredMemories.length === 0 ? (
                  <div className="empty-memory-state">
                    <div className="empty-memory-orb"><Sparkles size={20} /></div>
                    <h3>{memories.length ? 'No memories match that search.' : 'Your memory starts with you.'}</h3>
                    <p>{memories.length ? 'Try a different phrase or choose another category.' : 'Add a preference, a project, or anything you’d like Julien to remember next time.'}</p>
                    {!memories.length && <button type="button" className="button-secondary" onClick={() => openModal('memory')}><Plus size={15} /> Save your first memory</button>}
                  </div>
                ) : (
                  <div className="memory-list">
                    {filteredMemories.map((memory) => (
                      <article className="memory-item-card" key={memory.id}>
                        <div className={`memory-category-icon cat-${memory.category}`}><Brain size={17} /></div>
                        <div className="memory-item-main"><span className="memory-category-label">{categoryLabel(memory.category).toUpperCase()}</span><p>{memory.text}</p><small>{memory.updatedAt ? `Updated ${relativeTime(memory.updatedAt)}` : `Added ${relativeTime(memory.createdAt)}`}</small></div>
                        <div className="memory-item-actions">
                          <button type="button" className="memory-edit" aria-label={`Edit memory: ${memory.text}`} title="Edit this memory" onClick={() => openModal('memory', memory)}><PenLine size={15} /></button>
                          <button type="button" className="memory-delete" aria-label={`Forget memory: ${memory.text}`} title="Remove this memory" onClick={() => deleteMemory(memory.id)}><Trash2 size={15} /></button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {!memories.length && (
                  <div className="memory-examples">
                    <div className="memory-examples-title">IDEAS, IF YOU NEED THEM</div>
                    <button type="button" onClick={() => openModal('memory', { text: 'I prefer…', category: 'preference' })}>“I prefer…” <ArrowUpRight size={13} /></button>
                    <button type="button" onClick={() => openModal('memory', { text: 'I’m working on…', category: 'project' })}>“I’m working on…” <ArrowUpRight size={13} /></button>
                    <button type="button" onClick={() => openModal('memory', { text: 'My mornings are for…', category: 'routine' })}>“My mornings are for…” <ArrowUpRight size={13} /></button>
                  </div>
                )}
              </section>
            )}

            {activeTab === 'skills' && (
              <section className="content-page skills-page">
                <SectionHeading
                  eyebrow="SAFE, REUSABLE SHORTCUTS"
                  title={<>A skill for<br /><em>your next step.</em></>}
                  description="Install small workflows from Julien’s marketplace, import a public skill manifest from GitHub, or teach a shortcut of your own. Skills use only Julien’s built-in local actions."
                  action={<div className="skills-page-actions"><button type="button" className="button-secondary" onClick={() => setGithubSkillModal(true)}><Github size={15} /> GitHub</button><button type="button" className="button-primary" onClick={() => setEvolutionModal({ type: 'skill' })}><Plus size={15} /> Teach a skill</button></div>}
                />
                <div className="skills-overview-stats"><div><strong>{skills.length}</strong><span>IN YOUR LIBRARY</span></div><div><strong>{skills.filter((skill) => skill.enabled !== false).length}</strong><span>ACTIVE</span></div><div><strong>{skills.filter((skill) => skill.source?.type === 'github').length}</strong><span>FROM GITHUB</span></div><div><strong>{MARKETPLACE_SKILLS.length}</strong><span>MARKETPLACE PICKS</span></div></div>
                <div className="skills-library-tabs" role="tablist" aria-label="Skill library sections">
                  <button type="button" role="tab" aria-selected={skillPageTab === 'library'} className={skillPageTab === 'library' ? 'selected' : ''} onClick={() => setSkillPageTab('library')}><BookOpen size={15} /> My library <span>{skills.length}</span></button>
                  <button type="button" role="tab" aria-selected={skillPageTab === 'marketplace'} className={skillPageTab === 'marketplace' ? 'selected' : ''} onClick={() => setSkillPageTab('marketplace')}><Sparkles size={15} /> Marketplace <span>{MARKETPLACE_SKILLS.length}</span></button>
                </div>
                {skillPageTab === 'library' ? (
                  <div className="skill-library-content">
                    <div className="skills-toolbar"><label className="search-field skills-search"><Search size={15} /><input value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} placeholder="Search your skills" /></label><span>{filteredSkills.length} {filteredSkills.length === 1 ? 'SKILL' : 'SKILLS'}</span></div>
                    {filteredSkills.length === 0 ? (
                      <div className="skills-library-empty"><span className="skills-library-empty-icon"><BookOpen size={20} /></span><strong>{skills.length ? 'No skills match that search' : 'Your library is ready'}</strong><p>{skills.length ? 'Try another name, trigger, or GitHub repository.' : 'Install a safe starter from the marketplace, bring in a public GitHub manifest, or teach Julien your own exact-trigger shortcut.'}</p><div><button type="button" className="button-secondary" onClick={() => setSkillPageTab('marketplace')}><Sparkles size={14} /> Browse marketplace</button><button type="button" className="button-primary" onClick={() => setGithubSkillModal(true)}><Github size={14} /> Import from GitHub</button></div></div>
                    ) : (
                      <div className="installed-skill-grid">
                        {filteredSkills.map((skill) => {
                          const sourceType = skill.source?.type || 'personal';
                          const isEnabled = skill.enabled !== false;
                          return (
                            <article className={`installed-skill-card ${isEnabled ? '' : 'installed-skill-paused'}`} key={skill.id}>
                              <div className="installed-skill-card-head"><span className={`installed-skill-icon installed-${sourceType}-icon`}>{sourceType === 'github' ? <Github size={17} /> : sourceType === 'marketplace' ? <Sparkles size={17} /> : <Zap size={17} />}</span><div className="installed-skill-heading"><h3>{skill.name}</h3><small>{sourceType === 'github' ? `GITHUB · ${skill.source?.repoUrl?.replace('https://github.com/', '') || 'public repository'}` : sourceType === 'marketplace' ? `MARKETPLACE · v${skill.version || '1.0.0'}` : 'PERSONAL SKILL'}</small></div><span className={`installed-skill-status ${isEnabled ? 'skill-status-on' : ''}`}>{isEnabled ? 'ACTIVE' : 'PAUSED'}</span></div>
                              <div className="installed-trigger-row"><span>EXACT TRIGGER</span><code>“{skill.trigger}”</code></div>
                              <p className="installed-skill-description">{skill.description || describeSkillAction(skill)}</p>
                              <div className="installed-skill-action"><span>{skill.actionType === 'task' ? <ListTodo size={13} /> : skill.actionType === 'memory' ? <Brain size={13} /> : <Clock3 size={13} />}{skill.actionType === 'task' ? 'LOCAL REMINDER' : skill.actionType === 'memory' ? 'LOCAL MEMORY' : 'FOCUS TIMER'}</span><p>{describeSkillAction(skill)}</p></div>
                              {sourceType === 'github' && <div className="github-source-meta"><span>TRACKING {skill.source?.ref || 'main'} · {skill.source?.path}</span>{skill.source?.sha && <code>{skill.source.sha.slice(0, 7)}</code>}</div>}
                              <div className="installed-skill-actions"><label className="skill-enable-control"><button type="button" role="switch" aria-checked={isEnabled} aria-label={`${isEnabled ? 'Pause' : 'Enable'} ${skill.name}`} className={`toggle skill-toggle ${isEnabled ? 'on' : ''}`} onClick={() => toggleSkill(skill.id)}><span /></button><span>{isEnabled ? 'Enabled' : 'Paused'}</span></label><div className="installed-skill-action-buttons">{sourceType === 'github' && <button type="button" className="skill-card-action" onClick={() => checkSkillForUpdates(skill)} disabled={syncingSkillId === skill.id} title="Fetch the public manifest again; changes require your approval">{syncingSkillId === skill.id ? <RefreshCw size={13} className="spin-icon" /> : <RefreshCw size={13} />} Check updates</button>}<button type="button" className="skill-card-icon-action" aria-label={`Export ${skill.name} manifest`} title="Export manifest" onClick={() => exportSkillManifest(skill)}><Download size={14} /></button><button type="button" className="skill-card-icon-action skill-remove-action" aria-label={`Remove ${skill.name}`} title="Remove skill" onClick={() => deleteSkill(skill.id)}><Trash2 size={14} /></button></div></div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                    <div className="skills-library-footnote"><ShieldCheck size={14} /><span>Triggers must match exactly. Skills can only run Julien’s local reminder, memory, or focus actions; pause or remove them whenever you like.</span></div>
                  </div>
                ) : (
                  <div className="skill-marketplace-content">
                    <div className="marketplace-banner"><div className="marketplace-banner-icon"><Sparkles size={19} /></div><div><div className="eyebrow">CURATED · NO CODE</div><strong>Small, transparent skills.</strong><p>Every listing is a declarative recipe for one built-in local action. Review it before installing.</p></div><span className="marketplace-local-pill"><LockKeyhole size={12} /> RUNS LOCALLY</span></div>
                    <div className="marketplace-controls"><label className="search-field skills-search"><Search size={15} /><input value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} placeholder="Search marketplace skills" /></label><div className="marketplace-category-pills" aria-label="Filter skill marketplace">{MARKETPLACE_CATEGORIES.map((category) => <button type="button" key={category.id} className={skillCategory === category.id ? 'selected' : ''} onClick={() => setSkillCategory(category.id)}>{category.label}</button>)}</div></div>
                    <div className="marketplace-results-label"><span>{filteredMarketplaceSkills.length} {filteredMarketplaceSkills.length === 1 ? 'SKILL' : 'SKILLS'}</span><span>ALL ACTIONS ARE REVIEWABLE · NO SCRIPTS</span></div>
                    {filteredMarketplaceSkills.length === 0 ? <div className="skills-library-empty compact-skill-empty"><Search size={19} /><strong>No marketplace skills found</strong><p>Try another search or choose a different category.</p></div> : (
                      <div className="marketplace-skill-grid">
                        {filteredMarketplaceSkills.map((packageManifest) => {
                          const installed = skills.find((skill) => skill.source?.type === 'marketplace' && skill.source.packageId === packageManifest.id);
                          const triggerConflict = !installed && skills.find((skill) => normalizeSkillTriggerText(skill.trigger) === packageManifest.trigger);
                          const actionPreview = describeSkillAction({ actionType: packageManifest.action.type, actionText: packageManifest.action.text });
                          return (
                            <article className="marketplace-skill-card" key={packageManifest.id}>
                              <div className="marketplace-skill-card-top"><span className={`marketplace-category-mark marketplace-${packageManifest.category}-mark`}>{packageManifest.category === 'focus' ? <Clock3 size={16} /> : packageManifest.category === 'wellbeing' ? <Sparkles size={16} /> : packageManifest.category === 'learning' ? <Brain size={16} /> : <Zap size={16} />}</span><span className="marketplace-category-label">{packageManifest.category}</span><span className="marketplace-version">v{packageManifest.version}</span></div>
                              <h3>{packageManifest.name}</h3><p className="marketplace-skill-description">{packageManifest.description}</p>
                              <div className="marketplace-trigger"><span>SAY EXACTLY</span><code>“{packageManifest.trigger}”</code></div>
                              <div className="marketplace-action-preview"><span>{packageManifest.action.type === 'task' ? 'LOCAL REMINDER' : packageManifest.action.type === 'memory' ? 'LOCAL MEMORY' : 'FOCUS TIMER'}</span><p>{actionPreview}</p></div>
                              <div className="marketplace-skill-footer"><span>{packageManifest.author} · {packageManifest.license}</span><button type="button" className={installed || triggerConflict ? 'button-secondary marketplace-install-button' : 'button-primary marketplace-install-button'} disabled={Boolean(installed || triggerConflict)} title={triggerConflict ? `Trigger already used by ${triggerConflict.name}` : undefined} onClick={() => installSkillPackage(packageManifest, { type: 'marketplace', packageId: packageManifest.id })}>{installed ? <><Check size={13} /> Installed</> : triggerConflict ? 'Trigger in use' : <><Plus size={13} /> Install</>}</button></div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                    <div className="marketplace-github-callout"><div className="github-callout-icon"><Github size={16} /></div><div><strong>Have a skill in a public GitHub repo?</strong><p>Connect a JSON manifest. Julien will review its schema and ignore executable fields.</p></div><button type="button" className="button-secondary" onClick={() => setGithubSkillModal(true)}>Import from GitHub <ChevronRight size={14} /></button></div>
                  </div>
                )}
              </section>
            )}

            {activeTab === 'hands' && (
              <section className="content-page hands-page">
                <SectionHeading
                  eyebrow="TOOLS & FOLLOW-THROUGH"
                  title={<>A few useful<br /> <em>hands.</em></>}
                  description="Julien can take small steps in this workspace. You stay in control of every action."
                />
                <div className="hands-hero">
                  <div className="hands-hero-copy"><span className="hero-overline"><span className="hero-live-dot" /> READY WHEN YOU ARE</span><h2>Your say-so,<br />then my next step.</h2><p>These tools work right here in your browser. Nothing is sent to another app or person.</p></div>
                  <div className="hands-orbit" aria-hidden="true"><div className="orbit-ring orbit-one" /><div className="orbit-ring orbit-two" /><div className="orbit-dot dot-one"><ListTodo size={17} /></div><div className="orbit-dot dot-two"><Mail size={16} /></div><div className="orbit-dot dot-three"><CalendarDays size={17} /></div><div className="orbit-core"><Sparkles size={23} /></div></div>
                  <div className="hero-local-tag"><LockKeyhole size={13} /> LOCAL WORKSPACE</div>
                </div>
                <div className="tools-grid">
                  <article className="tool-card">
                    <div className="tool-card-top"><span className="tool-icon tool-task-icon"><ListTodo size={18} /></span><span className="tool-status"><span /> READY</span></div>
                    <h3>Reminders</h3><p>Capture a small commitment before it slips away. Saved in your local list.</p>
                    <button type="button" className="tool-action" onClick={() => openModal('task')}>Add a reminder <ArrowUpRight size={15} /></button>
                  </article>
                  <article className="tool-card">
                    <div className="tool-card-top"><span className="tool-icon tool-calendar-icon"><CalendarDays size={18} /></span><span className="tool-status"><span /> READY</span></div>
                    <h3>Planning blocks</h3><p>Make a little space for something that matters. Not synced to an outside calendar.</p>
                    <button type="button" className="tool-action" onClick={() => openModal('event')}>Plan some time <ArrowUpRight size={15} /></button>
                  </article>
                  <article className="tool-card">
                    <div className="tool-card-top"><span className="tool-icon tool-draft-icon"><Mail size={18} /></span><span className="tool-status"><span /> DRAFT ONLY</span></div>
                    <h3>Message drafts</h3><p>Get the first few words down. Julien will never send an email for you.</p>
                    <button type="button" className="tool-action" onClick={() => openModal('draft')}>Start a draft <ArrowUpRight size={15} /></button>
                  </article>
                  <article className="tool-card focus-tool-card">
                    <div className="tool-card-top"><span className="tool-icon tool-focus-icon"><Clock3 size={18} /></span><span className="tool-status"><span /> ON THIS DEVICE</span></div>
                    <h3>Focus timer</h3><p>Give one thing twenty-five quiet minutes. Pause or reset whenever you like.</p>
                    {focusRunning ? (
                      <div className="timer-control-row"><strong>{String(Math.floor(focusRemaining / 60)).padStart(2, '0')}:{String(focusRemaining % 60).padStart(2, '0')}</strong><button type="button" className="tool-action" onClick={() => setFocusRunning(false)}><Pause size={14} /> Pause</button><button type="button" className="timer-reset" aria-label="Reset focus timer" onClick={() => { setFocusRunning(false); setFocusRemaining(0); }}><RotateCcw size={15} /></button></div>
                    ) : focusRemaining > 0 ? (
                      <div className="timer-control-row"><strong>{String(Math.floor(focusRemaining / 60)).padStart(2, '0')}:{String(focusRemaining % 60).padStart(2, '0')}</strong><button type="button" className="tool-action" onClick={() => setFocusRunning(true)}><Play size={14} /> Resume</button><button type="button" className="timer-reset" aria-label="Reset focus timer" onClick={() => setFocusRemaining(0)}><RotateCcw size={15} /></button></div>
                    ) : <button type="button" className="tool-action" onClick={startFocus}>Start 25 minutes <ArrowUpRight size={15} /></button>}
                  </article>
                </div>
                <div className="saved-actions-section">
                  <div className="activity-heading"><div><div className="eyebrow">YOUR LOCAL WORKSPACE</div><h2>Saved actions</h2></div><span>{tasks.length + events.length + drafts.length} items</span></div>
                  <div className="saved-actions-grid">
                    <article className="saved-action-panel">
                      <div className="saved-panel-head"><div><span className="saved-panel-kicker">REMINDERS</span><h3>Your list <span>{tasks.length}</span></h3></div><button type="button" className="saved-add-button" aria-label="Add a reminder" onClick={() => openModal('task')}><Plus size={15} /></button></div>
                      {tasks.length === 0 ? <div className="saved-empty">No reminders saved yet.<button type="button" onClick={() => openModal('task')}>Add one <ArrowUpRight size={12} /></button></div> : <div className="saved-record-list">{tasks.map((task) => <div className={`saved-task-row ${task.done ? 'task-done' : ''}`} key={task.id}><button type="button" className="saved-task-check" aria-label={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`} onClick={() => toggleTask(task.id)}>{task.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}</button><div className="saved-record-copy"><strong>{task.title}</strong><small>{task.due}</small></div><button type="button" className="saved-delete" aria-label={`Remove ${task.title}`} onClick={() => deleteTask(task.id)}><Trash2 size={14} /></button></div>)}</div>}
                    </article>
                    <article className="saved-action-panel">
                      <div className="saved-panel-head"><div><span className="saved-panel-kicker">PLANNING BLOCKS</span><h3>Your local plan <span>{events.length}</span></h3></div><button type="button" className="saved-add-button" aria-label="Add a planning block" onClick={() => openModal('event')}><Plus size={15} /></button></div>
                      {events.length === 0 ? <div className="saved-empty">No planning blocks yet.<button type="button" onClick={() => openModal('event')}>Make some room <ArrowUpRight size={12} /></button></div> : <div className="saved-record-list">{events.map((event) => <div className="saved-event-row" key={event.id}><span className="saved-event-icon"><CalendarDays size={15} /></span><div className="saved-record-copy"><strong>{event.title}</strong><small>{event.when}</small></div><button type="button" className="saved-delete" aria-label={`Remove ${event.title}`} onClick={() => deleteEvent(event.id)}><Trash2 size={14} /></button></div>)}</div>}
                    </article>
                    <article className="saved-action-panel saved-drafts-panel">
                      <div className="saved-panel-head"><div><span className="saved-panel-kicker">NOT SENT · EVER</span><h3>Message drafts <span>{drafts.length}</span></h3></div><button type="button" className="saved-add-button" aria-label="Start a message draft" onClick={() => openModal('draft')}><Plus size={15} /></button></div>
                      {drafts.length === 0 ? <div className="saved-empty">Nothing waiting in drafts.<button type="button" onClick={() => openModal('draft')}>Start a note <ArrowUpRight size={12} /></button></div> : <div className="saved-record-list">{drafts.map((draft) => <div className="saved-draft-row" key={draft.id}><span className="saved-draft-icon"><Mail size={15} /></span><div className="saved-record-copy"><strong>{draft.subject}</strong><small>{draft.to ? `To ${draft.to} · ` : ''}{relativeTime(draft.createdAt)}</small><p>{draft.body}</p></div><button type="button" className="saved-copy-button" aria-label={`Copy ${draft.subject}`} onClick={() => copyText(`${draft.subject}\n\n${draft.body}`)}><Copy size={14} /></button><button type="button" className="saved-delete" aria-label={`Remove ${draft.subject}`} onClick={() => deleteDraft(draft.id)}><Trash2 size={14} /></button></div>)}</div>}
                    </article>
                  </div>
                </div>
                <div className="activity-section">
                  <div className="activity-heading"><div><div className="eyebrow">A CLEAR RECORD</div><h2>Recent activity</h2></div><span>{activity.length} {activity.length === 1 ? 'action' : 'actions'}</span></div>
                  {activity.length === 0 ? (
                    <div className="activity-empty"><span className="activity-empty-icon"><Clock3 size={17} /></span><p>No actions yet. When you ask Julien to do something, you’ll see it here.</p></div>
                  ) : (
                    <div className="activity-list">
                      {activity.slice(0, 6).map((item) => <div className="activity-item" key={item.id}><span className={`activity-type activity-${item.type}`}>{item.type === 'memory' ? <Brain size={15} /> : item.type === 'draft' ? <Mail size={15} /> : item.type === 'event' ? <CalendarDays size={15} /> : item.type === 'focus' ? <Clock3 size={15} /> : item.type === 'learning' ? <TrendingUp size={15} /> : item.type === 'skill' ? <Zap size={15} /> : <ListTodo size={15} />}</span><span className="activity-label">{item.label}</span><span className="activity-time">{relativeTime(item.createdAt)}</span></div>)}
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'connections' && (
              <section className="content-page connections-page">
                <SectionHeading
                  eyebrow="CONNECT YOUR WORKSPACE"
                  title={<>Your apps,<br /><em>in one place.</em></>}
                  description="Browse common tools and choose what Julien should support first. Connections are never shown as live until an authorization service is configured."
                />
                <div className="connections-status-banner">
                  <span className="connections-status-icon"><Link2 size={19} /></span>
                  <div className="connections-status-copy"><div className="eyebrow">CONNECTION STATUS</div><strong>Live app authorization isn’t configured</strong><p>This browser-only build has no OAuth server or provider credentials. Add apps to a local setup list—no account will be connected and no data will be sent.</p></div>
                  <span className="connections-offline-pill"><span /> NOT CONNECTED</span>
                </div>
                <div className="connections-stats">
                  <div><strong>0</strong><small>LIVE CONNECTIONS</small></div>
                  <div><strong>{INTEGRATIONS.length}</strong><small>APPS IN CATALOG</small></div>
                  <div><strong>{connectionRequests.length}</strong><small>SETUP PRIORITIES</small></div>
                </div>
                {connectionRequests.length > 0 && (
                  <div className="setup-priority-strip"><div><span className="eyebrow">YOUR SETUP PRIORITIES</span><p>Saved locally for a future secure connector setup.</p></div><div className="setup-priority-list">{connectionRequests.map((request) => {
                    const integration = INTEGRATIONS.find((item) => item.id === request.id);
                    if (!integration) return null;
                    return <button type="button" className="setup-priority-chip" key={request.id} onClick={() => handleConnectionRequest(request.id)} title={`Remove ${integration.name} from setup priorities`}>{integration.name}<X size={12} /></button>;
                  })}</div></div>
                )}
                <div className="integration-controls">
                  <label className="search-field integration-search"><Search size={16} /><input value={integrationQuery} onChange={(event) => setIntegrationQuery(event.target.value)} placeholder="Search apps, tools, or categories" /></label>
                  <div className="integration-filter-pills" aria-label="Filter app catalog">
                    {INTEGRATION_GROUPS.map((group) => <button type="button" key={group.id} className={integrationGroup === group.id ? 'selected' : ''} onClick={() => setIntegrationGroup(group.id)}>{group.label}</button>)}
                  </div>
                </div>
                <div className="integration-results-label"><span>{filteredIntegrations.length} {filteredIntegrations.length === 1 ? 'APP' : 'APPS'}</span><span>CATALOG ONLY · LIVE CONNECTIONS OFF</span></div>
                {filteredIntegrations.length === 0 ? (
                  <div className="connections-empty"><Search size={18} /><strong>No apps match that search.</strong><span>Try a different name or category.</span></div>
                ) : (
                  <div className="integration-grid">
                    {filteredIntegrations.map((integration) => {
                      const requested = connectionRequests.some((item) => item.id === integration.id);
                      return (
                        <article className={`integration-card ${requested ? 'integration-requested' : ''}`} key={integration.id}>
                          <div className="integration-card-head"><div className="integration-mark" style={{ '--app-color': integration.color, '--app-surface': integration.surface }}>{integration.brand}</div>{requested ? <span className="requested-label"><Check size={11} /> PRIORITY</span> : <span className="needs-setup-label">SETUP NEEDED</span>}</div>
                          <div className="integration-type">{integration.type}</div>
                          <h3>{integration.name}</h3>
                          <p>{integration.description}</p>
                          <div className="integration-card-footer"><span className="integration-method"><LockKeyhole size={11} /> {integration.method}</span><button type="button" className="integration-view-button" onClick={() => setSelectedIntegration(integration)}>{requested ? 'View setup' : 'Connect'} <ChevronRight size={14} /></button></div>
                        </article>
                      );
                    })}
                  </div>
                )}
                <div className="connections-footnote"><ShieldCheck size={14} /><span>Never paste passwords or API keys here. Production connections need provider OAuth consent, a secure backend, and least-privilege scopes.</span></div>
              </section>
            )}

            {activeTab === 'router' && (
              <section className="content-page model-router-page">
                <SectionHeading
                  eyebrow="API + LOCAL MODEL ROUTING"
                  title={<>Design a route,<br /><em>keep Julien honest.</em></>}
                  description="Create model profiles, decide which kinds of work they could handle, and export a portable router config. Ask in chat to open this builder again."
                  action={<button type="button" className="button-primary" onClick={() => setModelProfileModal({ kind: 'create' })}><Plus size={15} /> Add profile</button>}
                />

                <div className="model-router-runtime-banner">
                  <span className="model-router-runtime-icon"><Cpu size={19} /></span>
                  <div className="model-router-runtime-copy"><div className="eyebrow">CURRENT RUNTIME STATUS</div><strong>Configuration and route preview only · No inference runtime</strong><p>{qwenLocalProfile ? (qwenLocalProfile.enabled === false ? `The Qwen profile is paused${qwenPrimaryRouteCount ? ` but remains configured for ${qwenPrimaryRouteCount} route${qwenPrimaryRouteCount === 1 ? '' : 's'}` : ''}; previews will skip it.` : qwenPrimaryRouteCount ? `The Qwen3.5-9B-Abliterated profile is the primary target for ${qwenPrimaryRouteCount} task route${qwenPrimaryRouteCount === 1 ? '' : 's'}.` : 'The Qwen3.5-9B-Abliterated profile is saved but is not currently a primary route.') : 'The Qwen3.5-9B-Abliterated preset is not installed in this router.'} Its Hugging Face link is metadata only: Julien does not download weights. A compatible AI-agent backend must load the model and serve the configured local endpoint. This browser does not call local endpoints or send chat content to a model; API credentials are only needed later by a trusted runtime. Export the router config for that runtime to consume—Julien does not sync it to a backend.</p></div>
                  <span className="model-router-runtime-pill"><span /> NOT CONNECTED</span>
                </div>

                <div className="model-router-stats">
                  <div><strong>{modelProfiles.filter((profile) => profile.kind === 'api').length}</strong><small>API PROFILES</small></div>
                  <div><strong>{modelProfiles.filter((profile) => profile.kind === 'local').length}</strong><small>LOCAL PROFILES</small></div>
                  <div><strong>{routerConfig.routes.filter((route) => route.primaryProfileId || route.fallbackProfileId).length}</strong><small>EXPLICIT ROUTES</small></div>
                  <div><strong>{modelProfiles.filter((profile) => profile.enabled !== false).length}</strong><small>ENABLED FOR PREVIEW</small></div>
                </div>

                <section className="model-router-section">
                  <div className="model-router-section-head">
                    <div><div className="eyebrow">SAVED LOCALLY · SECRET VALUES EXCLUDED</div><h2>Model profiles</h2><p>Provider/model identifiers and endpoint URLs are config only. API credential references store environment-variable names—not secret values.</p></div>
                    <div className="extension-section-actions model-router-section-actions">
                      <input ref={modelRouterImportRef} className="visually-hidden-file" type="file" accept="application/json,.json" onChange={importModelRouter} />
                      <button type="button" className="button-secondary extension-small-button" onClick={() => modelRouterImportRef.current?.click()}><Upload size={14} /> Import config</button>
                      <button type="button" className="button-secondary extension-small-button" onClick={exportModelRouter}><Download size={14} /> Export config</button>
                      {!modelProfiles.some((profile) => profile.kind === 'local' && profile.model === QWEN_LOCAL_MODEL_PRESET.model) && <button type="button" className="button-secondary extension-small-button qwen-preset-button" onClick={addQwenModelPreset}><Cpu size={14} /> Use Qwen local preset</button>}
                      <button type="button" className="button-primary extension-small-button" onClick={() => setModelProfileModal({ kind: 'create' })}><Plus size={14} /> Add profile</button>
                    </div>
                  </div>
                  {modelProfiles.length === 0 ? (
                    <div className="extension-empty-state model-router-empty"><span className="extension-empty-icon model-router-empty-icon"><Cpu size={18} /></span><div><strong>No model profiles yet</strong><p>Add a provider profile to build route previews. This saves configuration only; nothing contacts that endpoint.</p></div><button type="button" className="button-secondary" onClick={() => setModelProfileModal({ kind: 'create' })}><Plus size={14} /> Add first profile</button></div>
                  ) : (
                    <div className="model-profile-grid">
                      {modelProfiles.map((profile) => (
                        <article className={`model-profile-card ${profile.enabled === false ? 'model-profile-paused' : ''}`} key={profile.id}>
                          <div className="model-profile-card-head">
                            <span className={`model-profile-icon ${profile.kind === 'local' ? 'model-local-icon' : 'model-api-icon'}`}>{profile.kind === 'local' ? <Server size={16} /> : <Cpu size={16} />}</span>
                            <div className="model-profile-title"><h3>{profile.name}</h3><small>{profile.providerName} · {profile.kind === 'local' ? 'LOCAL' : 'API'}</small></div>
                            <span className={`model-profile-status ${profile.enabled === false ? 'model-profile-status-paused' : ''}`}>{profile.enabled === false ? 'PAUSED' : 'SAVED'}</span>
                          </div>
                          <div className="model-profile-detail"><span>MODEL ID</span><code>{profile.model}</code></div>
                          {profile.sourceUrl && <div className="model-profile-source"><span>MODEL CARD / REPOSITORY</span><a href={profile.sourceUrl} target="_blank" rel="noopener noreferrer">Open source page <ArrowUpRight size={12} /></a></div>}
                          <div className="model-profile-detail"><span>BASE ENDPOINT</span><code>{profile.baseUrl}</code></div>
                          <div className="model-profile-auth">{profile.kind === 'api' ? <><LockKeyhole size={12} /><span>ENV NAME · <code>{profile.apiKeyEnv || 'not set'}</code> · value not stored</span></> : <><Server size={12} /><span>LOCAL PROFILE · endpoint is never called from this browser</span></>}</div>
                          <div className="model-profile-actions">
                            <label className="extension-include-control"><button type="button" role="switch" aria-checked={profile.enabled !== false} aria-label={`${profile.enabled === false ? 'Enable' : 'Pause'} ${profile.name}`} className={`toggle ${profile.enabled !== false ? 'on' : ''}`} onClick={() => toggleModelProfile(profile.id)}><span /></button><span>{profile.enabled === false ? 'Paused' : 'Available to previews'}</span></label>
                            <button type="button" className="extension-icon-button" aria-label={`Edit ${profile.name}`} onClick={() => setModelProfileModal({ kind: 'edit', profile })}><PenLine size={14} /></button>
                            <button type="button" className="extension-icon-button delete-extension-button" aria-label={`Remove ${profile.name}`} onClick={() => deleteModelProfile(profile.id)}><Trash2 size={14} /></button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="model-router-section model-routes-section">
                  <div className="model-router-section-head">
                    <div><div className="eyebrow">POLICY · TASK TARGETS · PREVIEW</div><h2>Routing rules</h2><p>Automatic selection is a saved policy preview, not an active chat connection. Private / sensitive work is always local-only and has no API fallback.</p></div>
                    <label className="model-policy-select"><span>DEFAULT POLICY</span><select value={routerConfig.policy} onChange={(event) => changeRouterPolicy(event.target.value)}>{ROUTER_POLICIES_LIST.map((policy) => <option key={policy.id} value={policy.id}>{policy.label}</option>)}</select></label>
                  </div>
                  <div className="model-policy-description">{ROUTER_POLICIES_LIST.find((policy) => policy.id === routerConfig.policy)?.description}</div>
                  <div className="model-route-grid">
                    {ROUTER_TASKS.map((task) => {
                      const route = routerConfig.routes.find((item) => item.task === task.id) ?? { task: task.id, primaryProfileId: '', fallbackProfileId: '' };
                      const preview = resolveRoutePreview(routerConfig, modelProfiles, task.id);
                      const eligibleProfiles = modelProfiles.filter((profile) => task.id !== 'private' || profile.kind === 'local');
                      return (
                        <article className={`model-route-card ${task.id === 'private' ? 'model-private-route-card' : ''}`} key={task.id}>
                          <div className="model-route-card-heading"><div><span className="model-route-task-icon">{task.id === 'private' ? <LockKeyhole size={15} /> : <Cpu size={15} />}</span><h3>{task.label}</h3></div>{task.id === 'private' && <span className="model-private-badge">LOCAL ONLY</span>}</div>
                          <p>{task.description}</p>
                          <label className="field-label" htmlFor={`route-primary-${task.id}`}>Primary profile</label>
                          <select id={`route-primary-${task.id}`} value={route.primaryProfileId || ''} onChange={(event) => changeRouteProfile(task.id, 'primaryProfileId', event.target.value)}><option value="">{routerConfig.policy === 'manual' ? 'None · choose manually' : 'Automatic · use policy preview'}</option>{eligibleProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.enabled === false ? ' · paused' : ''}</option>)}</select>
                          <label className="field-label" htmlFor={`route-fallback-${task.id}`}>Fallback profile</label>
                          <select id={`route-fallback-${task.id}`} value={route.fallbackProfileId || ''} onChange={(event) => changeRouteProfile(task.id, 'fallbackProfileId', event.target.value)}><option value="">No explicit fallback</option>{eligibleProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.enabled === false ? ' · paused' : ''}</option>)}</select>
                          <div className={`model-route-preview ${preview.profile?.kind === 'local' ? 'model-route-preview-local' : ''}`}><span><span /> ROUTE PREVIEW · NOT ACTIVE</span><strong>{preview.profile ? `${preview.profile.name} · ${preview.profile.model}` : 'No model target'}</strong><small>{preview.reason}</small></div>
                        </article>
                      );
                    })}
                  </div>
                  <p className="extension-note model-router-footnote"><ShieldCheck size={13} /> API-first never changes the private route. If no local model is configured for sensitive work, Julien keeps its built-in local behavior rather than falling back to an API.</p>
                </section>
              </section>
            )}

            {activeTab === 'extensions' && (
              <section className="content-page extensions-page">
                <SectionHeading
                  eyebrow="MCP & PLUGIN LAYER"
                  title={<>Extend Julien,<br /><em>with care.</em></>}
                  description="Configure MCP server profiles and declarative plugin manifests. Review what they request, export them to a compatible host, and keep every permission visible."
                  action={<button type="button" className="button-primary" onClick={() => setMcpServerModal({ kind: 'create' })}><Plus size={15} /> Add MCP server</button>}
                />

                <div className="extension-runtime-banner">
                  <span className="extension-runtime-icon"><Server size={18} /></span>
                  <div className="extension-runtime-copy"><div className="eyebrow">RUNTIME STATUS</div><strong>No MCP host attached</strong><p>This browser-only build saves configuration but cannot launch STDIO processes, call remote MCP tools, or execute plugin code. Export profiles to a compatible trusted host to connect them.</p></div>
                  <span className="extension-host-pill"><span /> HOST REQUIRED</span>
                </div>

                <div className="extension-stats-grid">
                  <div><strong>{mcpServers.length}</strong><small>MCP PROFILES</small></div>
                  <div><strong>{mcpServers.filter((server) => server.enabled !== false).length}</strong><small>IN CONFIG EXPORT</small></div>
                  <div><strong>{pluginManifests.length}</strong><small>PLUGIN MANIFESTS</small></div>
                  <div><strong>{CORE_MODULES.length}</strong><small>LOCAL MODULES</small></div>
                </div>

                <section className="extension-section mcp-profiles-section">
                  <div className="extension-section-head">
                    <div><div className="eyebrow">MODEL CONTEXT PROTOCOL</div><h2>MCP server profiles</h2><p>Save STDIO or Streamable HTTP settings for export. Credentials are never entered or stored here.</p></div>
                    <div className="extension-section-actions">
                      <input ref={mcpImportRef} className="visually-hidden-file" type="file" accept="application/json,.json" onChange={importMcpConfig} />
                      <button type="button" className="button-secondary extension-small-button" onClick={() => mcpImportRef.current?.click()}><Upload size={14} /> Import config</button>
                      <button type="button" className="button-secondary extension-small-button" onClick={() => copyText(JSON.stringify(buildMcpClientConfig(mcpServers), null, 2))}><Copy size={14} /> Copy config</button>
                      <button type="button" className="button-primary extension-small-button" onClick={exportMcpConfig}><Download size={14} /> Export config</button>
                    </div>
                  </div>
                  {mcpServers.length === 0 ? (
                    <div className="extension-empty-state"><span className="extension-empty-icon"><Server size={18} /></span><div><strong>No MCP profiles yet</strong><p>Add a server profile or import an existing host config. Imported environment values are discarded; only variable names are kept.</p></div><button type="button" className="button-secondary" onClick={() => setMcpServerModal({ kind: 'create' })}><Plus size={14} /> Add first server</button></div>
                  ) : (
                    <div className="mcp-profile-grid">
                      {mcpServers.map((server) => (
                        <article className="mcp-profile-card" key={server.id}>
                          <div className="mcp-profile-card-head"><span className="mcp-profile-icon"><Server size={16} /></span><div className="mcp-profile-title"><h3>{server.name}</h3><small>{server.id}</small></div><span className={`mcp-transport-badge ${server.transport === 'stdio' ? 'stdio-badge' : 'http-badge'}`}>{server.transport === 'stdio' ? 'STDIO' : 'STREAMABLE HTTP'}</span></div>
                          <div className="mcp-profile-config"><span>{server.transport === 'stdio' ? 'COMMAND' : 'ENDPOINT'}</span><code>{server.transport === 'stdio' ? server.command : server.url}</code>{server.transport === 'stdio' && server.args?.length > 0 && <><span>ARGUMENTS</span><code>{server.args.join('\n')}</code></>}{server.transport === 'stdio' && server.envKeys?.length > 0 && <><span>ENVIRONMENT NAMES · VALUES NOT STORED</span><div className="env-key-list">{server.envKeys.map((key) => <code key={key}>{key}</code>)}</div></>}</div>
                          <div className="mcp-profile-status"><span className="profile-status-dot" /> SAVED PROFILE · NOT CONNECTED</div>
                          <div className="mcp-profile-actions"><label className="extension-include-control"><button type="button" role="switch" aria-checked={server.enabled !== false} aria-label={`${server.enabled !== false ? 'Exclude' : 'Include'} ${server.name} in config export`} className={`toggle ${server.enabled !== false ? 'on' : ''}`} onClick={() => toggleMcpServer(server.id)}><span /></button><span>{server.enabled !== false ? 'Included in export' : 'Excluded from export'}</span></label><button type="button" className="extension-icon-button" aria-label={`Edit ${server.name}`} onClick={() => setMcpServerModal({ kind: 'edit', server })}><PenLine size={14} /></button><button type="button" className="extension-icon-button delete-extension-button" aria-label={`Remove ${server.name}`} onClick={() => deleteMcpServer(server.id)}><Trash2 size={14} /></button></div>
                        </article>
                      ))}
                    </div>
                  )}
                  <p className="extension-note"><LockKeyhole size={13} /> STDIO commands are only written to a config file; Julien does not execute them. For remote servers, use host-managed authentication instead of putting a token in a URL.</p>
                </section>

                <section className="extension-section plugin-manifests-section">
                  <div className="extension-section-head">
                    <div><div className="eyebrow">SAFE EXTENSION DESCRIPTORS</div><h2>Plugin manifests</h2><p>Create permission-scoped metadata for plugins that a trusted host can review. No code is installed or run in Julien.</p></div>
                    <div className="extension-section-actions">
                      <input ref={pluginImportRef} className="visually-hidden-file" type="file" accept="application/json,.json" onChange={importPluginManifest} />
                      <button type="button" className="button-secondary extension-small-button" onClick={() => pluginImportRef.current?.click()}><Upload size={14} /> Import manifest</button>
                      <button type="button" className="button-secondary extension-small-button" onClick={exportPluginRegistry}><Download size={14} /> Export registry</button>
                      <button type="button" className="button-primary extension-small-button" onClick={() => setPluginManifestModal({ kind: 'create' })}><Plus size={14} /> Create manifest</button>
                    </div>
                  </div>
                  {pluginManifests.length === 0 ? (
                    <div className="extension-empty-state"><span className="extension-empty-icon plugin-empty-icon"><Puzzle size={18} /></span><div><strong>No plugin manifests yet</strong><p>Define a name, link an MCP server, and list the permissions a future host should request.</p></div><button type="button" className="button-secondary" onClick={() => setPluginManifestModal({ kind: 'create' })}><Plus size={14} /> Create manifest</button></div>
                  ) : (
                    <div className="plugin-manifest-grid">
                      {pluginManifests.map((plugin) => {
                        const linkedServer = mcpServers.find((server) => server.id === plugin.serverId);
                        const permissions = PLUGIN_PERMISSION_OPTIONS.filter((permission) => plugin.permissions?.includes(permission.id));
                        return (
                          <article className="plugin-manifest-card" key={plugin.id}>
                            <div className="plugin-manifest-card-head"><span className="plugin-manifest-icon"><Puzzle size={16} /></span><div className="plugin-manifest-title"><h3>{plugin.name}</h3><small>{plugin.id} · v{plugin.version}</small></div><span className={`plugin-status-badge ${plugin.enabled === false ? 'plugin-paused-badge' : ''}`}>{plugin.enabled === false ? 'EXCLUDED' : 'MANIFEST ONLY'}</span></div>
                            <p className="plugin-manifest-description">{plugin.description || 'No description provided.'}</p>
                            <div className="plugin-linked-server"><span>LINKED MCP SERVER</span><strong>{linkedServer?.name ?? 'Not linked'}</strong></div>
                            <div className="plugin-permission-summary"><span>REQUESTED PERMISSIONS</span>{permissions.length ? <div>{permissions.map((permission) => <span className="plugin-permission-chip" key={permission.id}>{permission.label}</span>)}</div> : <small>No permissions declared</small>}</div>
                            <div className="plugin-manifest-actions"><label className="extension-include-control"><button type="button" role="switch" aria-checked={plugin.enabled !== false} aria-label={`${plugin.enabled !== false ? 'Exclude' : 'Include'} ${plugin.name} in registry export`} className={`toggle ${plugin.enabled !== false ? 'on' : ''}`} onClick={() => togglePluginManifest(plugin.id)}><span /></button><span>{plugin.enabled !== false ? 'Included in registry' : 'Excluded from registry'}</span></label><div className="plugin-action-buttons"><button type="button" className="extension-icon-button" aria-label={`Export ${plugin.name}`} title="Export manifest" onClick={() => exportOnePlugin(plugin)}><Download size={14} /></button><button type="button" className="extension-icon-button" aria-label={`Edit ${plugin.name}`} onClick={() => setPluginManifestModal({ kind: 'edit', plugin })}><PenLine size={14} /></button><button type="button" className="extension-icon-button delete-extension-button" aria-label={`Remove ${plugin.name}`} onClick={() => deletePluginManifest(plugin.id)}><Trash2 size={14} /></button></div></div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="extension-section core-modules-section">
                  <div className="extension-section-head core-modules-heading"><div><div className="eyebrow">ALREADY INCLUDED</div><h2>Julien’s local modules</h2><p>These built-in capabilities are available without external connections.</p></div><span className="core-local-pill"><LockKeyhole size={12} /> LOCAL</span></div>
                  <div className="core-module-grid">{CORE_MODULES.map((module) => <article className="core-module-card" key={module.id}><span className={`core-module-icon core-${module.id}-icon`}>{module.id === 'memory' ? <Brain size={16} /> : module.id === 'hands' ? <Zap size={16} /> : <Sparkles size={16} />}</span><div><h3>{module.name}</h3><p>{module.description}</p><span>{module.access}</span></div><CheckCircle2 size={15} className="core-module-check" /></article>)}</div>
                </section>
              </section>
            )}

            {activeTab === 'evolve' && (
              <section className="content-page evolve-page">
                <SectionHeading
                  eyebrow="LEARN, REFLECT, GROW"
                  title={<>Better together,<br /><em>over time.</em></>}
                  description="Julien can learn from your feedback and the shortcuts you teach it. Every lasting change stays visible and under your control."
                />

                <div className="evolution-hero">
                  <div className="evolution-hero-copy"><span className="hero-overline"><span className="hero-live-dot" /> A HUMAN-LED LEARNING LOOP</span><h2>Notice.<br />Reflect. Improve.</h2><p>Rate a reply, teach a reusable skill, or approve a repeated preference. Julien never rewrites its own code or runs arbitrary tools.</p></div>
                  <div className="evolution-loop" aria-label="Feedback, reflection, proposal, approval">
                    <div className="loop-line" />
                    <div className="loop-step"><span>01</span><div className="loop-step-icon"><ThumbsUp size={15} /></div><strong>Signal</strong><small>Your feedback</small></div>
                    <div className="loop-step"><span>02</span><div className="loop-step-icon"><TrendingUp size={15} /></div><strong>Reflect</strong><small>Repeated pattern</small></div>
                    <div className="loop-step"><span>03</span><div className="loop-step-icon"><Sparkles size={15} /></div><strong>Propose</strong><small>Ask your okay</small></div>
                    <div className="loop-step"><span>04</span><div className="loop-step-icon loop-approve"><Check size={15} /></div><strong>Approve</strong><small>You decide</small></div>
                  </div>
                  <div className="evolution-local-tag"><LockKeyhole size={13} /> PERSONAL · LOCAL</div>
                </div>

                <div className="evolution-stats-grid">
                  <div className="evolution-stat"><span className="evolution-stat-icon stat-helpful"><ThumbsUp size={16} /></span><div><strong>{helpfulCount}</strong><small>HELPFUL SIGNALS</small></div></div>
                  <div className="evolution-stat"><span className="evolution-stat-icon stat-improve"><ThumbsDown size={16} /></span><div><strong>{needsWorkCount}</strong><small>IMPROVEMENT SIGNALS</small></div></div>
                  <div className="evolution-stat"><span className="evolution-stat-icon stat-skills"><Zap size={16} /></span><div><strong>{skills.filter((skill) => skill.enabled).length}</strong><small>ACTIVE SKILLS</small></div></div>
                  <div className="evolution-stat"><span className="evolution-stat-icon stat-approved"><Check size={16} /></span><div><strong>{learningProfile.updatedAt ? 'Personalized' : 'Balanced'}</strong><small>WORKING STYLE</small></div></div>
                </div>

                <section className="classifier-card">
                  <div className="classifier-card-head">
                    <span className="classifier-icon"><Cpu size={18} /></span>
                    <div><div className="eyebrow">IN-BUILT · ON-DEVICE</div><h2>Probabilistic intent router</h2></div>
                    <span className="classifier-local-badge"><span /> NO NETWORK</span>
                  </div>
                  <p className="classifier-description">A compact Naive Bayes model scores each message locally. It uses sparse word and phrase features, then requires a confident match—and an explicit command cue—before any action is routed.</p>
                  <div className="classifier-metrics">
                    <div><strong>{classifierHistory.length}</strong><small>MESSAGES SCORED</small></div>
                    <div><strong>{routedActionCount}</strong><small>ACTIONS ROUTED</small></div>
                    <div><strong>{averageClassifierMs.toFixed(2)}<em>ms</em></strong><small>MEAN INFERENCE</small></div>
                    <div className="classifier-last-metric"><strong>{latestClassification ? (latestClassification.highConfidence ? `${latestClassification.label} · ${confidencePercent(latestClassification.confidence)}` : latestClassification.predictedIntent !== 'conversation' ? `Held · ${latestClassification.predictedLabel}` : 'Conversation') : 'Waiting'}</strong><small>LAST ROUTE</small></div>
                  </div>
                  {latestClassification && !latestClassification.highConfidence && ['save_memory', 'forget_memory', 'task', 'calendar', 'draft', 'focus'].includes(latestClassification.predictedIntent) && <div className="classifier-safety-note"><ShieldCheck size={13} /> A possible action was held until the intent is clearer and meets the safety threshold.</div>}
                </section>

                <div className="evolution-panels">
                  <section className="evolution-card working-style-card">
                    <div className="evolution-card-head"><div><div className="eyebrow">YOUR APPROVED DEFAULTS</div><h2>Working style</h2></div><span className="style-live-tag"><span /> ACTIVE</span></div>
                    <p>Choose what feels right now, or wait for Julien to suggest a change after repeated feedback.</p>
                    <div className="style-select-row"><label htmlFor="reply-length">Reply length</label><select id="reply-length" value={learningProfile.brevity} onChange={(event) => updateLearningPreference('brevity', event.target.value)}><option value="balanced">Balanced</option><option value="concise">Concise</option><option value="detailed">More detail</option></select></div>
                    <div className="style-select-row"><label htmlFor="reply-tone">Tone</label><select id="reply-tone" value={learningProfile.tone} onChange={(event) => updateLearningPreference('tone', event.target.value)}><option value="balanced">Balanced</option><option value="warm">Warmer</option><option value="direct">More direct</option></select></div>
                    <div className="style-footnote"><LockKeyhole size={13} /> Stored here and applied to supported built-in replies.</div>
                  </section>

                  <section className="evolution-card proposals-card">
                    <div className="evolution-card-head"><div><div className="eyebrow">REPEATED SIGNALS · YOUR CHOICE</div><h2>Learning proposals</h2></div><span className="proposal-count">{learningProposals.length}</span></div>
                    {learningProposals.length ? (
                      <div className="proposal-list">
                        {learningProposals.map((proposal) => (
                          <article className="proposal-item" key={proposal.value}>
                            <div className="proposal-icon"><Sparkles size={16} /></div>
                            <div className="proposal-copy"><strong>{proposal.label}</strong><p>{proposal.description} Based on {proposal.count} replies you marked for improvement.</p></div>
                            <div className="proposal-actions"><button type="button" className="proposal-approve" onClick={() => approveLearning(proposal)}><Check size={13} /> Approve</button><button type="button" className="proposal-dismiss" onClick={() => dismissLearning(proposal)}>Not now</button></div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="proposal-empty"><span><TrendingUp size={17} /></span><div><strong>No pending proposals</strong><p>Rate a few replies in Chat. Two similar “Improve” signals can become a suggestion—never an automatic change.</p></div></div>
                    )}
                  </section>
                </div>

                <section className="evolution-card skills-library-card">
                  <div className="evolution-card-head skills-library-head"><div><div className="eyebrow">USER-TAUGHT SHORTCUTS</div><h2>Personal skills</h2></div><div className="evolve-skill-actions"><button type="button" className="button-secondary" onClick={() => { setSkillPageTab('marketplace'); navigate('skills'); }}><Sparkles size={14} /> Marketplace</button><button type="button" className="button-primary" onClick={() => setEvolutionModal({ type: 'skill' })}><Plus size={15} /> Teach a skill</button></div></div>
                  <p className="skills-intro">Build small reusable workflows from Julien’s existing local tools. A skill runs only when you call its phrase.</p>
                  {skills.length === 0 ? (
                    <div className="skills-empty"><span><Zap size={17} /></span><div><strong>No skills taught yet</strong><p>For example: when you say “weekly reset”, add a reminder to review your priorities.</p></div><button type="button" onClick={() => setEvolutionModal({ type: 'skill' })}>Create one <ChevronRight size={14} /></button></div>
                  ) : (
                    <div className="skills-list">
                      {skills.map((skill) => (
                        <article className={`skill-item ${skill.enabled ? '' : 'skill-paused'}`} key={skill.id}>
                          <div className="skill-item-icon"><Zap size={16} /></div>
                          <div className="skill-item-copy"><div className="skill-item-title"><strong>{skill.name}</strong><span className="skill-trigger">“{skill.trigger}”</span></div><p>{skill.actionType === 'task' ? `Add reminder: ${skill.actionText}` : skill.actionType === 'memory' ? `Save memory: ${skill.actionText}` : 'Start a 25-minute focus session'}</p></div>
                          <button type="button" role="switch" aria-checked={skill.enabled} aria-label={`${skill.enabled ? 'Pause' : 'Enable'} ${skill.name}`} className={`toggle skill-toggle ${skill.enabled ? 'on' : ''}`} onClick={() => toggleSkill(skill.id)}><span /></button>
                          <button type="button" className="skill-delete" aria-label={`Delete skill: ${skill.name}`} onClick={() => deleteSkill(skill.id)}><Trash2 size={14} /></button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <div className="evolution-privacy-note"><LockKeyhole size={14} /><span>Feedback and skills stay in this browser. Julien asks before adopting a new standing preference; skills can be paused or removed any time.</span></div>
              </section>
            )}

            {activeTab === 'soul' && (
              <section className="content-page soul-page">
                <SectionHeading
                  eyebrow="JULIEN · DURABLE CHARTER"
                  title={<>The soul of<br /><em>{SOUL_NAME}.</em></>}
                  description="A stable purpose and operating standard across models, tools, and environments. The charter is an aspiration; current capabilities and evidence stay explicit."
                />
                <article className="soul-purpose-card">
                  <div className="soul-purpose-icon"><Sparkles size={21} /></div>
                  <div className="soul-purpose-copy"><div className="eyebrow">PURPOSE · CHARTER v{SOUL_VERSION}</div><h2>Understand intentions.<br /><em>Deliver verified outcomes.</em></h2><p>{SOUL_PURPOSE}</p></div>
                  <span className="soul-purpose-mark"><ShieldCheck size={18} /></span>
                </article>
                <div className="soul-identity-note"><span className="soul-identity-icon"><UserRound size={17} /></span><div><strong>One continuous agent</strong><p>Julien’s identity is defined by its purpose and principles—not by a particular model, tool, or runtime.</p></div><span className="soul-version-pill">SOUL · {SOUL_VERSION}</span></div>
                <div className="soul-principles-grid">
                  {SOUL_PRINCIPLES.map((principle) => (
                    <article className={`soul-principle-card soul-${principle.id}`} key={principle.id}>
                      <span className="soul-principle-icon">{principle.icon === 'identity' ? <UserRound size={17} /> : principle.icon === 'mind' ? <Brain size={17} /> : principle.icon === 'will' ? <Zap size={17} /> : principle.icon === 'memory' ? <BookOpen size={17} /> : principle.icon === 'evolution' ? <TrendingUp size={17} /> : <ShieldCheck size={17} />}</span>
                      <div><div className="soul-principle-index">{String(SOUL_PRINCIPLES.indexOf(principle) + 1).padStart(2, '0')} · PRINCIPLE</div><h3>{principle.title}</h3><p>{principle.text}</p></div>
                    </article>
                  ))}
                </div>
                <section className="soul-integrity-card">
                  <div className="soul-section-heading"><div><div className="eyebrow">INTEGRITY · OUTCOME LANGUAGE</div><h2>Intent is not completion.</h2><p>Use the strongest status supported by evidence—never a stronger one.</p></div><span className="soul-integrity-badge"><ShieldCheck size={14} /> ALWAYS ON</span></div>
                  <div className="soul-outcome-steps">{OUTCOME_STATES.map((state, index) => <article className={`soul-outcome-step soul-step-${state.id}`} key={state.id}><span className="soul-outcome-number">0{index + 1}</span><div><strong>{state.label}</strong><p>{state.detail}</p></div></article>)}</div>
                  <p className="soul-integrity-rule"><LockKeyhole size={14} /><span>Proposed ≠ executed. A successful command ≠ a verified result. An intention ≠ a completed task.</span></p>
                </section>
                <section className="soul-scope-card">
                  <div className="soul-section-heading"><div><div className="eyebrow">CURRENT IMPLEMENTATION · HONEST SCOPE</div><h2>What Julien can verify today</h2><p>These counts describe this local browser workspace, not external work.</p></div><span className="soul-local-pill"><span /> LOCAL PROTOTYPE</span></div>
                  <div className="soul-evidence-stats"><div><strong>{memories.length}</strong><span>LOCAL MEMORIES</span></div><div><strong>{tasks.length}</strong><span>REMINDERS</span></div><div><strong>{skills.length}</strong><span>INSTALLED SKILLS</span></div><div><strong>0</strong><span>LIVE EXTERNAL RUNTIMES</span></div></div>
                  <p className="soul-scope-copy">{SOUL_CURRENT_SCOPE}</p>
                </section>
              </section>
            )}

            {activeTab === 'settings' && (
              <section className="content-page settings-page">
                <SectionHeading eyebrow="YOUR SPACE, YOUR RULES" title={<>Settings &<br /> <em>privacy.</em></>} description="A few small choices for how Julien works with you." />
                <div className="settings-grid">
                  <article className="settings-card settings-voice-card">
                    <div className="settings-card-icon voice-settings-icon"><Volume2 size={18} /></div>
                    <div className="settings-card-copy"><div className="settings-card-top"><h2>Voice & conversation</h2><span className="setting-label">SPEECH</span></div><p>Use your browser’s built-in voice tools. You can listen to a reply or let Julien read new replies aloud.</p>
                      <div className="setting-row"><span><strong>Read replies aloud</strong><small>Uses your device’s speech synthesis.</small></span><button type="button" role="switch" aria-checked={Boolean(settings.autoSpeak)} className={`toggle ${settings.autoSpeak ? 'on' : ''}`} onClick={toggleAutoSpeak}><span /></button></div>
                      <div className="setting-row voice-support-row"><span><strong>Voice input</strong><small>Available when supported by your browser.</small></span><span className="browser-support"><Mic size={14} /> Browser managed</span></div>
                    </div>
                  </article>

                  <article className="settings-card settings-privacy-card">
                    <div className="settings-card-icon privacy-settings-icon"><ShieldCheck size={18} /></div>
                    <div className="settings-card-copy"><div className="settings-card-top"><h2>Local data</h2><span className="setting-label green-label">ON THIS DEVICE</span></div><p>Memories, reminders, plans, drafts, conversations, skills, connection priorities, MCP profiles, plugin manifests, and model-router profiles/config are kept in this browser’s local storage. Environment-variable names may be saved, but secret values and account credentials are not. No external model or tool runtime is connected in this build.</p>
                      <div className="data-counts"><div><strong>{memories.length}</strong><span>MEMORIES</span></div><div><strong>{openTasks.length}</strong><span>OPEN REMINDERS</span></div><div><strong>{drafts.length}</strong><span>DRAFTS</span></div><div><strong>{skills.length}</strong><span>SKILLS</span></div></div>
                      <button type="button" className="settings-link-button" onClick={exportData}><Download size={15} /> Export my data <ArrowUpRight size={14} /></button>
                    </div>
                  </article>

                  <article className="settings-card settings-agent-card">
                    <div className="settings-card-icon agent-settings-icon"><Sparkles size={18} /></div>
                    <div className="settings-card-copy"><div className="settings-card-top"><h2>About Julien</h2><span className="setting-label">LOCAL PROTOTYPE</span></div><p>Julien can organize memories, reminders, local planning blocks, message drafts, and a focus timer. It can learn from explicit feedback, run shortcuts you teach it, and prepare API/local model profiles with route previews. Model-router profiles do not call models; connections, MCP profiles, and plugin manifests also need a trusted external runtime that is not connected in this build.</p><div className="capability-tags"><span><Check size={12} /> Memory</span><span><Check size={12} /> Local actions</span><span><Check size={12} /> Voice controls</span><span><Check size={12} /> Approved learning</span><span><Cpu size={12} /> Model config only</span></div><button type="button" className="settings-link-button" onClick={() => navigate('soul')}><ShieldCheck size={14} /> Read Julien’s Soul charter <ArrowUpRight size={14} /></button></div>
                  </article>

                  <article className="settings-card settings-reset-card">
                    <div className="settings-card-copy"><div className="settings-card-top"><h2>Start fresh</h2><span className="setting-label danger-label">IRREVERSIBLE</span></div><p>Remove all Julien data stored in this browser, including conversations, feedback, skills, and learning preferences.</p><button type="button" className="reset-button" onClick={() => openModal('clear')}><Trash2 size={15} /> Clear this workspace</button></div>
                  </article>
                </div>
              </section>
            )}
          </main>

          {activeTab === 'chat' && (
            <RightRail
              memories={memories}
              tasks={tasks}
              events={events}
              focusRunning={focusRunning}
              focusRemaining={focusRemaining}
              onGoMemory={() => navigate('memory')}
              onAddTask={() => openModal('task')}
              onToggleTask={toggleTask}
            />
          )}
        </div>
      </div>

      {modal && <ActionModal key={`${modal.type}-${modal.seed?.text ?? ''}`} modal={modal} onClose={() => setModal(null)} onSubmit={handleModalSubmit} onClear={handleClearWorkspace} />}
      {evolutionModal && <EvolutionModal key={`${evolutionModal.type}-${evolutionModal.seed?.messageId ?? ''}`} modal={evolutionModal} onClose={() => setEvolutionModal(null)} onSubmit={handleEvolutionSubmit} />}
      {selectedIntegration && <IntegrationModal key={selectedIntegration.id} integration={selectedIntegration} requested={connectionRequests.some((item) => item.id === selectedIntegration.id)} onRequest={toggleConnectionRequest} onClose={() => setSelectedIntegration(null)} />}
      {modelProfileModal && <ModelProfileModal key={modelProfileModal.profile?.id ?? 'new-model-profile'} initial={modelProfileModal.kind === 'edit' ? modelProfileModal.profile : null} existingProfiles={modelProfiles} onSave={saveModelProfile} onClose={() => setModelProfileModal(null)} />}
      {mcpServerModal && <McpServerModal key={mcpServerModal.server?.id ?? 'new-server'} initial={mcpServerModal.kind === 'edit' ? mcpServerModal.server : null} existingServers={mcpServers} onSave={saveMcpServer} onClose={() => setMcpServerModal(null)} />}
      {pluginManifestModal && <PluginManifestModal key={pluginManifestModal.plugin?.id ?? 'new-plugin'} initial={pluginManifestModal.kind === 'edit' ? pluginManifestModal.plugin : null} mcpServers={mcpServers} existingPlugins={pluginManifests} onSave={savePluginManifest} onClose={() => setPluginManifestModal(null)} />}
      {githubSkillModal && <GithubSkillModal onClose={() => setGithubSkillModal(false)} onImported={handleGithubSkillImport} />}
      {pendingSkillUpdate && <SkillUpdateModal key={pendingSkillUpdate.skillId} skill={skills.find((item) => item.id === pendingSkillUpdate.skillId)} update={pendingSkillUpdate} onClose={() => setPendingSkillUpdate(null)} onApply={approveSkillUpdate} />}
      {toast && <div className="toast-message" role="status"><span className="toast-check"><Check size={14} /></span>{toast}</div>}
    </div>
  );
}

export default App;
