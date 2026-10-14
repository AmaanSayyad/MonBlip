import { isAddress, verifyMessage } from 'viem';
import { PERPL_CLAIM_TTL_MS } from '@/lib/monad/perplClaim';

/** Passkeys allowed to claim house Perpl funds and switch API order forwarding. */
export function houseOperators() {
  return (process.env.PERPL_CLAIM_ADDRESSES ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isHouseOperator(address: string) {
  return Boolean(address) && houseOperators().includes(address.toLowerCase());
}

/** Returns an error and HTTP status, or null when the passkey signed `message` recently and is listed. */
export async function checkHouseOperator(input: {
  address: unknown;
  signature: unknown;
  issuedAt: unknown;
  message: (address: `0x${string}`, issuedAt: number) => string;
}): Promise<{ error: string; status: number } | null> {
  const address = typeof input.address === 'string' ? input.address : '';
  const signature = typeof input.signature === 'string' ? input.signature : '';
  const issuedAt = Number(input.issuedAt);

  if (!isAddress(address) || !signature.startsWith('0x') || !Number.isFinite(issuedAt)) {
    return { error: 'address, issuedAt and signature are required', status: 400 };
  }
  if (!isHouseOperator(address)) {
    return { error: 'This passkey is not on the operator list for the house account.', status: 403 };
  }
  const age = Date.now() - issuedAt;
  if (age < -60_000 || age > PERPL_CLAIM_TTL_MS) {
    return { error: 'The passkey signature expired. Try again.', status: 401 };
  }
  const valid = await verifyMessage({
    address,
    message: input.message(address, issuedAt),
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!valid) {
    return { error: 'The passkey signature does not match this address.', status: 401 };
  }
  return null;
}
