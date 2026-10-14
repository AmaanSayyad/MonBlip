import {
  type CommandIO,
  InputFieldType,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from '@metamask/agent-wallet/plugin';
import { appUrl, AUSD, MAX_UNITS, MONAD_CHAIN_ID, parseUnits, transferCalldata, TREASURY, withinCap } from '../../terms.js';

const inputs = {
  asset: {
    type: InputFieldType.Select,
    flag: 'asset',
    message: 'Asset to send to the house',
    required: true,
    options: [
      { value: 'AUSD', label: 'AUSD' },
      { value: 'MON', label: 'MON' },
    ],
  },
  amount: {
    type: InputFieldType.Text,
    flag: 'amount',
    message: 'Amount, at most 10',
    required: true,
  },
} satisfies InputSchema;

type FundResult = {
  submitted: boolean;
  status: string;
  hash?: string;
  credited?: boolean;
  balance?: number;
  detail: string;
};

export default class MonblipFund extends PluginCommand<FundResult> {
  static override description = 'Send AUSD or MON to the MonBlip house through the Agent Wallet.';
  static override examples = ['<%= config.bin %> monblip fund --asset AUSD --amount 1'];
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = 'monblip:fund';

  async execute(io: CommandIO): Promise<FundResult> {
    const { asset, amount } = await io.resolveInputs(inputs);
    if (!withinCap(amount)) {
      throw new Error(`An agent fund is capped at ${MAX_UNITS} ${asset}.`);
    }
    const executor = await this.ctx.walletExecutor(io, 'monblip:fund');
    const native = asset === 'MON';
    const result = await executor(
      {
        kind: 'transaction',
        chainId: MONAD_CHAIN_ID,
        transaction: native
          ? { to: TREASURY, value: parseUnits(amount, 18) }
          : { to: AUSD, data: transferCalldata(TREASURY, parseUnits(amount, 6)), value: 0n },
        intent: {
          action: 'transfer',
          summary: `Transfer ${amount} ${asset} to the MonBlip house`,
        },
      },
      { waitForReceipt: true },
    );
    if (result.kind !== 'transaction' || !result.hash) {
      return {
        submitted: false,
        status: result.status,
        detail: 'The Agent Wallet has not broadcast this transfer. House balance was not credited.',
      };
    }
    const tx = await this.ctx.publicClient(MONAD_CHAIN_ID).getTransaction({ hash: result.hash as `0x${string}` });
    const credit = await fetch(`${appUrl()}/api/monad/agent-fund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userAddress: tx.from,
        amount: Number(amount),
        txHash: result.hash,
        currency: asset,
      }),
    });
    const body = (await credit.json().catch(() => ({}))) as { newBalance?: number; error?: string };
    return {
      submitted: true,
      status: result.status,
      hash: result.hash,
      credited: credit.ok,
      balance: body.newBalance,
      detail: credit.ok ? 'House balance credited after the on-chain transfer.' : body.error || 'The transfer is on-chain and the house did not credit it.',
    };
  }
}
