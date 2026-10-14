import { formatUnits } from 'viem';
import { MONAD_AUSD, treasuryAddressFor } from '@/lib/chains/supported';

const HYPERSYNC = 'https://monad.hypersync.xyz/query';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const LOOKBACK = 5_000_000n;

export type FundingRow = {
  kind: 'deposit' | 'withdrawal';
  asset: 'AUSD' | 'MON';
  amount: string;
  tx: string;
  block: number;
};

export type TraderFunding = {
  source: 'envio-hypersync';
  chainId: 143;
  trader: string;
  deposits: number;
  withdrawals: number;
  ausdIn: string;
  ausdOut: string;
  monIn: string;
  monOut: string;
  rows: FundingRow[];
};

type RawLog = {
  block_number?: number;
  transaction_hash?: string;
  data?: string;
  topic1?: string;
  topic2?: string;
};

type RawTrace = {
  block_number?: number;
  transaction_hash?: string;
  hash?: string;
  from?: string;
  to?: string;
  value?: string;
};

function padTopic(address: string) {
  return `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
}

function topicAddress(topic?: string) {
  if (!topic) return '';
  return `0x${topic.toLowerCase().replace(/^0x/, '').slice(-40)}`;
}

function asBig(value?: string) {
  if (!value) return 0n;
  try {
    return value.startsWith('0x') ? BigInt(value) : BigInt(value);
  } catch {
    return 0n;
  }
}

async function query(token: string, body: Record<string, unknown>) {
  const response = await fetch(HYPERSYNC, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text.slice(0, 180) || `HyperSync returned ${response.status}`);
  }
  const parsed = JSON.parse(text) as {
    archive_height?: number;
    archiveHeight?: number;
    data?: { logs?: RawLog[]; traces?: RawTrace[]; transactions?: RawTrace[] } | Array<{ logs?: RawLog[]; traces?: RawTrace[]; transactions?: RawTrace[] }>;
  };
  const chunks = Array.isArray(parsed.data) ? parsed.data : parsed.data ? [parsed.data] : [];
  return {
    archive_height: parsed.archive_height,
    archiveHeight: parsed.archiveHeight,
    data: {
      logs: chunks.flatMap((chunk) => chunk.logs || []),
      traces: chunks.flatMap((chunk) => chunk.traces || []),
      transactions: chunks.flatMap((chunk) => chunk.transactions || []),
    },
  };
}

export async function traderFunding(trader: string): Promise<TraderFunding> {
  const token = process.env.ENVIO_API_TOKEN?.trim();
  if (!token) {
    throw new Error('ENVIO_API_TOKEN is not set. Create a free token at https://app.envio.dev/api-tokens');
  }
  const treasury = treasuryAddressFor('MONAD');
  if (!/^0x[0-9a-fA-F]{40}$/.test(treasury)) {
    throw new Error('The Monad treasury address is not configured');
  }
  const wallet = trader.toLowerCase();
  const house = treasury.toLowerCase();

  const heightBody = await query(token, {
    from_block: 1,
    to_block: 2,
    field_selection: { block: ['number'] },
  });
  const height = BigInt(heightBody.archive_height || heightBody.archiveHeight || 0);
  const fromBlock = height > LOOKBACK ? height - LOOKBACK : 110_000_000n;

  const result = await query(token, {
    from_block: Number(fromBlock),
    logs: [
      { address: [MONAD_AUSD], topics: [[TRANSFER], [padTopic(wallet)], [padTopic(house)]] },
      { address: [MONAD_AUSD], topics: [[TRANSFER], [padTopic(house)], [padTopic(wallet)]] },
    ],
    transactions: [
      { from: [wallet], to: [house] },
      { from: [house], to: [wallet] },
    ],
    traces: [
      { from: [wallet], to: [house] },
      { from: [house], to: [wallet] },
    ],
    field_selection: {
      log: ['block_number', 'transaction_hash', 'data', 'topic1', 'topic2'],
      transaction: ['block_number', 'hash', 'from', 'to', 'value'],
      trace: ['block_number', 'transaction_hash', 'from', 'to', 'value'],
    },
    max_num_logs: 200,
    max_num_transactions: 200,
    max_num_traces: 200,
  });

  const rows: Array<FundingRow & { raw: bigint }> = [];
  for (const log of result.data?.logs || []) {
    const from = topicAddress(log.topic1);
    const to = topicAddress(log.topic2);
    const amount = asBig(log.data);
    if (amount <= 0n || !log.transaction_hash) continue;
    const deposit = from === wallet && to === house;
    const withdrawal = from === house && to === wallet;
    if (!deposit && !withdrawal) continue;
    rows.push({
      kind: deposit ? 'deposit' : 'withdrawal',
      asset: 'AUSD',
      amount: formatUnits(amount, 6),
      tx: log.transaction_hash,
      block: Number(log.block_number || 0),
      raw: amount,
    });
  }
  const movements = [...(result.data?.transactions || []), ...(result.data?.traces || [])];
  const seenMon = new Set<string>();
  for (const trace of movements) {
    const from = (trace.from || '').toLowerCase();
    const to = (trace.to || '').toLowerCase();
    const amount = asBig(trace.value);
    const tx = trace.transaction_hash || trace.hash;
    if (amount <= 0n || !tx || seenMon.has(tx)) continue;
    seenMon.add(tx);
    const deposit = from === wallet && to === house;
    const withdrawal = from === house && to === wallet;
    if (!deposit && !withdrawal) continue;
    rows.push({
      kind: deposit ? 'deposit' : 'withdrawal',
      asset: 'MON',
      amount: formatUnits(amount, 18),
      tx,
      block: Number(trace.block_number || 0),
      raw: amount,
    });
  }

  rows.sort((a, b) => b.block - a.block);
  const sum = (asset: 'AUSD' | 'MON', kind: FundingRow['kind']) => rows
    .filter((row) => row.asset === asset && row.kind === kind)
    .reduce((total, row) => total + row.raw, 0n);

  return {
    source: 'envio-hypersync',
    chainId: 143,
    trader: wallet,
    deposits: rows.filter((row) => row.kind === 'deposit').length,
    withdrawals: rows.filter((row) => row.kind === 'withdrawal').length,
    ausdIn: formatUnits(sum('AUSD', 'deposit'), 6),
    ausdOut: formatUnits(sum('AUSD', 'withdrawal'), 6),
    monIn: formatUnits(sum('MON', 'deposit'), 18),
    monOut: formatUnits(sum('MON', 'withdrawal'), 18),
    rows: rows.slice(0, 20).map(({ raw: _raw, ...row }) => row),
  };
}
