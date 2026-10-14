'use client';

import { encodeFunctionData, erc20Abi, numberToHex } from 'viem';
import type { AuroraToken } from '@/lib/aurora/catalog';

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isRabby?: boolean;
  providers?: EthereumProvider[];
};

type StandardAccount = { address: string; chains: readonly string[] };

/** The slice of a Wallet Standard wallet that MetaMask's Solana account exposes. */
type StandardWallet = {
  name: string;
  chains: readonly string[];
  accounts: readonly StandardAccount[];
  features: {
    'standard:connect'?: { connect: () => Promise<{ accounts: readonly StandardAccount[] }> };
    'solana:signAndSendTransaction'?: {
      signAndSendTransaction: (
        ...inputs: Array<{ account: StandardAccount; transaction: Uint8Array; chain: string }>
      ) => Promise<Array<{ signature: Uint8Array }>>;
    };
  };
};

const WALLET = 'MetaMask';
const SOLANA_MAINNET = 'solana:mainnet';

type EvmChain = { id: number; name: string; rpc: string; native: string; explorer: string };

const EVM_CHAINS: Record<string, EvmChain> = {
  eth: { id: 1, name: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com', native: 'ETH', explorer: 'https://etherscan.io' },
  base: { id: 8453, name: 'Base', rpc: 'https://mainnet.base.org', native: 'ETH', explorer: 'https://basescan.org' },
  arb: { id: 42161, name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc', native: 'ETH', explorer: 'https://arbiscan.io' },
  op: { id: 10, name: 'OP Mainnet', rpc: 'https://mainnet.optimism.io', native: 'ETH', explorer: 'https://optimistic.etherscan.io' },
  bsc: { id: 56, name: 'BNB Smart Chain', rpc: 'https://bsc-dataseed.bnbchain.org', native: 'BNB', explorer: 'https://bscscan.com' },
  pol: { id: 137, name: 'Polygon', rpc: 'https://polygon-rpc.com', native: 'POL', explorer: 'https://polygonscan.com' },
  avax: { id: 43114, name: 'Avalanche C-Chain', rpc: 'https://api.avax.network/ext/bc/C/rpc', native: 'AVAX', explorer: 'https://snowtrace.io' },
  gnosis: { id: 100, name: 'Gnosis', rpc: 'https://rpc.gnosischain.com', native: 'xDAI', explorer: 'https://gnosisscan.io' },
  scroll: { id: 534352, name: 'Scroll', rpc: 'https://rpc.scroll.io', native: 'ETH', explorer: 'https://scrollscan.com' },
  bera: { id: 80094, name: 'Berachain', rpc: 'https://rpc.berachain.com', native: 'BERA', explorer: 'https://berascan.com' },
  xlayer: { id: 196, name: 'X Layer', rpc: 'https://rpc.xlayer.tech', native: 'OKB', explorer: 'https://www.oklink.com/xlayer' },
  abs: { id: 2741, name: 'Abstract', rpc: 'https://api.mainnet.abs.xyz', native: 'ETH', explorer: 'https://abscan.org' },
  plasma: { id: 9745, name: 'Plasma', rpc: 'https://rpc.plasma.to', native: 'XPL', explorer: 'https://plasmascan.to' },
};

const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://solana-rpc.publicnode.com';

export type WalletKind = 'evm' | 'solana';

export type WalletPayment = {
  kind: WalletKind;
  wallet: string;
  from: string;
  txHash: string;
  explorer: string;
};

/** MetaMask's EVM provider. Other injected wallets that pose as MetaMask (Rabby) are skipped. */
function metaMaskEvm(): EthereumProvider | null {
  if (typeof window === 'undefined') return null;
  const root = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!root) return null;
  const candidates = root.providers?.length ? root.providers : [root];
  return candidates.find((item) => item.isMetaMask && !item.isRabby) ?? null;
}

/** MetaMask registers its Solana account through the Wallet Standard; this collects the wallets already loaded. */
function metaMaskSolana(): StandardWallet | null {
  if (typeof window === 'undefined') return null;
  const wallets: StandardWallet[] = [];
  const api = {
    register: (...items: StandardWallet[]) => {
      wallets.push(...items);
      return () => undefined;
    },
  };
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  return wallets.find((wallet) =>
    /metamask/i.test(wallet.name)
    && wallet.chains.some((chain) => chain.startsWith('solana:'))
    && Boolean(wallet.features['solana:signAndSendTransaction'])) ?? null;
}

/** Whether MetaMask can pay this token directly in this browser. */
export function walletFor(token: AuroraToken): { kind: WalletKind; name: string } | null {
  if (EVM_CHAINS[token.blockchain]) return metaMaskEvm() ? { kind: 'evm', name: WALLET } : null;
  if (token.blockchain === 'sol') return metaMaskSolana() ? { kind: 'solana', name: WALLET } : null;
  return null;
}

/** True when the token's chain has a wallet path at all, installed or not. */
export function walletChainSupported(token: AuroraToken) {
  return Boolean(EVM_CHAINS[token.blockchain]) || token.blockchain === 'sol';
}

function friendly(error: unknown, wallet: string): Error {
  const code = (error as { code?: number }).code;
  if (code === 4001 || /reject|denied|cancel/i.test(String((error as Error)?.message))) {
    return new Error(`The request was cancelled in ${wallet}. Nothing was sent.`);
  }
  if (error instanceof Error && error.message) return error;
  return new Error(`${wallet} could not send the deposit.`);
}

const NO_EVM = 'Install MetaMask to deposit from here, or send to the deposit address yourself.';
const NO_SOLANA = 'Turn on Solana in MetaMask to deposit SOL from here, or send to the deposit address yourself.';

async function solanaAccount(wallet: StandardWallet): Promise<StandardAccount> {
  const existing = wallet.accounts.find((account) => account.chains.some((chain) => chain.startsWith('solana:')));
  if (existing) return existing;
  const connect = wallet.features['standard:connect'];
  if (!connect) throw new Error(`${WALLET} did not offer a Solana account.`);
  const { accounts } = await connect.connect();
  const account = accounts.find((item) => item.chains.some((chain) => chain.startsWith('solana:'))) ?? accounts[0];
  if (!account) throw new Error(`${WALLET} did not share a Solana account.`);
  return account;
}

/** Connects MetaMask for this token's chain and returns the sender address, used as the refund address. */
export async function connectPayingWallet(token: AuroraToken): Promise<{ address: string; wallet: string }> {
  if (EVM_CHAINS[token.blockchain]) {
    const eth = metaMaskEvm();
    if (!eth) throw new Error(NO_EVM);
    try {
      const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
      if (!accounts?.[0]) throw new Error(`${WALLET} did not share an account.`);
      return { address: accounts[0], wallet: WALLET };
    } catch (error) {
      throw friendly(error, WALLET);
    }
  }
  if (token.blockchain === 'sol') {
    const sol = metaMaskSolana();
    if (!sol) throw new Error(NO_SOLANA);
    try {
      const account = await solanaAccount(sol);
      return { address: account.address, wallet: WALLET };
    } catch (error) {
      throw friendly(error, WALLET);
    }
  }
  throw new Error('MetaMask deposits work for EVM chains and Solana. Copy the deposit address for this chain instead.');
}

async function switchEvmChain(eth: EthereumProvider, chain: EvmChain) {
  const chainId = numberToHex(chain.id);
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await eth.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId,
        chainName: chain.name,
        nativeCurrency: { name: chain.native, symbol: chain.native, decimals: 18 },
        rpcUrls: [chain.rpc],
        blockExplorerUrls: [chain.explorer],
      }],
    });
  }
}

async function payEvm(token: AuroraToken, amountRaw: bigint, to: string): Promise<WalletPayment> {
  const chain = EVM_CHAINS[token.blockchain];
  const eth = metaMaskEvm();
  if (!eth) throw new Error(NO_EVM);
  const wallet = WALLET;
  try {
    const [from] = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
    await switchEvmChain(eth, chain);
    const tx = token.contract
      ? {
          from,
          to: token.contract,
          data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to as `0x${string}`, amountRaw] }),
        }
      : { from, to, value: numberToHex(amountRaw) };
    const txHash = (await eth.request({ method: 'eth_sendTransaction', params: [tx] })) as string;
    return { kind: 'evm', wallet, from, txHash, explorer: `${chain.explorer}/tx/${txHash}` };
  } catch (error) {
    throw friendly(error, wallet);
  }
}

async function paySolana(token: AuroraToken, amountRaw: bigint, to: string): Promise<WalletPayment> {
  const sol = metaMaskSolana();
  if (!sol) throw new Error(NO_SOLANA);
  const wallet = WALLET;
  try {
    const { Connection, PublicKey, SystemProgram, Transaction } = await import('@solana/web3.js');
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const account = await solanaAccount(sol);
    const fromKey = account.address;
    const from = new PublicKey(fromKey);
    const recipient = new PublicKey(to);
    const transaction = new Transaction();

    if (!token.contract) {
      transaction.add(SystemProgram.transfer({ fromPubkey: from, toPubkey: recipient, lamports: amountRaw }));
    } else {
      const spl = await import('@solana/spl-token');
      const mint = new PublicKey(token.contract);
      const mintInfo = await connection.getAccountInfo(mint);
      if (!mintInfo) throw new Error(`Solana does not know the ${token.symbol} mint.`);
      const programId = mintInfo.owner;
      const source = spl.getAssociatedTokenAddressSync(mint, from, false, programId);
      const destination = spl.getAssociatedTokenAddressSync(mint, recipient, true, programId);
      transaction.add(
        spl.createAssociatedTokenAccountIdempotentInstruction(from, destination, recipient, mint, programId),
        spl.createTransferCheckedInstruction(source, mint, destination, from, amountRaw, token.decimals, [], programId),
      );
    }

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = from;
    const [sent] = await sol.features['solana:signAndSendTransaction']!.signAndSendTransaction({
      account,
      transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
      chain: SOLANA_MAINNET,
    });
    const { default: bs58 } = await import('bs58');
    const txHash = bs58.encode(sent.signature);
    return { kind: 'solana', wallet, from: fromKey, txHash, explorer: `https://solscan.io/tx/${txHash}` };
  } catch (error) {
    throw friendly(error, wallet);
  }
}

/** Opens the wallet with the transfer to Aurora's deposit address filled in. The user approves it there. */
export async function payDeposit(token: AuroraToken, amountRaw: string, depositAddress: string, memo?: string): Promise<WalletPayment> {
  const amount = BigInt(amountRaw);
  if (amount <= 0n) throw new Error('The quote has no amount to send.');
  const payment = EVM_CHAINS[token.blockchain]
    ? await payEvm(token, amount, depositAddress)
    : token.blockchain === 'sol'
      ? await paySolana(token, amount, depositAddress)
      : null;
  if (!payment) throw new Error('MetaMask deposits work for EVM chains and Solana.');
  void fetch('/api/monad/aurora/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash: payment.txHash, depositAddress, memo }),
  }).catch(() => undefined);
  return payment;
}
