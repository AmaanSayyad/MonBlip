'use client';

import { encodeFunctionData, erc20Abi, formatUnits, hashTypedData } from 'viem';
import { monad } from 'viem/chains';
import { MONAD_AUSD } from '@/lib/chains/supported';
import { meraAddress, meraWalletClient, signMeraTypedData } from '@/lib/monad/account';
import { readStored, writeStored } from '@/lib/brand/browserStore';

const EXCHANGE = '0x34B6552d57a35a1D042CcAe1951BD1C370112a6F' as const;
const STORE = 'monblip.perpl.trade';
const CHAIN_ID = 143;

const exchangeAbi = [
  {
    type: 'function',
    name: 'createAccount',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ name: 'accountId', type: 'uint256' }],
  },
] as const;

type StoredKey = {
  address: string;
  pkcs8: string;
  publicKey: string;
  apiKey?: string;
};

export type PerplTradeResult = {
  submitted: boolean;
  market: string;
  side: 'buy';
  size: string;
  accountId?: number;
  requestId?: number;
  statuses?: unknown;
  fill?: unknown;
  detail: string;
};

async function perpl(method: 'GET' | 'POST', target: string, payload = '', headers?: Record<string, string>) {
  const response = await fetch('/api/monad/perpl/forward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, target, body: payload, headers }),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'error' in data
      ? String((data as { error: unknown }).error)
      : text || `Perpl returned ${response.status}`;
    const error = new Error(message) as Error & { status?: number; body?: unknown };
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return data;
}

function bytesToB64(bytes: Uint8Array) {
  let raw = '';
  bytes.forEach((byte) => { raw += String.fromCharCode(byte); });
  return btoa(raw);
}

function b64ToBytes(value: string) {
  const raw = atob(value);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function hex(bytes: Uint8Array) {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function importPrivate(pkcs8: string) {
  return crypto.subtle.importKey(
    'pkcs8',
    b64ToBytes(pkcs8),
    { name: 'Ed25519' } as Algorithm,
    false,
    ['sign'],
  );
}

async function tradeKey(address: string): Promise<StoredKey & { privateKey: CryptoKey }> {
  const saved = readStored(STORE, ['tapt.perpl.trade']);
  if (saved) {
    const parsed = JSON.parse(saved) as StoredKey;
    if (parsed.address.toLowerCase() === address.toLowerCase() && parsed.pkcs8 && parsed.publicKey) {
      return { ...parsed, privateKey: await importPrivate(parsed.pkcs8) };
    }
  }
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' } as Algorithm, true, ['sign']) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const next: StoredKey = {
    address,
    pkcs8: bytesToB64(pkcs8),
    publicKey: hex(rawPub),
  };
  writeStored(STORE, JSON.stringify(next));
  return { ...next, privateKey: pair.privateKey };
}

function remember(key: StoredKey & { privateKey: CryptoKey }, apiKey: string) {
  const { privateKey: _privateKey, ...stored } = key;
  writeStored(STORE, JSON.stringify({ ...stored, apiKey }));
  return { ...key, apiKey };
}

async function enroll(key: StoredKey & { privateKey: CryptoKey }) {
  if (key.apiKey) return key;
  const payload = await perpl('POST', '/v1/api-key/payload', JSON.stringify({
    chain_id: CHAIN_ID,
    address: key.address,
    public_key: key.publicKey,
    scope_mask: 3,
    label: 'MonBlip',
  })) as { typed_data: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }; mac: string };

  const typed = payload.typed_data;
  const { EIP712Domain: _domain, ...types } = typed.types;
  const signature = await signMeraTypedData({
    domain: typed.domain,
    types,
    primaryType: typed.primaryType,
    message: typed.message,
  });
  const digest = hashTypedData({
    domain: typed.domain,
    types,
    primaryType: typed.primaryType,
    message: typed.message,
  } as never);
  const digestBytes = Uint8Array.from(digest.slice(2).match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
  const pop = new Uint8Array(await crypto.subtle.sign(
    { name: 'Ed25519' } as Algorithm,
    key.privateKey,
    digestBytes,
  ));
  const enrolled = await perpl('POST', '/v1/api-key/enroll', JSON.stringify({
    chain_id: CHAIN_ID,
    address: key.address,
    typed_data: typed,
    mac: payload.mac,
    signature,
    pop_signature: hex(pop),
  })) as { api_key?: string | { api_key?: string } };
  const apiKey = typeof enrolled.api_key === 'string' ? enrolled.api_key : enrolled.api_key?.api_key;
  if (!apiKey) throw new Error('Perpl enrolled the key without returning a token');
  return remember(key, apiKey);
}

async function signed(key: StoredKey & { privateKey: CryptoKey; apiKey?: string }, method: 'GET' | 'POST', target: string, payload = '') {
  if (!key.apiKey) throw new Error('Perpl trade key is not enrolled');
  const timestamp = Date.now().toString();
  const nonce = bytesToB64(crypto.getRandomValues(new Uint8Array(16)))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const bodyHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload) as BufferSource)))
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const canonical = [CHAIN_ID, method, target, timestamp, nonce, bodyHash].join('\n');
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'Ed25519' } as Algorithm,
    key.privateKey,
    new TextEncoder().encode(canonical) as BufferSource,
  ));
  return perpl(method, target, payload, {
    'X-API-Key': key.apiKey,
    'X-API-Timestamp': timestamp,
    'X-API-Nonce': nonce,
    'X-API-Signature': bytesToB64(sig).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''),
  });
}

async function openAccount(amountRaw: bigint) {
  const wallet = meraWalletClient();
  const account = meraAddress();
  if (!account) throw new Error('Sign in with Mera first');
  const publicClient = (await import('viem')).createPublicClient({
    chain: monad,
    transport: (await import('viem')).http('https://rpc.monad.xyz'),
  });
  const allowance = await publicClient.readContract({
    address: MONAD_AUSD,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account, EXCHANGE],
  });
  if (allowance < amountRaw) {
    const approveGas = await publicClient.estimateContractGas({
      account,
      address: MONAD_AUSD,
      abi: erc20Abi,
      functionName: 'approve',
      args: [EXCHANGE, amountRaw],
    });
    const approveHash = await wallet.writeContract({
      address: MONAD_AUSD,
      abi: erc20Abi,
      functionName: 'approve',
      args: [EXCHANGE, amountRaw],
      gas: approveGas + approveGas / 5n,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }
  const data = encodeFunctionData({ abi: exchangeAbi, functionName: 'createAccount', args: [amountRaw] });
  const gas = await publicClient.estimateGas({ account, to: EXCHANGE, data });
  const hash = await wallet.sendTransaction({ to: EXCHANGE, data, gas: gas + gas / 5n });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function placePerplTrade(): Promise<PerplTradeResult> {
  const address = meraAddress();
  if (!address) throw new Error('Sign in with the Mera passkey first');
  const key = await enroll(await tradeKey(address));

  type PerplWallet = { as?: Array<{ id: number; lfr: number; b: string }> };
  let wallet: PerplWallet | null = null;
  try {
    wallet = await signed(key, 'GET', '/v1/trading/wallet') as PerplWallet;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 404) throw error;
  }

  let account = wallet?.as?.[0];
  if (!account) {
    const context = await perpl('GET', '/v1/pub/context') as {
      instances?: Array<{ min_account_open_amount?: string }>;
    };
    const minRaw = BigInt(context.instances?.[0]?.min_account_open_amount || '10000000');
    const publicClient = (await import('viem')).createPublicClient({
      chain: monad,
      transport: (await import('viem')).http('https://rpc.monad.xyz'),
    });
    const balance = await publicClient.readContract({
      address: MONAD_AUSD,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    });
    if (balance < minRaw) {
      throw new Error(`This passkey holds ${formatUnits(balance, 6)} AUSD. Perpl needs ${formatUnits(minRaw, 6)} AUSD in the same wallet before it will open an account.`);
    }
    await openAccount(minRaw);
    wallet = await signed(key, 'GET', '/v1/trading/wallet') as PerplWallet;
    account = wallet?.as?.[0];
  }
  if (!account) throw new Error('Perpl has no trading account for this passkey yet');

  const requestId = Number(account.lfr || 0) + 1;
  const order = {
    mt: 30,
    d: [{
      rq: requestId,
      mkt: 10,
      acc: account.id,
      t: 1,
      p: 0,
      s: 1,
      ms: 100,
      fl: 4,
      lv: 100,
      lb: 0,
    }],
  };
  const body = JSON.stringify(order);
  const statuses = await signed(key, 'POST', '/v1/trading/orders', body);
  const fills = await signed(key, 'GET', '/v1/trading/fills?count=1').catch(() => null) as { d?: unknown[] } | null;
  const codes = (statuses as { statuses?: Array<{ code?: number } | number> })?.statuses;
  const accepted = !codes || codes.every((code) => (typeof code === 'number' ? code : code.code) === 0);
  return {
    submitted: accepted,
    market: 'MON',
    side: 'buy',
    size: '1 MON',
    accountId: account.id,
    requestId,
    statuses,
    fill: fills?.d?.[0] ?? null,
    detail: accepted
      ? 'Perpl accepted the order.'
      : 'Perpl evaluated the order and did not accept it.',
  };
}

export async function readAusdBalance(address: `0x${string}`) {
  const { createPublicClient, http } = await import('viem');
  const publicClient = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
  const raw = await publicClient.readContract({
    address: MONAD_AUSD,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
  return formatUnits(raw, 6);
}
