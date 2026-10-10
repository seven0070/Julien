const TRAINING_EXAMPLES = {
  save_memory: [
    'remember that I prefer concise updates',
    'please remember my writing preferences',
    'keep in mind that mornings are for focus',
    'save this as a memory about my project',
    'note that I like a warm tone',
    'I want you to remember this detail',
    'remember I work on design on Fridays',
    'save that I prefer direct answers',
  ],
  memory_query: [
    'what do you remember about me',
    'what have you remembered so far',
    'show me my memories',
    'list my saved memories',
    'what do you know about my preferences',
    'tell me what I asked you to keep in mind',
    'show the things you remember',
    'what details have I shared with you',
  ],
  forget_memory: [
    'forget that I like concise answers',
    'remove that memory about my project',
    'please forget my old preference',
    'delete the memory about Sam',
    'erase what I told you about work',
    'I changed my mind, forget that detail',
    'remove that from your memory',
    'forget the thing I asked you to remember',
  ],
  task: [
    'remind me to call the dentist tomorrow',
    'add a task to buy groceries',
    'please add a reminder to email Sam',
    'I need to book a table tonight',
    'do not let me forget to pay the bill',
    'remember to send the report on Friday',
    'put this on my to do list',
    'create a reminder to take a break',
  ],
  calendar: [
    'schedule a meeting with Alex tomorrow',
    'put lunch on my calendar at noon',
    'block time for focused work this afternoon',
    'add an event to my calendar on Friday',
    'create a calendar block for a walk',
    'schedule 30 minutes for planning',
    'make time on my calendar for a review',
    'book a planning block for next week',
  ],
  draft: [
    'draft an email to Maya about the proposal',
    'write a message to my manager saying I will be late',
    'compose a short email about the meeting',
    'prepare an email to Sam regarding the project',
    'help me draft a note to the team',
    'write me an email with subject project update',
    'start a message to my friend about dinner',
    'draft a response to this email',
  ],
  focus: [
    'start a focus session',
    'begin a focus timer for 25 minutes',
    'start focus mode now',
    'I want to start a focus block',
    'begin my focus timer',
    'start a 25 minute focus session',
  ],
  plan: [
    'help me plan my day',
    'organize my day for today',
    'what should I do today',
    'structure my day around these tasks',
    'can you help me plan the day',
    'make a simple plan for today',
    'help me organize today',
  ],
  model_router: [
    'create a model router for local and API models',
    'build an API and local model gateway',
    'set up a model router with API and local providers',
    'develop my model routing gateway',
    'configure model routing for multiple providers',
  ],
  help: [
    'what can you do',
    'how can you help me',
    'show me your capabilities',
    'what are your features',
    'tell me how to use this assistant',
    'help me get started with Julien',
    'what kinds of actions can you take',
  ],
  gratitude: [
    'thanks for your help',
    'thank you, I appreciate it',
    'thanks Julien',
    'that is helpful, thanks',
    'appreciate it',
    'thank you so much',
  ],
  conversation: [
    'I feel a little overwhelmed today',
    'help me think through a difficult decision',
    'I want to talk about a project idea',
    'can you help me brainstorm',
    'I had a rough day and need to talk',
    'what do you think about this idea',
    'tell me a little about how you work',
    'I am not sure what to do next',
    'could you give me some perspective',
    'lets think this through together',
  ],
};

const CUE_RULES = [
  { intent: 'memory_query', pattern: /\b(?:what do you remember|what have you remembered|show (?:me )?(?:my )?memories|list (?:my )?(?:saved )?memories)\b/i, boost: 6.0 },
  { intent: 'forget_memory', pattern: /^\s*(?:(?:please\s+)?|(?:can|could) you (?:please\s+)?)forget\b(?!\s+to\b)|\b(?:remove|delete|erase)\b.*\b(?:memory|memories|that|it|detail|preference|what i told you)\b|\bi changed my mind,\s*forget\b/i, boost: 5.0 },
  { intent: 'task', pattern: /\b(?:remind me|add (?:a )?(?:task|reminder)|don't let me forget|do not let me forget|don't forget to|do not forget to|remember to|to-?do list)\b/i, boost: 5.2 },
  { intent: 'save_memory', pattern: /^\s*(?:(?:please\s+)?(?:remember|save|keep in mind|note)(?: that)?|(?:can|could) you (?:please\s+)?(?:remember|save|keep in mind|note)(?: that)?|i want you to (?:remember|save|keep in mind))\s+(?!to\b)\S+/i, boost: 4.8 },
  { intent: 'draft', pattern: /\b(?:draft|write|compose|prepare)\b.*\b(?:e-?mail|message|note)\b/i, boost: 5.4 },
  { intent: 'calendar', pattern: /\b(?:schedule|block\s+(?:some\s+)?time|put\s+.+\s+on\s+(?:my\s+)?calendar|add\s+.+\s+to\s+(?:my\s+)?calendar|create\s+.+\s+(?:event|calendar block))\b/i, boost: 5.2 },
  { intent: 'focus', pattern: /\b(?:start|begin)\b.*\bfocus\b|\bfocus timer\b/i, boost: 5.0 },
  { intent: 'plan', pattern: /\b(?:plan|organize|structure)\b.*\b(?:day|today)\b|\bwhat should i do today\b/i, boost: 4.6 },
  { intent: 'model_router', pattern: /\b(?:create|build|make|set\s+up|configure|develop|start)\b.{0,80}\b(?:model router|model gateway|model routing gateway|router)\b/i, boost: 7.2 },
  { intent: 'help', pattern: /\b(?:what can you do|how can you help|capabilities|features|help me get started)\b/i, boost: 4.4 },
  { intent: 'gratitude', pattern: /\b(?:thanks|thank you|appreciate it)\b/i, boost: 3.6 },
];

const INTENT_LABELS = {
  save_memory: 'Save memory',
  memory_query: 'Recall memory',
  forget_memory: 'Forget memory',
  task: 'Create reminder',
  calendar: 'Plan time',
  draft: 'Prepare draft',
  focus: 'Start focus',
  plan: 'Plan the day',
  help: 'Show help',
  model_router: 'Open model router',
  gratitude: 'Thanks',
  conversation: 'Conversation',
};

const MUTATING_INTENTS = new Set(['save_memory', 'forget_memory', 'task', 'calendar', 'draft', 'focus']);
const EXPLICIT_CUE_INTENTS = new Set([...MUTATING_INTENTS, 'model_router']);
const ALPHA = 0.55;
const TEMPERATURE = 1.25;
const MODEL = trainModel();

function tokenize(text) {
  const words = String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9'-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const features = [];
  for (let index = 0; index < words.length; index += 1) {
    features.push(`w:${words[index]}`);
    if (index > 0) features.push(`b:${words[index - 1]}_${words[index]}`);
  }
  return features;
}

function trainModel() {
  const classes = new Map();
  const vocabulary = new Set();
  let documents = 0;

  for (const [intent, examples] of Object.entries(TRAINING_EXAMPLES)) {
    const counts = new Map();
    let featureTotal = 0;
    for (const example of examples) {
      documents += 1;
      for (const feature of tokenize(example)) {
        counts.set(feature, (counts.get(feature) ?? 0) + 1);
        vocabulary.add(feature);
        featureTotal += 1;
      }
    }
    classes.set(intent, { documents: examples.length, counts, featureTotal });
  }

  return { classes, vocabulary, documents };
}

function softmax(scores) {
  const max = Math.max(...scores.map((item) => item.score));
  const exponents = scores.map((item) => Math.exp((item.score - max) / TEMPERATURE));
  const total = exponents.reduce((sum, value) => sum + value, 0);
  return scores.map((item, index) => ({ ...item, probability: exponents[index] / total }));
}

/**
 * Small, local multinomial Naive Bayes router with explicit cue boosts.
 * The model is trained once at module load; each inference only visits the
 * message's sparse token features and the compact intent table.
 */
export function classifyIntent(text, { skills = [] } = {}) {
  const startedAt = globalThis.performance?.now?.() ?? Date.now();
  const normalizedText = String(text ?? '').replace(/[’‘]/g, "'");
  const command = normalizedText.toLowerCase()
    .replace(/^[\s,.!?]+/, '')
    .replace(/^(?:please\s+|can you\s+|could you\s+)/, '')
    .trim()
    .replace(/[.!?,]+$/, '')
    .replace(/\s+/g, ' ');
  const matchedSkill = skills.find((skill) => {
    if (!skill.enabled || !skill.trigger) return false;
    const trigger = String(skill.trigger).replace(/[’‘]/g, "'").toLowerCase().replace(/\s+/g, ' ').replace(/^[\s,.!?]+|[\s,.!?]+$/g, '');
    return command === trigger || ['run', 'use', 'do'].some((verb) => command === `${verb} ${trigger}`);
  });
  if (matchedSkill) {
    return {
      intent: 'skill',
      label: 'Personal skill',
      predictedIntent: 'skill',
      predictedLabel: 'Personal skill',
      confidence: 1,
      margin: 1,
      highConfidence: true,
      explicitCue: true,
      reason: 'explicit_skill_trigger',
      skillId: matchedSkill.id,
      elapsedMs: (globalThis.performance?.now?.() ?? Date.now()) - startedAt,
      alternatives: [],
    };
  }

  const features = tokenize(text);
  const observed = new Map();
  for (const feature of features) observed.set(feature, Math.min(2, (observed.get(feature) ?? 0) + 1));

  const scores = [];
  for (const [intent, model] of MODEL.classes) {
    let score = Math.log(model.documents / MODEL.documents);
    const denominator = model.featureTotal + ALPHA * MODEL.vocabulary.size;
    for (const [feature, occurrences] of observed) {
      if (!MODEL.vocabulary.has(feature)) continue;
      const likelihood = (model.counts.get(feature) ?? 0) + ALPHA;
      score += occurrences * Math.log(likelihood / denominator);
    }
    for (const cue of CUE_RULES) {
      if (cue.intent === intent && cue.pattern.test(normalizedText)) score += cue.boost;
    }
    scores.push({ intent, label: INTENT_LABELS[intent], score });
  }

  const ranked = softmax(scores).sort((a, b) => b.probability - a.probability);
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const confidence = winner.probability;
  const margin = confidence - (runnerUp?.probability ?? 0);
  const explicitCue = CUE_RULES.some((cue) => cue.intent === winner.intent && cue.pattern.test(normalizedText));
  const missingActionCue = EXPLICIT_CUE_INTENTS.has(winner.intent) && !explicitCue;
  const highConfidence = confidence >= 0.48
    && margin >= 0.12
    && !missingActionCue;
  const elapsedMs = (globalThis.performance?.now?.() ?? Date.now()) - startedAt;

  return {
    intent: highConfidence ? winner.intent : 'conversation',
    label: highConfidence ? winner.label : 'Conversation',
    predictedIntent: winner.intent,
    predictedLabel: winner.label,
    confidence,
    margin,
    highConfidence,
    explicitCue,
    reason: missingActionCue ? 'explicit_action_cue_required' : highConfidence ? 'confident' : 'low_confidence',
    elapsedMs,
    alternatives: ranked.slice(1, 3).map(({ intent, label, probability }) => ({ intent, label, probability })),
  };
}

export { INTENT_LABELS };
