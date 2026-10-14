import { createHash, generateKeyPairSync, randomBytes, sign as signEd, type KeyObject } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { encodeFunctionData, erc20Abi, formatUnits, hashTypedData, recoverTypedDataAddress } from 'viem';
import { monad } from 'viem/chains';
import { MONAD_AUSD } from '@/lib/chains/supported';
import { dynamicAddress, dynamicWalletClient, signDynamicDigest } from '@/lib/monad/dynamicHedge';

const PERPL = 'https://app.perpl.xyz/api';
const EXCHANGE = '0x34B6552d57a35a1D042CcAe1951BD1C370112a6F' as const;
const CHAIN_ID = 143;
const keyFile = path.join(process.cwd(), '.dynamic', 'perpl-ed25519.json');

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
  await mkdir(path.dirname(keyFile), { recursive: true });
  await writeFile(keyFile, JSON.stringify(stored), { mode: 0o600 });
  return { stored, privateKey: pair.privateKey };
}

function remember(stored: StoredKey, apiKey: string) {
  const next = { ...stored, apiKey };
  return writeFile(keyFile, JSON.stringify(next), { mode: 0o600 }).then(() => next);
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
      ? 'Perpl accepted the house order.'
      : 'Perpl evaluated the house order and did not accept it.',
  };
}
