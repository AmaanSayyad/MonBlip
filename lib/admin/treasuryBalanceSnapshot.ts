import { ethers } from 'ethers';
import { EVM_CHAINS, treasuryAddressFor } from '@/lib/chains/supported';

export type TreasuryBalanceRow = {
  chain: string;
  label: string;
  address: string;
  asset: string;
  balance: number | null;
  error?: string;
  explorerUrl: string | null;
};

export async function buildTreasuryBalanceSnapshot(): Promise<{
  generatedAt: string;
  rows: TreasuryBalanceRow[];
}> {
  const address = treasuryAddressFor('MONAD');
  const spec = EVM_CHAINS.MONAD;
  const row: TreasuryBalanceRow = {
    chain: 'MONAD',
    label: 'Monad — AUSD treasury',
    address,
    asset: 'AUSD',
    balance: null,
    explorerUrl: address ? `${spec.explorer}/address/${address}` : null,
  };
  const mon: TreasuryBalanceRow = {
    chain: 'MONAD',
    label: 'Monad — MON treasury',
    address,
    asset: 'MON',
    balance: null,
    explorerUrl: address ? `${spec.explorer}/address/${address}` : null,
  };
  if (address && spec.token) {
    try {
      const provider = new ethers.JsonRpcProvider(spec.rpc, spec.chainId, { staticNetwork: true });
      try {
        const token = new ethers.Contract(
          spec.token.address,
          ['function balanceOf(address) view returns (uint256)'],
          provider,
        );
        const raw: bigint = await token.balanceOf(address);
        row.balance = Number(ethers.formatUnits(raw, spec.token.decimals));
        const native = await provider.getBalance(address);
        mon.balance = Number(ethers.formatUnits(native, 18));
      } finally {
        provider.destroy();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'balance read failed';
      row.error = message;
      mon.error = message;
    }
  }
  return { generatedAt: new Date().toISOString(), rows: address ? [row, mon] : [] };
}
