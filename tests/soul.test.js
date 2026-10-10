import test from 'node:test';
import assert from 'node:assert/strict';
import { isActionVerifiedInState, OUTCOME_STATES, SOUL_CURRENT_SCOPE, SOUL_NAME, SOUL_PRINCIPLES, SOUL_PURPOSE } from '../src/soul.js';

test('Julien has one durable identity and the seven charter elements', () => {
  assert.equal(SOUL_NAME, 'Julien');
  assert.match(SOUL_PURPOSE, /completed, verified outcomes/);
  assert.deepEqual(SOUL_PRINCIPLES.map((principle) => principle.title), ['Identity', 'Mind', 'Will', 'Memory', 'Evolution', 'Integrity']);
  assert.ok(SOUL_PRINCIPLES.every((principle) => principle.text.length > 20));
});

test('the integrity contract distinguishes proposed, executed, and verified work', () => {
  assert.deepEqual(OUTCOME_STATES.map((state) => state.id), ['proposed', 'executed', 'verified']);
  assert.match(OUTCOME_STATES[0].detail, /Nothing has run/);
  assert.match(OUTCOME_STATES[2].detail, /checked independently/);
  assert.match(SOUL_CURRENT_SCOPE, /no background agent/);
});

test('local action evidence is verified only when the resulting state is present or absent as expected', () => {
  const state = { memories: [{ id: 'memory-1' }], tasks: [{ id: 'task-1' }], events: [], drafts: [], focusRunning: true, focusRemaining: 1200 };
  assert.equal(isActionVerifiedInState({ type: 'task', recordId: 'task-1' }, state), true);
  assert.equal(isActionVerifiedInState({ type: 'task', recordId: 'missing' }, state), false);
  assert.equal(isActionVerifiedInState({ type: 'forget', recordId: 'memory-1' }, state), false);
  assert.equal(isActionVerifiedInState({ type: 'forget', recordId: 'memory-2' }, state), true);
  assert.equal(isActionVerifiedInState({ type: 'focus' }, state), true);
  assert.equal(isActionVerifiedInState({ type: 'focus' }, { ...state, focusRunning: false }), false);
});
