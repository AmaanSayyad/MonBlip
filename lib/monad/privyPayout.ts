const MAX_UNITS = 10;

export class PrivyPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivyPolicyError';
  }
}

export function payoutAllowed(input: { recipient: string; amount: number; asset: string }) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.recipient)) {
    throw new PrivyPolicyError('Privy policy: the payout must go back to a wallet address.');
  }
  if (input.asset !== 'AUSD' && input.asset !== 'MON') {
    throw new PrivyPolicyError('Privy policy: the payout asset must be AUSD or MON.');
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new PrivyPolicyError('Privy policy: the payout amount must be positive.');
  }
  if (input.amount > MAX_UNITS) {
    throw new PrivyPolicyError('Privy policy: a single payout cannot exceed 10.');
  }
}

function credentials() {
  const appId = process.env.PRIVY_APP_ID?.trim();
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();
  const walletId = process.env.PRIVY_PAYOUT_WALLET_ID?.trim();
  const authorizationKey = process.env.PRIVY_AUTHORIZATION_KEY?.trim();
  if (!appId || !appSecret || !walletId) return null;
  return { appId, appSecret, walletId, authorizationKey };
}

export function privyPayoutStatus() {
  return {
    configured: credentials() !== null,
    chain: 'monad',
    maxUnits: MAX_UNITS,
    rule: 'Monad only. The payout goes back to the trader wallet. A single send cannot exceed 10 AUSD or 10 MON.',
  };
}

/**
 * Privy is the payout signer, not the login. The trader still signs with
 * Mera or MetaMask. This wallet only signs a payout the policy allows.
 */
export async function authorizePrivyPayout(input: { recipient: string; amount: number; asset: string }) {
  payoutAllowed(input);
  const creds = credentials();
  if (!creds) {
    return { configured: false as const };
  }

  const message = `MonBlip payout\nrecipient:${input.recipient}\namount:${input.amount}\nasset:${input.asset}\nchain:monad`;
  const { PrivyClient } = await import('@privy-io/node');
  const privy = new PrivyClient({ appId: creds.appId, appSecret: creds.appSecret });
  const signed = await privy.wallets().ethereum().signMessage(creds.walletId, {
    message,
    authorization_context: creds.authorizationKey
      ? { authorization_private_keys: [creds.authorizationKey] }
      : undefined,
  });

  return {
    configured: true as const,
    signature: signed.signature,
  };
}
