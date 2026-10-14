/** The passkey signs this before the house sends its Perpl funds to it. */
export function perplClaimMessage(address: string, issuedAt: number) {
  return [
    'MonBlip: claim the house Perpl funds',
    `To: ${address.toLowerCase()}`,
    `Issued: ${issuedAt}`,
  ].join('\n');
}

/** The passkey signs this before the house turns Perpl API order forwarding on or off. */
export function perplForwardingMessage(address: string, allow: boolean, issuedAt: number) {
  return [
    `MonBlip: turn house Perpl API orders ${allow ? 'on' : 'off'}`,
    `By: ${address.toLowerCase()}`,
    `Issued: ${issuedAt}`,
  ].join('\n');
}

export const PERPL_CLAIM_TTL_MS = 5 * 60_000;
