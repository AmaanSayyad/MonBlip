import { type CommandIO, PluginCommand } from '@metamask/agent-wallet/plugin';
import { MAX_UNITS, payoutFor } from '../../terms.js';

type DeskResult = {
  asset: 'BTC';
  price: number;
  durations: Array<{ seconds: number; payout: number }>;
  cap: string;
};

export default class MonblipDesk extends PluginCommand<DeskResult> {
  static override description = 'Show the MonBlip BTC round terms. Does not touch the wallet.';
  static override examples = ['<%= config.bin %> monblip desk'];
  static override requiresAuth = false;
  static override requiresInit = false;
  protected readonly pluginCommandId = 'monblip:desk';

  async execute(_io: CommandIO): Promise<DeskResult> {
    const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    if (!response.ok) throw new Error('The BTC price feed did not answer.');
    const body = (await response.json()) as { price?: string };
    const price = Number(body.price);
    if (!Number.isFinite(price)) throw new Error('The BTC price feed did not answer.');
    return {
      asset: 'BTC',
      price,
      durations: [5, 10, 15, 30, 60].map((seconds) => ({ seconds, payout: payoutFor(seconds) })),
      cap: `${MAX_UNITS} AUSD or MON per agent command`,
    };
  }

  override successHint(data: DeskResult): string {
    return `BTC ${data.price}. A 5s UP or DOWN pays ${payoutFor(5)}x, capped at ${MAX_UNITS}.`;
  }
}
