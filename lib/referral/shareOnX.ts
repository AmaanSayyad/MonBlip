/**
 * Canonical X/Twitter share copy for referral links (used from /referrals and /profile).
 */

export function getReferralShareTweetText(): string {
  return [
    'This platform is Insane.⚡️',
    '',
    'MonBlip.fun - short charts for crypto, stocks, metals, commodities and FX.', 
    'Rounds run from 5 seconds to 1 minute.',
    '',
    'Open @MonBlip from my link and the join in.',
    'Stop watching. Start trading.', 
    '',
    'Try it now:',
    ].join('\n');
}

export function referralLandingUrl(referralCode: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') || '';
  const origin = typeof window !== 'undefined'
    ? window.location.origin
    : (configured && !/tapt/i.test(configured) && !/localhost|127\.0\.0\.1/.test(configured) ? configured : 'https://monblip.fun');
  return `${origin}/?ref=${encodeURIComponent(referralCode.trim())}`;
}

export function openReferralShareOnX(referralLink: string): void {
  if (typeof window === 'undefined') return;
  const text = encodeURIComponent(getReferralShareTweetText());
  window.open(
    `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(referralLink)}`,
    '_blank',
  );
}
