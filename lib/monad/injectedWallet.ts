'use client';

import { createPublicClient, createWalletClient, custom, erc20Abi, http, parseUnits, type Address } from 'viem';
import { monad } from 'viem/chains';
import { MONAD_AUSD, playCurrency, type PlayCurrency } from '@/lib/chains/supported';
import { useOverflowStore } from '@/lib/store';
import { readStored, removeStored, writeStored } from '@/lib/brand/browserStore';

const KIND_KEY = 'monblip.wallet.kind';
const MONAD_HEX = '0x8f';

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
};

let active = false;

function provider(): EthereumProvider {
  const root = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!root) throw new Error('MetaMask is not installed in this browser.');
  const nested = root.providers?.find((item) => item.isMetaMask);
  return nested ?? root;
}

function friendly(error: unknown): Error {
  const code = (error as { code?: number }).code;
  if (code === 4001) return new Error('The MetaMask request was cancelled.');
  if (error instanceof Error && error.message) return error;
  return new Error('MetaMask request failed.');
}

async function ensureMonad(eth: EthereumProvider) {
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD_HEX }] });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await eth.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: MONAD_HEX,
        chainName: 'Monad',
        nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
        rpcUrls: ['https://rpc.monad.xyz'],
        blockExplorerUrls: ['https://monadvision.com'],
      }],
    });
  }
}

function applyAccount(address: Address) {
  active = true;
  writeStored(KIND_KEY, 'metamask');
  const store = useOverflowStore.getState();
  store.setAddress(address);
  store.setIsConnected(true);
  store.setNetwork('MONAD');
  store.setPreferredNetwork('MONAD');
  const saved = readStored('monblip.play.currency', ['tapt.play.currency']);
  store.setSelectedCurrency(saved === 'MON' ? 'MON' : 'AUSD');
  void store.refreshWalletBalance();
  void store.fetchProfile(address);
  void store.fetchBalance(address);
}

function onAccountsChanged(accounts: unknown) {
  const next = Array.isArray(accounts) ? String(accounts[0] || '') : '';
  if (!next) {
    disconnectMetaMask();
    const store = useOverflowStore.getState();
    store.setAddress(null);
    store.setIsConnected(false);
    store.setNetwork(null);
    return;
  }
  applyAccount(next as Address);
}

function onChainChanged() {
  if (!active) return;
  void ensureMonad(provider()).catch(() => disconnectMetaMask());
}

function bind(eth: EthereumProvider) {
  eth.removeListener?.('accountsChanged', onAccountsChanged);
  eth.removeListener?.('chainChanged', onChainChanged);
  eth.on?.('accountsChanged', onAccountsChanged);
  eth.on?.('chainChanged', onChainChanged);
}

export function metaMaskActive() {
  return active;
}

export async function connectMetaMask() {
  try {
    const eth = provider();
    await ensureMonad(eth);
    const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
    const address = accounts[0];
    if (!address) throw new Error('MetaMask did not return an account.');
    bind(eth);
    const { endMeraSigner } = await import('@/lib/monad/account');
    endMeraSigner();
    applyAccount(address as Address);
    return address as Address;
  } catch (error) {
    throw friendly(error);
  }
}

export async function restoreMetaMask() {
  if (readStored(KIND_KEY, ['tapt.wallet.kind']) !== 'metamask') return;
  const root = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!root) return;
  try {
    const eth = provider();
    const accounts = (await eth.request({ method: 'eth_accounts' })) as string[];
    if (!accounts[0]) return;
    await ensureMonad(eth);
    bind(eth);
    const { endMeraSigner } = await import('@/lib/monad/account');
    endMeraSigner();
    applyAccount(accounts[0] as Address);
  } catch {
    removeStored(KIND_KEY, ['tapt.wallet.kind']);
  }
}

export function disconnectMetaMask() {
  if (typeof window !== 'undefined') {
    const root = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    if (root) {
      const eth = root.providers?.find((item) => item.isMetaMask) ?? root;
      eth.removeListener?.('accountsChanged', onAccountsChanged);
      eth.removeListener?.('chainChanged', onChainChanged);
    }
    if (readStored(KIND_KEY, ['tapt.wallet.kind']) === 'metamask') removeStored(KIND_KEY, ['tapt.wallet.kind']);
  }
  active = false;
}

function walletClient(address: Address) {
  return createWalletClient({
    account: address,
    chain: monad,
    transport: custom(provider()),
  });
}

export async function signMetaMaskMessage(message: string): Promise<`0x${string}`> {
  const store = useOverflowStore.getState();
  const address = store.address as Address | null;
  if (!active || !address) throw new Error('Connect MetaMask first.');
  return walletClient(address).signMessage({ account: address, message });
}

export function hasInjectedWallet() {
  return typeof window !== 'undefined' && Boolean((window as Window & { ethereum?: EthereumProvider }).ethereum);
}

const GAS_FLOOR = parseUnits('0.02', 18);
const GAS_TOP_UP = parseUnits('0.05', 18);

/**
 * Sends funds from MetaMask to another Monad address, such as a Mera passkey
 * wallet, without making MetaMask the desk account. An AUSD top-up also sends
 * a little MON when the recipient cannot pay gas for its own deposit.
 */
export async function topUpFromMetaMask(
  asset: PlayCurrency,
  amount: number,
  recipient: Address,
  onStep?: (step: 'connect' | 'send' | 'gas' | 'confirm') => void,
): Promise<`0x${string}`> {
  try {
    const eth = provider();
    onStep?.('connect');
    await ensureMonad(eth);
    const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
    const from = accounts[0] as Address | undefined;
    if (!from) throw new Error('MetaMask did not return an account.');
    if (from.toLowerCase() === recipient.toLowerCase()) throw new Error('MetaMask is already this wallet.');
    const wallet = walletClient(from);
    const pub = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
    const isMon = playCurrency(asset) === 'MON';
    const value = parseUnits(amount.toFixed(isMon ? 18 : 6), isMon ? 18 : 6);
    const held = isMon
      ? await pub.getBalance({ address: from })
      : await pub.readContract({ address: MONAD_AUSD, abi: erc20Abi, functionName: 'balanceOf', args: [from] });
    if (held < value) throw new Error(`MetaMask holds less than ${amount} ${isMon ? 'MON' : 'AUSD'} on Monad.`);
    onStep?.('send');
    const hash = isMon
      ? await wallet.sendTransaction({ account: from, chain: monad, to: recipient, value, gas: 21_000n })
      : await wallet.writeContract({
          account: from,
          chain: monad,
          address: MONAD_AUSD,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [recipient, value],
          gas: 80_000n,
        });
    onStep?.('confirm');
    await pub.waitForTransactionReceipt({ hash });
    if (!isMon && (await pub.getBalance({ address: recipient })) < GAS_FLOOR) {
      onStep?.('gas');
      const gasHash = await wallet.sendTransaction({ account: from, chain: monad, to: recipient, value: GAS_TOP_UP, gas: 21_000n });
      await pub.waitForTransactionReceipt({ hash: gasHash });
    }
    return hash;
  } catch (error) {
    throw friendly(error);
  }
}

export async function depositWithMetaMask(
  asset: PlayCurrency,
  amount: number,
  treasury: Address,
): Promise<`0x${string}`> {
  const store = useOverflowStore.getState();
  const address = store.address as Address | null;
  if (!active || !address) throw new Error('Connect MetaMask first.');
  await ensureMonad(provider());
  const wallet = walletClient(address);
  const hash = playCurrency(asset) === 'MON'
    ? await wallet.sendTransaction({
        account: address,
        chain: monad,
        to: treasury,
        value: parseUnits(amount.toFixed(18), 18),
        gas: 21_000n,
      })
    : await wallet.writeContract({
        account: address,
        chain: monad,
        address: MONAD_AUSD,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [treasury, parseUnits(amount.toFixed(6), 6)],
        gas: 80_000n,
      });
  const pub = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}
