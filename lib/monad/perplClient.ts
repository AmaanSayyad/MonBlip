'use client';

import { encodeFunctionData, erc20Abi, formatUnits, hashTypedData } from 'viem';
import { monad } from 'viem/chains';
import { MONAD_AUSD } from '@/lib/chains/supported';
import { meraAddress, meraWalletClient, signMeraTypedData } from '@/lib/monad/account';
import { readStored, writeStored } from '@/lib/brand/browserStore';
import { ORDER_STATUS, reasonText } from '@/lib/monad/perplCodes';
import { buildPerplView, PERPL_VIEW_PATHS, type PerplAccountSnapshot, type PerplRaw } from '@/lib/monad/perplView';

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
  {
    type: 'function',
    name: 'depositCollateral',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amountCNS', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdrawCollateral',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amountCNS', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'allowOrderForwarding',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'allow', type: 'bool' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getAccountByAddr',
    stateMutability: 'view',
    inputs: [{ name: 'accountAddress', type: 'address' }],
    outputs: [{
      name: 'accountInfo',
      type: 'tuple',
      components: [
        { name: 'accountId', type: 'uint256' },
        { name: 'balanceCNS', type: 'uint256' },
        { name: 'lockedBalanceCNS', type: 'uint256' },
        { name: 'frozen', type: 'uint8' },
        { name: 'accountAddr', type: 'address' },
        {
          name: 'positions',
          type: 'tuple',
          components: [
            { name: 'bank1', type: 'uint256' },
            { name: 'bank2', type: 'uint256' },
            { name: 'bank3', type: 'uint256' },
            { name: 'bank4', type: 'uint256' },
          ],
        },
      ],
    }],
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
  /** True once Perpl's order history shows the order matched on-chain. */
  filled: boolean;
  /** Perpl had not reported an outcome before MonBlip stopped waiting. */
  pending: boolean;
  market: string;
  side: 'buy';
  size: string;
  accountId?: number;
  requestId?: number;
  status?: string;
  fillPrice?: number;
  filledSize?: number;
  forwardingTx?: string;
  collateralTx?: string;
  statuses?: unknown;
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
  let detail: string | null = null;
  try {
    data = text ? JSON.parse(text) : null;
    if (data && typeof data === 'object' && 'error' in data) detail = String((data as { error: unknown }).error);
  } catch {
    data = { error: text };
  }
  if (!response.ok) {
    const message = response.status === 451
      ? 'Perpl blocked this request by region. MonBlip routes Perpl calls through Mumbai; try again in a moment.'
      : detail ?? `Perpl answered ${response.status} ${text.trim()} on ${target.split('?')[0]}`.trim();
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

async function savedKey(address: string): Promise<(StoredKey & { privateKey: CryptoKey }) | null> {
  const saved = readStored(STORE, ['tapt.perpl.trade']);
  if (!saved) return null;
  const parsed = JSON.parse(saved) as StoredKey;
  if (parsed.address.toLowerCase() !== address.toLowerCase() || !parsed.pkcs8 || !parsed.publicKey) return null;
  return { ...parsed, privateKey: await importPrivate(parsed.pkcs8) };
}

async function tradeKey(address: string): Promise<StoredKey & { privateKey: CryptoKey }> {
  const saved = await savedKey(address);
  if (saved) return saved;
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
  // Perpl sends chainId as a hex string; signed that way, enroll answers 400.
  const domain = { ...typed.domain };
  if (typeof domain.chainId === 'string') domain.chainId = Number(domain.chainId);
  const signature = await signMeraTypedData({
    domain,
    types,
    primaryType: typed.primaryType,
    message: typed.message,
  });
  const digest = hashTypedData({
    domain,
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
  await approveAusd(amountRaw);
  const wallet = meraWalletClient();
  const account = meraAddress();
  if (!account) throw new Error('Sign in with Mera first');
  const publicClient = (await import('viem')).createPublicClient({
    chain: monad,
    transport: (await import('viem')).http('https://rpc.monad.xyz'),
  });
  const data = encodeFunctionData({ abi: exchangeAbi, functionName: 'createAccount', args: [amountRaw] });
  const gas = await publicClient.estimateGas({ account, to: EXCHANGE, data });
  const hash = await wallet.sendTransaction({ to: EXCHANGE, data, gas: gas + gas / 5n });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

async function approveAusd(amountRaw: bigint) {
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
}

const TOP_UP_RAW = 1_000_000n;
const MIN_FREE_RAW = 250_000n;

/** An open account with no free collateral gets 1 AUSD from the passkey before the order. */
async function topUpCollateral(address: `0x${string}`, accountId: number) {
  const { createPublicClient, http } = await import('viem');
  const publicClient = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
  const info = await publicClient.readContract({
    address: EXCHANGE,
    abi: exchangeAbi,
    functionName: 'getAccountByAddr',
    args: [address],
  });
  if (info.balanceCNS - info.lockedBalanceCNS >= MIN_FREE_RAW) return undefined;
  const balance = await publicClient.readContract({
    address: MONAD_AUSD,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
  if (balance < TOP_UP_RAW) {
    throw new Error(`Perpl account #${accountId} has no free collateral, and this passkey holds ${formatUnits(balance, 6)} AUSD. Add at least 1 AUSD to the passkey to place the long.`);
  }
  await approveAusd(TOP_UP_RAW);
  return sendFromPasskey(
    encodeFunctionData({ abi: exchangeAbi, functionName: 'depositCollateral', args: [TOP_UP_RAW] }),
    'Perpl did not take the collateral',
  );
}

/** Perpl's API picks up a new on-chain account a few seconds after the block. */
async function enrollOnceIndexed(stored: Parameters<typeof enroll>[0]) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await enroll(stored);
    } catch (error) {
      if ((error as { status?: number }).status !== 404 || attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function openFirstAccount(address: `0x${string}`) {
  if (await readPerplAccountId(address) != null) return;
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
}

export async function placePerplTrade(): Promise<PerplTradeResult> {
  const address = meraAddress();
  if (!address) throw new Error('Sign in with the Mera passkey first');
  const stored = await tradeKey(address);
  let key: Awaited<ReturnType<typeof enroll>>;
  try {
    key = await enroll(stored);
  } catch (error) {
    // Perpl answers 404 until this address has opened an account on the exchange.
    if ((error as { status?: number }).status !== 404) throw error;
    await openFirstAccount(address);
    key = await enrollOnceIndexed(stored);
  }

  type PerplWallet = { as?: Array<{ id: number; lfr: number; b: string; fw?: boolean }> };
  let wallet: PerplWallet | null = null;
  try {
    wallet = await signed(key, 'GET', '/v1/trading/wallet') as PerplWallet;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 404) throw error;
  }

  let account = wallet?.as?.[0];
  if (!account) {
    await openFirstAccount(address);
    wallet = await signed(key, 'GET', '/v1/trading/wallet') as PerplWallet;
    account = wallet?.as?.[0];
  }
  if (!account) throw new Error('Perpl has no trading account for this passkey yet');

  let forwardingTx: string | undefined;
  if (account.fw === false) forwardingTx = await enableForwarding();
  const collateralTx = await topUpCollateral(address, account.id);

  const seen = new Set(((await history(key))?.d ?? []).map(historyKey));
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
  const codes = (statuses as { statuses?: Array<{ code?: number } | number> })?.statuses;
  const accepted = !codes || codes.every((code) => (typeof code === 'number' ? code : code.code) === 0);
  const base = {
    submitted: accepted,
    market: 'MON',
    side: 'buy' as const,
    size: '1 MON',
    accountId: account.id,
    requestId,
    forwardingTx,
    collateralTx,
    statuses,
  };
  if (!accepted) {
    return { ...base, filled: false, pending: false, detail: 'Perpl evaluated the order and did not accept it.' };
  }

  const row = await outcome(key, requestId, seen);
  if (!row) {
    return {
      ...base,
      filled: false,
      pending: true,
      detail: 'Perpl queued the order and has not reported an outcome yet. Your Perpl account below updates once it lands.',
    };
  }
  const decimals = await marketDecimals(Number(row.mkt ?? 10));
  const status = Number(row.st);
  const filledSize = Number(row.fs ?? 0) / 10 ** decimals.size;
  const fillPrice = Number(row.fp ?? 0) / 10 ** decimals.price;
  const filled = filledSize > 0;
  return {
    ...base,
    filled,
    pending: false,
    status: ORDER_STATUS[status] ?? 'Unknown',
    filledSize,
    fillPrice: filled ? fillPrice : undefined,
    detail: filled
      ? `Long opened: ${filledSize} MON at $${fillPrice.toLocaleString('en-US', { maximumFractionDigits: 6 })}.`
      : `${ORDER_STATUS[status] ?? 'Not filled'}. ${reasonText(Number(row.sr))}`,
  };
}

type HistoryRow = Record<string, unknown> & { at?: { t?: number; txid?: string } };

const historyKey = (row: HistoryRow) => `${row.oid ?? ''}:${row.rq ?? ''}:${row.at?.t ?? ''}:${row.st ?? ''}`;

function history(key: Parameters<typeof signed>[0]) {
  return signed(key, 'GET', '/v1/trading/order-history?count=10')
    .catch(() => null) as Promise<{ d?: HistoryRow[] } | null>;
}

const FINAL = new Set([3, 4, 5, 6, 7, 10]);

/** Perpl forwards API orders to the exchange contract, so the outcome shows up a few blocks later. */
async function outcome(key: Parameters<typeof signed>[0], requestId: number, seen: Set<string>) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const rows = (await history(key))?.d ?? [];
    const fresh = rows.filter((row) => !seen.has(historyKey(row)));
    const match = fresh.find((row) => Number(row.rq) === requestId) ?? fresh[0];
    if (match && FINAL.has(Number(match.st))) return match;
  }
  return null;
}

async function marketDecimals(id: number) {
  const context = await perpl('GET', '/v1/pub/context').catch(() => null) as {
    markets?: Array<{ id: number; config?: { price_decimals?: number; size_decimals?: number } }>;
  } | null;
  const market = context?.markets?.find((row) => row.id === id);
  return { price: market?.config?.price_decimals ?? 6, size: market?.config?.size_decimals ?? 0 };
}

/** New Perpl accounts start with forwarding off, which makes the exchange reject every API order. */
function enableForwarding() {
  return setPerplForwarding(true);
}

async function sendFromPasskey(data: `0x${string}`, failure: string) {
  const wallet = meraWalletClient();
  const account = meraAddress();
  if (!account) throw new Error('Sign in with Mera first');
  const { createPublicClient, http } = await import('viem');
  const publicClient = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
  const gas = await publicClient.estimateGas({ account, to: EXCHANGE, data });
  const hash = await wallet.sendTransaction({ to: EXCHANGE, data, gas: gas + gas / 5n });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`${failure} (${hash}).`);
  return hash;
}

/** The passkey owns its Perpl account, so it switches forwarding itself. */
export function setPerplForwarding(allow: boolean) {
  return sendFromPasskey(
    encodeFunctionData({ abi: exchangeAbi, functionName: 'allowOrderForwarding', args: [allow] }),
    allow ? 'Perpl did not turn on order forwarding' : 'Perpl did not turn off order forwarding',
  );
}

/** Moves free collateral from the passkey's Perpl account back to the passkey wallet. */
export async function withdrawPerplCollateral() {
  const address = meraAddress();
  if (!address) throw new Error('Sign in with Mera first');
  const { createPublicClient, http } = await import('viem');
  const publicClient = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
  const info = await publicClient.readContract({
    address: EXCHANGE,
    abi: exchangeAbi,
    functionName: 'getAccountByAddr',
    args: [address],
  });
  const free = info.balanceCNS - info.lockedBalanceCNS;
  if (free <= 0n) throw new Error('Nothing is free to withdraw. Collateral backing an open position stays on Perpl until it closes.');
  const hash = await sendFromPasskey(
    encodeFunctionData({ abi: exchangeAbi, functionName: 'withdrawCollateral', args: [free] }),
    'Perpl did not release the collateral',
  );
  return { hash, amount: Number(formatUnits(free, 6)) };
}

export type MyPerplView = PerplAccountSnapshot & {
  address: string;
  /** False when this browser has no Perpl key for the passkey yet. */
  keyed: boolean;
};

/** Reads the passkey's own Perpl account with the key this browser already holds. Never prompts the passkey. */
export async function readMyPerplView(address: `0x${string}`): Promise<MyPerplView> {
  const onChain = await readPerplAccount(address);
  const key = await savedKey(address);
  const fallback: MyPerplView = {
    address,
    keyed: false,
    account: onChain
      ? { id: onChain.accountId, frozen: false, forwarding: false, balance: onChain.balance, locked: onChain.locked, deposited: 0, withdrawn: 0 }
      : null,
    positions: [],
    openOrders: [],
    activity: [],
    fetchedAt: Date.now(),
  };
  if (!onChain || !key?.apiKey) return fallback;
  const get = <T>(target: string) => (signed(key, 'GET', target) as Promise<T>).catch((error) => {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  });
  const [context, wallet, positions, orders, fills, orderHistory, positionHistory, accountHistory] = await Promise.all([
    perpl('GET', '/v1/pub/context') as Promise<PerplRaw['context']>,
    get<PerplRaw['wallet']>(PERPL_VIEW_PATHS.wallet),
    get<PerplRaw['positions']>(PERPL_VIEW_PATHS.positions),
    get<PerplRaw['orders']>(PERPL_VIEW_PATHS.orders),
    get<PerplRaw['fills']>(PERPL_VIEW_PATHS.fills),
    get<PerplRaw['orderHistory']>(PERPL_VIEW_PATHS.orderHistory),
    get<PerplRaw['positionHistory']>(PERPL_VIEW_PATHS.positionHistory),
    get<PerplRaw['accountHistory']>(PERPL_VIEW_PATHS.accountHistory),
  ]);
  const view = buildPerplView({ context, wallet, positions, orders, fills, orderHistory, positionHistory, accountHistory });
  if (!view.account) return fallback;
  return { ...view, address, keyed: true };
}

/** Approves a Perpl read and trade key with the passkey so this browser can load the account history. */
export async function connectPerplKey() {
  const address = meraAddress();
  if (!address) throw new Error('Sign in with the Mera passkey first');
  await enroll(await tradeKey(address));
}

export type PerplAccountView = {
  accountId: number;
  balance: number;
  locked: number;
  hasPosition: boolean;
};

/** Reads the passkey's own Perpl account straight from the exchange contract. */
export async function readPerplAccount(address: `0x${string}`): Promise<PerplAccountView | null> {
  const { createPublicClient, http } = await import('viem');
  const publicClient = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
  const info = await publicClient.readContract({
    address: EXCHANGE,
    abi: exchangeAbi,
    functionName: 'getAccountByAddr',
    args: [address],
  }).catch(() => null);
  if (!info || info.accountId === 0n) return null;
  const { bank1, bank2, bank3, bank4 } = info.positions;
  return {
    accountId: Number(info.accountId),
    balance: Number(formatUnits(info.balanceCNS, 6)),
    locked: Number(formatUnits(info.lockedBalanceCNS, 6)),
    hasPosition: [bank1, bank2, bank3, bank4].some((bank) => bank > 0n),
  };
}

export async function readPerplAccountId(address: `0x${string}`) {
  const { createPublicClient, http } = await import('viem');
  const publicClient = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
  const info = await publicClient.readContract({
    address: EXCHANGE,
    abi: exchangeAbi,
    functionName: 'getAccountByAddr',
    args: [address],
  }).catch(() => null);
  return info && info.accountId > 0n ? Number(info.accountId) : null;
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
