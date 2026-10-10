import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntent } from '../src/classifier.js';

test('routes clear personal-agent commands with high confidence', () => {
  const cases = [
    ['Remember that I prefer concise answers', 'save_memory'],
    ['What do you remember about my preferences?', 'memory_query'],
    ['Remind me to call the dentist tomorrow', 'task'],
    ["Don’t forget to buy milk tomorrow", 'task'],
    ['Schedule a review for Friday', 'calendar'],
    ['Draft an email to Sam about the project', 'draft'],
    ['Start a focus session', 'focus'],
    ['Help me plan my day', 'plan'],
  ];

  for (const [text, expectedIntent] of cases) {
    const result = classifyIntent(text);
    assert.equal(result.intent, expectedIntent, `${text} should route to ${expectedIntent}`);
    assert.equal(result.highConfidence, true);
    assert.ok(result.confidence > 0.48);
    assert.ok(result.elapsedMs >= 0);
  }
});

test('holds an inferred calendar action when there is no explicit command', () => {
  const result = classifyIntent('What is on my calendar?');
  assert.equal(result.intent, 'conversation');
  assert.equal(result.predictedIntent, 'calendar');
  assert.equal(result.highConfidence, false);
  assert.equal(result.reason, 'explicit_action_cue_required');
});

test('does not turn an inferred to-do into an action without an explicit cue', () => {
  const result = classifyIntent('I need to call the dentist tomorrow');
  assert.equal(result.intent, 'conversation');
  assert.equal(result.predictedIntent, 'task');
  assert.equal(result.highConfidence, false);
  assert.equal(result.reason, 'explicit_action_cue_required');
});

test('keeps open-ended text in the conversation route', () => {
  const result = classifyIntent('I feel a little overwhelmed and want to talk it through');
  assert.equal(result.intent, 'conversation');
  assert.equal(result.predictedIntent, 'conversation');
  assert.equal(result.highConfidence, true);
});

test('opens router setup only for explicit build requests', () => {
  const result = classifyIntent('Please create an API and local model router');
  assert.equal(result.intent, 'model_router');
  assert.equal(result.highConfidence, true);
  const broadRequest = classifyIntent('Can you make me a router for API and local models?');
  assert.equal(broadRequest.intent, 'model_router');
  assert.equal(broadRequest.highConfidence, true);
  const question = classifyIntent('What is a model router?');
  assert.equal(question.intent, 'conversation');
  assert.equal(question.highConfidence, false);
});

test('routes only enabled, exact user-taught skill triggers', () => {
  const skills = [
    { id: 'skill-on', trigger: 'weekly reset', enabled: true },
    { id: 'skill-off', trigger: 'daily review', enabled: false },
    { id: 'skill-curly', trigger: 'it’s review time', enabled: true },
  ];
  assert.equal(classifyIntent('run weekly reset', { skills }).intent, 'skill');
  assert.equal(classifyIntent('Please use weekly   reset.', { skills }).skillId, 'skill-on');
  assert.equal(classifyIntent('run it’s   review time', { skills }).skillId, 'skill-curly');
  assert.equal(classifyIntent('weekly reset!', { skills }).skillId, 'skill-on');
  assert.notEqual(classifyIntent('run daily review', { skills }).intent, 'skill');
  assert.notEqual(classifyIntent('I mentioned a weekly reset earlier', { skills }).intent, 'skill');
});
