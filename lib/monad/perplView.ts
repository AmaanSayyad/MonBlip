import { ORDER_STATUS, reasonText } from '@/lib/monad/perplCodes';

const ORDER_TYPE = ['Order', 'Open long', 'Open short', 'Close long', 'Close short', 'Cancel', 'Add margin', 'Change'];
const POSITION_STATUS = ['Unspecified', 'Open', 'Closed', 'Liquidated', 'Deleveraged', 'Unwound', 'Failed'];
const ACCOUNT_EVENT = ['Account event', 'Deposit', 'Withdrawal', 'Margin added', 'Settlement', 'Liquidation', 'Transfer to protocol', 'Transfer from protocol', 'Funding', 'Deleveraging', 'Unwinding', 'Margin reduced', 'Request counter reset'];

type PerplTimestamp = { b?: number; t?: number; txid?: string };
type MarketInfo = { name: string; priceDecimals: number; sizeDecimals: number; mark: number | null };
type Rows<T = Record<string, unknown>> = { d?: T[] } | null;

export type PerplActivity = {
  at: number;
  kind: 'account' | 'order' | 'fill' | 'position';
  title: string;
  detail: string;
  tone: 'ok' | 'warn' | 'muted';
  tx?: string;
};

export type PerplAccountSnapshot = {
  account: null | {
    id: number;
    frozen: boolean;
    forwarding: boolean;
    balance: number;
    locked: number;
    deposited: number;
    withdrawn: number;
  };
  positions: Array<{ id: number; market: string; side: 'Long' | 'Short'; size: number; entry: number; collateral: number; leverage: number; mark: number | null }>;
  openOrders: Array<{ id: number; title: string; status: string }>;
  activity: PerplActivity[];
  fetchedAt: number;
};

export type PerplRaw = {
  context: { markets?: Array<{ id: number; name: string; config?: { price_decimals?: number; size_decimals?: number }; state?: { mrk?: number } }> } | null;
  wallet: { as?: Array<{ id: number; fr: boolean; fw: boolean; b: string; lb: string }>; sts?: Array<{ id: number; td?: string; tw?: string }> } | null;
  positions: Rows<Record<string, number | string>>;
  orders: Rows<Record<string, number | string>>;
  fills: Rows;
  orderHistory: Rows;
  positionHistory: Rows;
  accountHistory: Rows;
};

/** Signed GETs behind one account view; every call goes out together. */
export const PERPL_VIEW_PATHS = {
  wallet: '/v1/trading/wallet',
  positions: '/v1/trading/positions',
  orders: '/v1/trading/orders',
  fills: '/v1/trading/fills?count=50',
  orderHistory: '/v1/trading/order-history?count=50',
  positionHistory: '/v1/trading/position-history?count=50',
  accountHistory: '/v1/trading/account-history?count=50',
} as const;

export const ausd = (raw: string | number | undefined) => Number(raw ?? 0) / 1e6;

const txOf = (at?: PerplTimestamp) => (at?.txid && /[1-9a-f]/.test(at.txid) ? `0x${at.txid.replace(/^0x/, '')}` : undefined);

export function buildPerplView(raw: PerplRaw): PerplAccountSnapshot {
  const markets = new Map<number, MarketInfo>();
  for (const market of raw.context?.markets ?? []) {
    const priceDecimals = market.config?.price_decimals ?? 6;
    markets.set(market.id, {
      name: market.name || `Market ${market.id}`,
      priceDecimals,
      sizeDecimals: market.config?.size_decimals ?? 0,
      mark: market.state?.mrk ? market.state.mrk / 10 ** priceDecimals : null,
    });
  }
  const marketOf = (id: unknown) => markets.get(Number(id)) ?? { name: `Market ${id}`, priceDecimals: 6, sizeDecimals: 0, mark: null };
  const price = (value: unknown, mkt: unknown) => Number(value ?? 0) / 10 ** marketOf(mkt).priceDecimals;
  const size = (value: unknown, mkt: unknown) => Number(value ?? 0) / 10 ** marketOf(mkt).sizeDecimals;
  const fmtPrice = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 6 })}`;

  const empty: PerplAccountSnapshot = { account: null, positions: [], openOrders: [], activity: [], fetchedAt: Date.now() };
  const account = raw.wallet?.as?.[0];
  if (!account) return empty;
  const stats = raw.wallet?.sts?.find((row) => row.id === account.id);

  const describeOrder = (order: Record<string, unknown>) => {
    const mkt = order.mkt;
    const type = ORDER_TYPE[Number(order.t)] ?? 'Order';
    const flags = Number(order.fl);
    const limit = Number(order.p ?? 0);
    return [
      `${type} ${size(order.os, mkt)} ${marketOf(mkt).name}`,
      limit ? `limit ${fmtPrice(price(limit, mkt))}` : 'market',
      flags === 4 ? 'immediate-or-cancel' : flags === 2 ? 'fill-or-kill' : flags === 1 ? 'post-only' : 'good-till-cancel',
      `${Number(order.lv ?? 100) / 100}×`,
    ].join(' · ');
  };

  const activity: PerplActivity[] = [];
  for (const event of raw.accountHistory?.d ?? []) {
    const amount = ausd(event.a as string);
    activity.push({
      at: Number((event.at as PerplTimestamp)?.t ?? 0),
      kind: 'account',
      title: `${ACCOUNT_EVENT[Number(event.et)] ?? 'Account event'} ${amount >= 0 ? '+' : '−'}${Math.abs(amount).toFixed(2)} AUSD`,
      detail: `Balance after: ${ausd(event.b as string).toFixed(2)} AUSD${Number(event.f) ? ` · fee ${ausd(event.f as string).toFixed(4)} AUSD` : ''}`,
      tone: 'ok',
      tx: txOf(event.at as PerplTimestamp),
    });
  }
  for (const order of raw.orderHistory?.d ?? []) {
    const status = Number(order.st);
    const filled = size(order.fs, order.mkt);
    activity.push({
      at: Number((order.at as PerplTimestamp)?.t ?? 0),
      kind: 'order',
      title: describeOrder(order),
      detail: `${ORDER_STATUS[status] ?? 'Unknown'}${filled > 0 ? ` · filled ${filled} at ${fmtPrice(price(order.fp, order.mkt))}` : ' · nothing filled'}. ${reasonText(Number(order.sr))}`,
      tone: status === 4 || status === 10 ? 'ok' : status === 7 || status === 6 ? 'warn' : 'muted',
      tx: txOf(order.at as PerplTimestamp),
    });
  }
  for (const fill of raw.fills?.d ?? []) {
    activity.push({
      at: Number((fill.at as PerplTimestamp)?.t ?? 0),
      kind: 'fill',
      title: `Filled ${size(fill.s, fill.mkt)} ${marketOf(fill.mkt).name} at ${fmtPrice(price(fill.p, fill.mkt))}`,
      detail: `${Number(fill.l) === 1 ? 'Maker' : 'Taker'} · fee ${ausd(fill.f as string).toFixed(4)} AUSD`,
      tone: 'ok',
      tx: txOf(fill.at as PerplTimestamp),
    });
  }
  for (const position of raw.positionHistory?.d ?? []) {
    const pnl = ausd(position.dpnl as string) + ausd(position.fnd as string) - ausd(position.fee as string);
    activity.push({
      at: Number((position.at as PerplTimestamp)?.t ?? 0),
      kind: 'position',
      title: `${Number(position.sd) === 1 ? 'Long' : 'Short'} ${size(position.s, position.mkt)} ${marketOf(position.mkt).name} · ${POSITION_STATUS[Number(position.st)] ?? 'Updated'}`,
      detail: `Entry ${fmtPrice(price(position.ep, position.mkt))}${position.xp ? ` · exit ${fmtPrice(price(position.xp, position.mkt))}` : ''} · PnL ${pnl >= 0 ? '+' : '−'}${Math.abs(pnl).toFixed(4)} AUSD`,
      tone: pnl >= 0 ? 'ok' : 'warn',
      tx: txOf(position.at as PerplTimestamp),
    });
  }
  activity.sort((a, b) => b.at - a.at);

  return {
    account: {
      id: account.id,
      frozen: account.fr,
      forwarding: account.fw,
      balance: ausd(account.b),
      locked: ausd(account.lb),
      deposited: ausd(stats?.td),
      withdrawn: ausd(stats?.tw),
    },
    positions: (raw.positions?.d ?? []).map((position) => ({
      id: Number(position.pid),
      market: marketOf(position.mkt).name,
      side: Number(position.sd) === 1 ? 'Long' as const : 'Short' as const,
      size: size(position.s, position.mkt),
      entry: price(position.ep, position.mkt),
      collateral: ausd(position.c),
      leverage: Number(position.lv ?? 100) / 100,
      mark: marketOf(position.mkt).mark,
    })),
    openOrders: (raw.orders?.d ?? []).map((order) => ({
      id: Number(order.oid),
      title: describeOrder(order),
      status: ORDER_STATUS[Number(order.st)] ?? 'Open',
    })),
    activity,
    fetchedAt: Date.now(),
  };
}
