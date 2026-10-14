export const MONAD_CHAIN_ID = 143;
export const AUSD = '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a';
export const TREASURY = '0xcbae80461bb820e4075035f765f8a46fa65a6ded';
export const MAX_UNITS = 10;
export const DURATIONS = [5, 10, 15, 30, 60] as const;

const PAYOUT: Record<number, number> = { 5: 1.75, 10: 1.8, 15: 1.85, 30: 1.9, 60: 1.95 };

export function appUrl(): string {
  return (process.env.MONBLIP_URL || 'https://monblip.fun').replace(/\/$/, '');
}

export function payoutFor(duration: number): number {
  return PAYOUT[duration] ?? 1.75;
}

export function parseUnits(amount: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error('Amount must be a positive decimal.');
  const [whole, fraction = ''] = amount.split('.');
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const scale = 10n ** BigInt(decimals);
  const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * scale + BigInt(padded || '0');
}

export function withinCap(amount: string): boolean {
  const value = Number(amount);
  return Number.isFinite(value) && value > 0 && value <= MAX_UNITS;
}

export function roundMessage(input: {
  direction: 'UP' | 'DOWN';
  amount: string;
  currency: 'AUSD' | 'MON';
  duration: number;
}): string {
  return [
    'MonBlip round',
    `direction:${input.direction}`,
    `amount:${input.amount}`,
    `currency:${input.currency}`,
    `duration:${input.duration}`,
    'asset:BTC',
  ].join('\n');
}

export function transferCalldata(recipient: string, amount: bigint): `0x${string}` {
  const address = recipient.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const value = amount.toString(16).padStart(64, '0');
  return `0xa9059cbb${address}${value}`;
}
