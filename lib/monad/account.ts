'use client';

import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  type Secp256k1SigningSession,
} from '@category-labs/mera';
import { toViemAccount } from '@category-labs/mera/viem';
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monad } from 'viem/chains';
import { MONAD_AUSD } from '@/lib/chains/supported';
import { useOverflowStore } from '@/lib/store';
import { readStored, removeStored, writeStored } from '@/lib/brand/browserStore';

const CREDENTIAL_KEY = 'monblip.mera.credential';
const SESSION_MS = 15 * 60 * 1000;

let session: Secp256k1SigningSession | undefined;
let slipKey: CryptoKey | undefined;
let sessionTimer: number | undefined;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeMera(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** new: no passkey remembered. locked: passkey remembered, session ended. live: prompt-free signing. */
export function meraPhase(): 'new' | 'locked' | 'live' {
  if (session) return 'live';
  if (typeof window !== 'undefined' && storedCredential()) return 'locked';
  return 'new';
}

function keyHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function deriveEvmKey(prfOutput: Uint8Array, index = 0): Uint8Array {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  if (node.privateKey === null) throw new Error('derivation produced no key');
  return node.privateKey;
}

function storedCredential(): { credentialId: string; transports?: string[] } | undefined {
  const raw = readStored(CREDENTIAL_KEY, ['tapt.mera.credential']);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function armSession() {
  if (sessionTimer) window.clearTimeout(sessionTimer);
  sessionTimer = window.setTimeout(() => {
    disconnectMera();
  }, SESSION_MS);
}

async function startFromPrf(created: { credentialId: string; prfOutput: Uint8Array; transports?: readonly string[] }) {
  writeStored(
    CREDENTIAL_KEY,
    JSON.stringify({
      credentialId: created.credentialId,
      transports: created.transports ?? storedCredential()?.transports,
    }),
  );

  session?.end();
  session = createSecp256k1SigningSession({ privateKey: deriveEvmKey(created.prfOutput) });
  armSession();

  writeStored('monblip.wallet.kind', 'mera');
  const account = toViemAccount(session);
  const store = useOverflowStore.getState();
  store.setAddress(account.address);
  store.setIsConnected(true);
  store.setNetwork('MONAD');
  store.setPreferredNetwork('MONAD');
  const saved = readStored('monblip.play.currency', ['tapt.play.currency']);
  store.setSelectedCurrency(saved === 'MON' ? 'MON' : 'AUSD');
  void store.refreshWalletBalance();
  void store.fetchProfile(account.address);
  void store.fetchBalance(account.address);
  emit();
  return account.address;
}

/**
 * One passkey prompt. With storage cleared, the platform still offers the
 * discoverable credential, so the same account comes back.
 */
export async function connectMera() {
  const { disconnectMetaMask } = await import('@/lib/monad/injectedWallet');
  disconnectMetaMask();
  const created = await getPasskeyPrfOutput({
    rpId: location.hostname,
    credential: storedCredential(),
  });
  return startFromPrf(created);
}

/** First visit only. A later visit uses connectMera, which does not mint a second account. */
export async function createMera() {
  const { disconnectMetaMask } = await import('@/lib/monad/injectedWallet');
  disconnectMetaMask();
  const created = await createPasskeyWithPrfOutput({
    rp: { id: location.hostname, name: 'MonBlip' },
    user: { name: 'trader@monblip.fun', displayName: 'MonBlip trader' },
  });
  return startFromPrf(created);
}

/** A deposit or withdrawal asks for the passkey again. A round does not. */
export async function confirmMeraSpend() {
  if (!session) throw new Error('Unlock with your passkey first.');
  const current = toViemAccount(session).address;
  const created = await getPasskeyPrfOutput({
    rpId: location.hostname,
    credential: storedCredential(),
  });
  const next = privateKeyToAccount(keyHex(deriveEvmKey(created.prfOutput))).address;
  if (next.toLowerCase() !== current.toLowerCase()) {
    throw new Error('That passkey belongs to a different account.');
  }
}

export function endMeraSigner() {
  if (sessionTimer) window.clearTimeout(sessionTimer);
  sessionTimer = undefined;
  session?.end();
  session = undefined;
  slipKey = undefined;
  emit();
}

export function disconnectMera() {
  endMeraSigner();
  if (typeof window !== 'undefined' && readStored('monblip.wallet.kind', ['tapt.wallet.kind']) === 'mera') {
    removeStored('monblip.wallet.kind', ['tapt.wallet.kind']);
  }
  const store = useOverflowStore.getState();
  store.setAddress(null);
  store.setIsConnected(false);
  store.setNetwork(null);
}

export async function signMeraMessage(message: string): Promise<`0x${string}`> {
  if (!session) throw new Error('Sign in with Mera first');
  return toViemAccount(session).signMessage({ message });
}

export async function signMeraTypedData(typed: {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}): Promise<`0x${string}`> {
  if (!session) throw new Error('Sign in with Mera first');
  const account = toViemAccount(session);
  return account.signTypedData({
    domain: typed.domain as never,
    types: typed.types as never,
    primaryType: typed.primaryType,
    message: typed.message as never,
  });
}

export function meraWalletClient() {
  if (!session) throw new Error('Sign in with Mera first');
  const account = toViemAccount(session);
  return createWalletClient({ account, chain: monad, transport: http('https://rpc.monad.xyz') });
}

export function meraAddress(): `0x${string}` | null {
  if (!session) return null;
  return toViemAccount(session).address;
}

const SLIP_SALT = Uint8Array.from(
  '09bc941793564709ce68bd995df1629dedaad832fda31db18d5ccd4db915d611'.match(/../g)!.map((byte) => parseInt(byte, 16)),
);
const SLIP_JOURNAL = 'monblip.slip.journal';

/** The slip salt is not the wallet salt. The PRF output never leaves memory. */
async function slipKeyMaterial() {
  if (slipKey) return slipKey;
  const created = await getPasskeyPrfOutput({
    rpId: location.hostname,
    credential: storedCredential(),
    prfSalt: SLIP_SALT,
  });
  slipKey = await crypto.subtle.importKey('raw', created.prfOutput, 'AES-GCM', false, ['encrypt', 'decrypt']);
  emit();
  return slipKey;
}

export function slipIsOpen() {
  return Boolean(slipKey);
}

export function lockSlip() {
  slipKey = undefined;
  emit();
}

function rememberCiphertext(sealed: string) {
  const prior = JSON.parse(readStored(SLIP_JOURNAL, ['tapt.slip.journal']) || '[]') as string[];
  const next = [sealed, ...prior.filter((row) => row !== sealed)].slice(0, 20);
  writeStored(SLIP_JOURNAL, JSON.stringify(next));
}

export function sealedSlips(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const rows = JSON.parse(readStored(SLIP_JOURNAL, ['tapt.slip.journal']) || '[]');
    return Array.isArray(rows) ? rows.filter((row) => typeof row === 'string') : [];
  } catch {
    return [];
  }
}

/** Encrypt a round under the slip namespace. Ciphertext is not the key. */
export async function sealBetSlip(slip: Record<string, unknown>): Promise<string | null> {
  const key = await slipKeyMaterial();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(slip));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: Uint8Array.from(iv) }, key, encoded);
  const packed = new Uint8Array(iv.byteLength + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.byteLength);
  const sealed = btoa(String.fromCharCode(...packed));
  rememberCiphertext(sealed);
  const address = session ? toViemAccount(session).address : null;
  if (address) {
    void fetch('/api/monad/slip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, sealed }),
    });
  }
  return sealed;
}

export async function readSealedSlips(): Promise<Array<Record<string, unknown>>> {
  const key = await slipKeyMaterial();
  const address = session ? toViemAccount(session).address : null;
  if (address) {
    const response = await fetch(`/api/monad/slip?address=${address}`).catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    const remote: string[] = Array.isArray(body?.slips) ? body.slips : [];
    remote.forEach(rememberCiphertext);
  }
  const opened: Array<Record<string, unknown>> = [];
  for (const sealed of sealedSlips()) {
    try {
      const packed = Uint8Array.from(atob(sealed), (char) => char.charCodeAt(0));
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: packed.slice(0, 12) },
        key,
        packed.slice(12),
      );
      opened.push(JSON.parse(new TextDecoder().decode(plain)));
    } catch {
      // A blob from another salt cannot be read with this namespace.
    }
  }
  return opened;
}

/** Send AUSD to the house treasury. Gas is declared up front because Monad charges the limit. */
export async function depositAusd(amount: number, treasury: `0x${string}`): Promise<`0x${string}`> {
  if (!session) throw new Error('Sign in with Mera first');
  const account = toViemAccount(session);
  const wallet = createWalletClient({ account, chain: monad, transport: http('https://rpc.monad.xyz') });
  const hash = await wallet.writeContract({
    address: MONAD_AUSD,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [treasury, parseUnits(amount.toString(), 6)],
    gas: 80_000n,
  });
  const pub = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

/** Send native MON to the house treasury. Gas is declared up front because Monad charges the limit. */
export async function depositMon(amount: number, treasury: `0x${string}`): Promise<`0x${string}`> {
  if (!session) throw new Error('Sign in with Mera first');
  const account = toViemAccount(session);
  const wallet = createWalletClient({ account, chain: monad, transport: http('https://rpc.monad.xyz') });
  const hash = await wallet.sendTransaction({
    to: treasury,
    value: parseUnits(amount.toFixed(18), 18),
    gas: 21_000n,
  });
  const pub = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}
