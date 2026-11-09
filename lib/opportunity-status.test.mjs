import test from 'node:test';
import assert from 'node:assert/strict';
import { getOpportunityVerificationStatus, isOpportunityExpired } from './opportunity-status.mjs';

test('opportunity deadline is expired only when before the current date', () => {
  const now = new Date('2026-10-25T15:00:00');

  assert.equal(isOpportunityExpired('2026-10-24', now), true);
  assert.equal(isOpportunityExpired('2026-10-25', now), false);
  assert.equal(isOpportunityExpired('2026-10-26', now), false);
  assert.equal(isOpportunityExpired(null, now), false);
});

test('verification is recent for 30 days and otherwise needs review', () => {
  const now = new Date('2026-10-25T15:00:00Z');

  assert.equal(getOpportunityVerificationStatus('2026-10-20T15:00:00Z', now), 'recent');
  assert.equal(getOpportunityVerificationStatus('2026-09-20T15:00:00Z', now), 'stale');
  assert.equal(getOpportunityVerificationStatus(null, now), 'unverified');
  assert.equal(getOpportunityVerificationStatus('not-a-date', now), 'unverified');
});
