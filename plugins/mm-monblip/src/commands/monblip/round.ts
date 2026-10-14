import {
  type CommandIO,
  InputFieldType,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from '@metamask/agent-wallet/plugin';
import { appUrl, MAX_UNITS, MONAD_CHAIN_ID, roundMessage, withinCap } from '../../terms.js';

const inputs = {
  direction: {
    type: InputFieldType.Select,
    flag: 'direction',
    message: 'Direction',
    required: true,
    options: [
      { value: 'UP', label: 'UP' },
      { value: 'DOWN', label: 'DOWN' },
    ],
  },
  amount: {
    type: InputFieldType.Text,
    flag: 'amount',
    message: 'Stake, at most 10',
    required: true,
  },
  currency: {
    type: InputFieldType.Select,
    flag: 'currency',
    message: 'House balance to stake',
    required: true,
    options: [
      { value: 'AUSD', label: 'AUSD' },
      { value: 'MON', label: 'MON' },
    ],
  },
  duration: {
    type: InputFieldType.Select,
    flag: 'duration',
    message: 'Round length in seconds',
    required: true,
    options: [
      { value: '5', label: '5s' },
      { value: '10', label: '10s' },
      { value: '15', label: '15s' },
      { value: '30', label: '30s' },
      { value: '60', label: '1m' },
    ],
  },
} satisfies InputSchema;

type RoundResult = {
  signed: boolean;
  status: string;
  betId?: string;
  remainingBalance?: number;
  detail: string;
};

export default class MonblipRound extends PluginCommand<RoundResult> {
  static override description = 'Sign a MonBlip BTC round with the Agent Wallet, then stake house balance.';
  static override examples = ['<%= config.bin %> monblip round --direction UP --amount 1 --currency AUSD --duration 5'];
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = 'monblip:round';

  async execute(io: CommandIO): Promise<RoundResult> {
    const flags = await io.resolveInputs(inputs);
    const direction = flags.direction;
    const currency = flags.currency;
    const duration = Number(flags.duration);
    if (!withinCap(flags.amount)) throw new Error(`An agent round is capped at ${MAX_UNITS} ${currency}.`);
    const message = roundMessage({
      direction: direction as 'UP' | 'DOWN',
      amount: flags.amount,
      currency: currency as 'AUSD' | 'MON',
      duration,
    });
    const executor = await this.ctx.walletExecutor(io, 'monblip:round');
    const result = await executor({
      kind: 'message',
      chainId: MONAD_CHAIN_ID,
      message,
      intent: {
        action: 'custom',
        summary: `Stake ${flags.amount} ${currency} on BTC ${direction} for ${duration}s`,
      },
    });
    if (result.kind !== 'signature' || !result.signature) {
      return {
        signed: false,
        status: result.status,
        detail: 'The Agent Wallet did not sign this round. No stake was taken.',
      };
    }
    const response = await fetch(`${appUrl()}/api/monad/agent-round`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        direction,
        amount: flags.amount,
        currency,
        duration,
        signature: result.signature,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      betId?: string;
      remainingBalance?: number;
      error?: string;
    };
    return {
      signed: true,
      status: result.status,
      betId: body.betId,
      remainingBalance: body.remainingBalance,
      detail: response.ok ? 'Round staked from house balance.' : body.error || 'The signature was not accepted.',
    };
  }
}
