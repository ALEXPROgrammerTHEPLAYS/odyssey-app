const VERIFICATION_MAX_AGE_DAYS = 30;

export function isOpportunityExpired(deadline, now = new Date()) {
  if (!deadline) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const localDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  return deadline < localDate;
}

export function getOpportunityVerificationStatus(lastVerifiedAt, now = new Date()) {
  if (!lastVerifiedAt) return 'unverified';
  const verifiedAt = new Date(lastVerifiedAt);
  if (Number.isNaN(verifiedAt.getTime())) return 'unverified';
  const age = now.getTime() - verifiedAt.getTime();
  return age >= 0 && age <= VERIFICATION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    ? 'recent'
    : 'stale';
}
