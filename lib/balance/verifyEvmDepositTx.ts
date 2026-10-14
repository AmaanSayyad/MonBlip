import { ethers } from 'ethers';
import { evmChainForCurrency, playCurrency, treasuryAddressFor } from '@/lib/chains/supported';

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

/** Floor a JSON number into units. `0.1.toFixed(18)` rounds up and rejects an exact 0.1 transfer. */
function amountToUnits(amount: number, decimals: number): bigint {
  const text = String(amount);
  if (!/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.test(text)) {
    return ethers.parseUnits(amount.toFixed(decimals), decimals);
  }
  const match = text.match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  if (!match) return 0n;
  const digits = `${match[1]}${match[2] ?? ''}`;
  const exp = (match[2]?.length ?? 0) - Number(match[3] ?? 0);
  const scale = decimals - exp;
  if (scale >= 0) return BigInt(digits) * 10n ** BigInt(scale);
  return BigInt(digits.slice(0, digits.length + scale) || '0');
}

function traceSendsValue(node: unknown, user: string, treasury: string, want: bigint): boolean {
  if (!node || typeof node !== 'object') return false;
  const call = node as { from?: string; to?: string; value?: string; error?: string; calls?: unknown[] };
  const value = BigInt(call.value || '0x0');
  if (
    !call.error
    && call.from?.toLowerCase() === user
    && call.to?.toLowerCase() === treasury
    && value >= want
  ) {
    return true;
  }
  return (call.calls ?? []).some((child) => traceSendsValue(child, user, treasury, want));
}

/** Confirm an AUSD or native MON transfer from the trader to the Monad treasury. */
export async function verifyEvmDepositTx(
  txHash: string,
  userAddress: string,
  amount: number,
  currency: string,
): Promise<boolean> {
  const spec = evmChainForCurrency(currency);
  const treasury = spec ? treasuryAddressFor(spec.network) : '';
  if (!spec || !treasury) return false;

  try {
    const provider = new ethers.JsonRpcProvider(spec.rpc, spec.chainId, { staticNetwork: true });
    if (playCurrency(currency) === 'MON') {
      const want = amountToUnits(Number(amount), 18);
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt || receipt.status !== 1) return false;
      const tx = await provider.getTransaction(txHash);
      const user = userAddress.toLowerCase();
      const house = treasury.toLowerCase();
      if (
        tx
        && tx.from.toLowerCase() === user
        && tx.to?.toLowerCase() === house
        && tx.value >= want
      ) {
        return true;
      }
      // MetaMask can relay an EIP-7702 account. The outer transaction is from a
      // relayer with no value; the MON moves in an inner call from the trader.
      const trace = await provider.send('debug_traceTransaction', [txHash, { tracer: 'callTracer' }]);
      return traceSendsValue(trace, user, house, want);
    }
    if (!spec.token) return false;
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1) return false;
    const want = amountToUnits(amount, spec.token.decimals);
    const fromTopic = ethers.zeroPadValue(userAddress, 32).toLowerCase();
    const toTopic = ethers.zeroPadValue(treasury, 32).toLowerCase();
    return receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== spec.token!.address.toLowerCase()) return false;
      if (log.topics[0] !== TRANSFER_TOPIC) return false;
      if (log.topics[1]?.toLowerCase() !== fromTopic) return false;
      if (log.topics[2]?.toLowerCase() !== toTopic) return false;
      return BigInt(log.data) >= want;
    });
  } catch (err) {
    console.error('[verifyEvmDepositTx] RPC error:', err);
    return false;
  }
}
