import { createHash, generateKeyPairSync, randomBytes, sign as signEd, type KeyObject } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { encodeFunctionData, erc20Abi, formatUnits, hashTypedData, recoverTypedDataAddress } from 'viem';
import { monad } from 'viem/chains';
import { MONAD_AUSD } from '@/lib/chains/supported';
import { dynamicAddress, dynamicWalletClient, signDynamicDigest } from '@/lib/monad/dynamicHedge';
import { stateFile, writeState } from '@/lib/server/stateFile';
import { ausd, buildPerplView, PERPL_VIEW_PATHS, type PerplAccountSnapshot, type PerplActivity, type PerplRaw } from '@/lib/monad/perplView';

const PERPL = 'https://app.perpl.xyz/api';
const EXCHANGE = '0x34B6552d57a35a1D042CcAe1951BD1C370112a6F' as const;
const CHAIN_ID = 143;
const keyFile = stateFile('.dynamic', 'perpl-ed25519.json');

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
    name: 'allowOrderForwarding',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'allow', type: 'bool' }],
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

export type HouseOrder = {
  submitted: boolean;
  signed: boolean;
  enrolled: boolean;
  address: string;
  authorization: string;
  hedge: {
    venue: 'perpl';
    marketId: number;
    side: 'buy' | 'sell';
    notional: number;
    reason: string;
  };
  statuses?: unknown;
  detail: string;
};

function b64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64');
}

function b64url(bytes: Uint8Array) {
  return b64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function rawPublic(key: KeyObject) {
  const der = key.export({ format: 'der', type: 'spki' });
  const raw = der.subarray(der.length - 32);
  return `0x${raw.toString('hex')}`;
}

async function loadKey(address: string): Promise<{ stored: StoredKey; privateKey: KeyObject }> {
  try {
    const parsed = JSON.parse(await readFile(keyFile, 'utf8')) as StoredKey;
    if (parsed.address.toLowerCase() === address.toLowerCase() && parsed.pkcs8 && parsed.publicKey) {
      const { createPrivateKey } = await import('node:crypto');
      return {
        stored: parsed,
        privateKey: createPrivateKey({ key: Buffer.from(parsed.pkcs8, 'base64'), format: 'der', type: 'pkcs8' }),
      };
    }
  } catch {
    // First hedge creates the trade key.
  }
  const pair = generateKeyPairSync('ed25519');
  const pkcs8 = pair.privateKey.export({ format: 'der', type: 'pkcs8' });
  const stored: StoredKey = {
    address,
    pkcs8: b64(pkcs8),
    publicKey: rawPublic(pair.publicKey),
  };
  await writeState(keyFile, JSON.stringify(stored)).catch(() => {});
  return { stored, privateKey: pair.privateKey };
}

function remember(stored: StoredKey, apiKey: string) {
  const next = { ...stored, apiKey };
  return writeState(keyFile, JSON.stringify(next)).catch(() => {}).then(() => next);
}

async function perpl(method: 'GET' | 'POST', target: string, payload = '', headers?: Record<string, string>) {
  const response = await fetch(`${PERPL}${target}`, {
    method,
    headers: {
      Origin: 'https://app.perpl.xyz',
      Accept: 'application/json',
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: method === 'POST' ? payload : undefined,
    cache: 'no-store',
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
    const error = new Error(`${method} ${target} ${response.status}: ${message}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data;
}

async function enroll(address: string, key: { stored: StoredKey; privateKey: KeyObject }) {
  if (key.stored.apiKey) return key.stored;
  const payload = await perpl('POST', '/v1/api-key/payload', JSON.stringify({
    chain_id: CHAIN_ID,
    address,
    public_key: key.stored.publicKey,
    scope_mask: 3,
    label: 'MonBlip house',
  })) as {
    typed_data: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    };
    mac: string;
  };
  const typed = payload.typed_data;
  const { EIP712Domain: _domain, ...types } = typed.types;
  const domain = { ...typed.domain };
  if (typeof domain.chainId === 'string') {
    domain.chainId = domain.chainId.startsWith('0x') ? Number(domain.chainId) : Number(domain.chainId);
  }
  const digest = hashTypedData({
    domain,
    types,
    primaryType: typed.primaryType,
    message: typed.message,
  } as never);
  const signed = await signDynamicDigest(digest, { ...typed, domain, types });
  const recovered = await recoverTypedDataAddress({
    domain,
    types,
    primaryType: typed.primaryType,
    message: typed.message,
    signature: signed.signature,
  } as never);
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    throw new Error(`Dynamic typed-data signature recovered ${recovered}, expected ${address}`);
  }
  const digestBytes = Buffer.from(digest.slice(2), 'hex');
  const pop = signEd(null, digestBytes, key.privateKey);
  const enrolled = await perpl('POST', '/v1/api-key/enroll', JSON.stringify({
    chain_id: CHAIN_ID,
    address,
    typed_data: typed,
    mac: payload.mac,
    signature: signed.signature,
    pop_signature: `0x${pop.toString('hex')}`,
  })) as { api_key?: string | { api_key?: string } };
  const apiKey = typeof enrolled.api_key === 'string' ? enrolled.api_key : enrolled.api_key?.api_key;
  if (!apiKey) throw new Error('Perpl enrolled the key without returning a token');
  return remember(key.stored, apiKey);
}

async function signed(stored: StoredKey, privateKey: KeyObject, method: 'GET' | 'POST', target: string, payload = '') {
  if (!stored.apiKey) throw new Error('Perpl trade key is not enrolled');
  const timestamp = Date.now().toString();
  const nonce = b64url(randomBytes(16));
  const bodyHash = createHash('sha256').update(payload).digest('hex');
  const canonical = [CHAIN_ID, method, target, timestamp, nonce, bodyHash].join('\n');
  const sig = signEd(null, Buffer.from(canonical), privateKey);
  return perpl(method, target, payload, {
    'X-API-Key': stored.apiKey,
    'X-API-Timestamp': timestamp,
    'X-API-Nonce': nonce,
    'X-API-Signature': b64url(sig),
  });
}

async function openAccount(amountRaw: bigint) {
  const { address, walletClient } = await dynamicWalletClient();
  const { createPublicClient, http } = await import('viem');
  const publicClient = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
  const balance = await publicClient.readContract({
    address: MONAD_AUSD,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
  if (balance < amountRaw) {
    throw new Error(`The Dynamic hedge wallet holds ${formatUnits(balance, 6)} AUSD. Perpl needs ${formatUnits(amountRaw, 6)} AUSD in that wallet before the house can open an account.`);
  }
  const allowance = await publicClient.readContract({
    address: MONAD_AUSD,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address, EXCHANGE],
  });
  if (allowance < amountRaw) {
    const approveHash = await walletClient.writeContract({
      address: MONAD_AUSD,
      abi: erc20Abi,
      functionName: 'approve',
      args: [EXCHANGE, amountRaw],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }
  const data = encodeFunctionData({ abi: exchangeAbi, functionName: 'createAccount', args: [amountRaw] });
  const hash = await walletClient.sendTransaction({ to: EXCHANGE, data });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function submitHouseOrder(input: {
  direction: 'UP' | 'DOWN';
  notional: number;
  marketId: number;
  authorization: string;
}): Promise<HouseOrder> {
  const address = await dynamicAddress();

  const hedge = {
    venue: 'perpl' as const,
    marketId: input.marketId,
    side: input.direction === 'UP' ? 'sell' as const : 'buy' as const,
    notional: input.notional,
    reason: 'Offset a one-sided MonBlip book',
  };

  const key = await loadKey(address);
  let enrolled;
  try {
    enrolled = await enroll(address, key);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 404) throw error;
    const context = await perpl('GET', '/v1/pub/context') as {
      instances?: Array<{ min_account_open_amount?: string }>;
    };
    const minRaw = BigInt(context.instances?.[0]?.min_account_open_amount || '10000000');
    const { createPublicClient, http } = await import('viem');
    const publicClient = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
    const ausd = await publicClient.readContract({
      address: MONAD_AUSD,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    });
    const mon = await publicClient.getBalance({ address });
    if (ausd < minRaw || mon === 0n) {
      throw new Error(`Perpl has no profile for the Dynamic hedge wallet. It holds ${formatUnits(ausd, 6)} AUSD and ${formatUnits(mon, 18)} MON, so the house order was not sent.`);
    }
    await openAccount(minRaw);
    enrolled = await enroll(address, key);
  }

  type PerplWallet = { as?: Array<{ id: number; lfr: number }> };
  let wallet: PerplWallet | null = null;
  try {
    wallet = await signed(enrolled, key.privateKey, 'GET', '/v1/trading/wallet') as PerplWallet;
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
    await openAccount(minRaw);
    wallet = await signed(enrolled, key.privateKey, 'GET', '/v1/trading/wallet') as PerplWallet;
    account = wallet?.as?.[0];
  }
  if (!account) {
    return {
      submitted: false,
      signed: true,
      enrolled: true,
      address,
      authorization: input.authorization,
      hedge,
      detail: 'The trade key is enrolled. Perpl has no account for the Dynamic wallet yet.',
    };
  }

  const requestId = Number(account.lfr || 0) + 1;
  const order = {
    mt: 30,
    d: [{
      rq: requestId,
      mkt: input.marketId,
      acc: account.id,
      t: hedge.side === 'buy' ? 1 : 2,
      p: 0,
      s: 1,
      ms: 100,
      fl: 4,
      lv: 100,
      lb: 0,
    }],
  };
  const body = JSON.stringify(order);
  const statuses = await signed(enrolled, key.privateKey, 'POST', '/v1/trading/orders', body);
  const codes = (statuses as { statuses?: Array<{ code?: number } | number> })?.statuses;
  const accepted = !codes || codes.every((code) => (typeof code === 'number' ? code : code.code) === 0);
  return {
    submitted: accepted,
    signed: true,
    enrolled: true,
    address,
    authorization: input.authorization,
    hedge,
    statuses,
    detail: accepted
      ? 'Perpl queued the house order. The house account view shows whether it filled on-chain.'
      : 'Perpl evaluated the house order and did not accept it.',
  };
}

export type HouseActivity = PerplActivity;

export type HouseAccountView = PerplAccountSnapshot & {
  address: string;
  enrolled: boolean;
  detail?: string;
  /** AUSD sitting in the hedge wallet itself, outside Perpl. */
  walletAusd: number;
};

async function monadClient() {
  const { createPublicClient, http } = await import('viem');
  return createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
}

async function readWalletAusd(address: `0x${string}`) {
  const client = await monadClient();
  return client.readContract({ address: MONAD_AUSD, abi: erc20Abi, functionName: 'balanceOf', args: [address] });
}

export type HouseClaim = {
  to: string;
  withdrawn: number;
  sent: number;
  withdrawTx?: `0x${string}`;
  transferTx?: `0x${string}`;
};

/** Claims and forwarding changes share the hedge wallet nonce, so only one runs at a time. */
let writing = false;

async function exclusive<T>(run: () => Promise<T>): Promise<T> {
  if (writing) throw new Error('The hedge wallet is busy with another transaction. Try again in a minute.');
  writing = true;
  try {
    return await run();
  } finally {
    writing = false;
  }
}

/** Sends allowOrderForwarding from the hedge wallet, which owns the Perpl account. */
export async function setHouseForwarding(allow: boolean): Promise<{ forwarding: boolean; tx: `0x${string}` }> {
  return exclusive(async () => {
    const { walletClient } = await dynamicWalletClient();
    const client = await monadClient();
    const tx = await walletClient.writeContract({
      address: EXCHANGE,
      abi: exchangeAbi,
      functionName: 'allowOrderForwarding',
      args: [allow],
      gas: 120_000n,
    } as never);
    const receipt = await client.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== 'success') throw new Error(`Perpl did not change forwarding (${tx}).`);
    return { forwarding: allow, tx };
  });
}

/**
 * Pulls the free Perpl collateral back to the hedge wallet, then sends every AUSD
 * the hedge wallet holds to `to`. MON stays behind for gas.
 */
export async function claimHouseFunds(to: `0x${string}`): Promise<HouseClaim> {
  return exclusive(async () => {
    const { address, walletClient } = await dynamicWalletClient();
    const client = await monadClient();
    let withdrawTx: `0x${string}` | undefined;
    let withdrawn = 0n;

    const info = await client.readContract({
      address: EXCHANGE,
      abi: exchangeAbi,
      functionName: 'getAccountByAddr',
      args: [address],
    }).catch(() => null);
    if (info && info.accountId > 0n) {
      const free = info.balanceCNS - info.lockedBalanceCNS;
      if (free >= 10_000n) {
        withdrawTx = await walletClient.writeContract({
          address: EXCHANGE,
          abi: exchangeAbi,
          functionName: 'withdrawCollateral',
          args: [free],
          gas: 200_000n,
        } as never);
        const receipt = await client.waitForTransactionReceipt({ hash: withdrawTx });
        if (receipt.status !== 'success') throw new Error(`Perpl withdrawal reverted (${withdrawTx}).`);
        withdrawn = free;
      }
    }

    const balance = await readWalletAusd(address);
    if (balance === 0n) {
      throw new Error('There is no AUSD to claim. The Perpl account and the hedge wallet are both empty.');
    }
    const transferTx = await walletClient.writeContract({
      address: MONAD_AUSD,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to, balance],
      gas: 80_000n,
    } as never);
    const receipt = await client.waitForTransactionReceipt({ hash: transferTx });
    if (receipt.status !== 'success') throw new Error(`AUSD transfer reverted (${transferTx}).`);

    return { to, withdrawn: ausd(withdrawn.toString()), sent: ausd(balance.toString()), withdrawTx, transferTx };
  });
}

/** Read-only view of the house Perpl account. Uses the stored trade key and never creates a key or an account. */
export async function readHouseAccount(): Promise<HouseAccountView> {
  let stored: StoredKey | null = null;
  try {
    stored = JSON.parse(await readFile(keyFile, 'utf8')) as StoredKey;
  } catch {
    stored = null;
  }
  const address = stored?.address ?? await dynamicAddress().catch(() => '');
  const walletAusd = address ? ausd((await readWalletAusd(address as `0x${string}`).catch(() => 0n)).toString()) : 0;
  const empty: HouseAccountView = { address, enrolled: false, walletAusd, account: null, positions: [], openOrders: [], activity: [], fetchedAt: Date.now() };
  if (!stored?.apiKey || !stored.pkcs8) {
    return { ...empty, detail: 'This server has no enrolled Perpl trade key for the house wallet yet.' };
  }
  const { createPrivateKey } = await import('node:crypto');
  const privateKey = createPrivateKey({ key: Buffer.from(stored.pkcs8, 'base64'), format: 'der', type: 'pkcs8' });
  const get = <T>(target: string) => signed(stored!, privateKey, 'GET', target).then((data) => data as T).catch((error) => {
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
  if (!view.account) return { ...empty, enrolled: true, detail: 'The house wallet has no Perpl account yet.' };
  return { ...view, address, enrolled: true, walletAusd };
}
