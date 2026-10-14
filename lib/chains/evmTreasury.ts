import { ethers } from 'ethers';
import { EVM_CHAINS, playCurrency, type EvmPlayNetwork, type PlayCurrency, treasuryAddressFor } from '@/lib/chains/supported';

const TIP20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
];

function rpcProvider(url: string, chainId: number) {
  return new ethers.JsonRpcProvider(url, chainId, { staticNetwork: true });
}

function requireSecret(network: EvmPlayNetwork): string {
  const raw = process.env[EVM_CHAINS[network].secretEnv];
  if (!raw?.trim()) throw new Error(`${EVM_CHAINS[network].secretEnv} is not set`);
  const key = raw.trim();
  return key.startsWith('0x') ? key : `0x${key}`;
}

/** Send AUSD or native MON from the Monad treasury. Gas is declared because Monad charges the limit. */
export async function transferFromEvmTreasury(
  network: EvmPlayNetwork,
  recipient: string,
  amount: number,
  asset: PlayCurrency = 'AUSD',
): Promise<string> {
  const spec = EVM_CHAINS[network];
  const treasury = treasuryAddressFor(network);
  if (!treasury) throw new Error(`${spec.treasuryEnv} is not set`);

  const provider = rpcProvider(spec.rpc, spec.chainId);
  const wallet = new ethers.Wallet(requireSecret(network), provider);
  try {
    if (playCurrency(asset) === 'MON') {
      const value = ethers.parseUnits(amount.toFixed(18), 18);
      const gasLimit = await wallet.estimateGas({ to: recipient, value });
      const tx = await wallet.sendTransaction({ to: recipient, value, gasLimit });
      const receipt = await tx.wait();
      if (!receipt) throw new Error('MON payout was not confirmed');
      return receipt.hash;
    }
    if (!spec.token) throw new Error('Monad AUSD payout is not configured');
    const token = new ethers.Contract(spec.token.address, TIP20_ABI, wallet);
    const units = ethers.parseUnits(amount.toFixed(spec.token.decimals), spec.token.decimals);
    const tx = await token.transfer(recipient, units, { gasLimit: 80_000n });
    const receipt = await tx.wait();
    return receipt.hash;
  } finally {
    provider.destroy();
  }
}

export async function readEvmWalletBalance(
  network: EvmPlayNetwork,
  address: string,
  asset: PlayCurrency = 'AUSD',
): Promise<number> {
  const spec = EVM_CHAINS[network];
  const provider = rpcProvider(spec.rpc, spec.chainId);
  try {
    if (playCurrency(asset) === 'MON') {
      const raw = await provider.getBalance(address);
      return Number(ethers.formatUnits(raw, 18));
    }
    if (!spec.token) return 0;
    const token = new ethers.Contract(spec.token.address, TIP20_ABI, provider);
    const raw: bigint = await token.balanceOf(address);
    return Number(ethers.formatUnits(raw, spec.token.decimals));
  } finally {
    provider.destroy();
  }
}
