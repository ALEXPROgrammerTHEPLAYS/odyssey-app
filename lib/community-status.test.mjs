import test from 'node:test';
import assert from 'node:assert/strict';
import { getChallengeProgress, hasReactedToLog } from './community-status.mjs';

test('a member reaction applies only to its matching post and reaction kind', () => {
  const reactions = [
    { daily_log_id: 'post-1', reaction_type: 'high_five' },
    { daily_log_id: 'post-2', reaction_type: 'support' },
  ];

  assert.equal(hasReactedToLog(reactions, 'post-1', 'high_five'), true);
  assert.equal(hasReactedToLog(reactions, 'post-1', 'support'), false);
  assert.equal(hasReactedToLog(reactions, 'post-2', 'support'), true);
  assert.equal(hasReactedToLog(reactions, 'post-3', 'support'), false);
});

test('challenge progress is capped and only counts qualifying goals from this week', () => {
  const progress = getChallengeProgress({
    posts: 5,
    goals: [
      { createdAt: '2026-10-19T12:00:00Z', progress: 90 },
      { createdAt: '2026-10-20T12:00:00Z', progress: 0, completed: false },
      { createdAt: '2026-10-21T12:00:00Z', progress: 5, completed: false },
    ],
    opportunitiesSaved: 2,
    weekStart: '2026-10-19',
  });

  assert.deepEqual(progress, {
    'share-3-updates': 3,
    'set-a-goal': 1,
    'explore-opportunities': 1,
  });
});
