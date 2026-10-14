import { readFile } from 'node:fs/promises';
import type { WalletMetadata } from '@dynamic-labs-wallet/node';
import { stateFile, writeState } from '@/lib/server/stateFile';

const walletFile = stateFile('.dynamic', 'hedge-wallet.json');

function credentials() {
  const authToken = process.env.DYNAMIC_AUTH_TOKEN?.trim();
  const environmentId = process.env.DYNAMIC_ENVIRONMENT_ID?.trim();
  const password = process.env.DYNAMIC_WALLET_PASSWORD?.trim();
  if (!authToken || !environmentId || !password) return null;
  return { authToken, environmentId, password };
}

/** Hosted runs lose the state file, and signing needs the full metadata, so it can also come from the environment. */
async function savedWallet(): Promise<WalletMetadata | null> {
  const sources = [
    () => readFile(walletFile, 'utf8'),
    async () => process.env.DYNAMIC_HEDGE_WALLET?.trim() || '',
  ];
  for (const source of sources) {
    try {
      const parsed = JSON.parse(await source()) as WalletMetadata;
      if (parsed?.walletId && parsed?.accountAddress) return parsed;
    } catch {
      // First signature creates the wallet.
    }
  }
  return null;
}

async function remember(wallet: WalletMetadata) {
  await writeState(walletFile, JSON.stringify(wallet)).catch(() => {});
}

type DynamicSession = {
  client: import('@dynamic-labs-wallet/node-evm').DynamicEvmWalletClient;
  wallet: WalletMetadata;
  password: string;
};

/**
 * The house hedge is a Dynamic server wallet: developer-owned MPC shares,
 * not the trader's Mera passkey and not a raw private key.
 */
async function openSession(): Promise<DynamicSession> {
  const creds = credentials();
  if (!creds) {
    throw new Error(
      'Dynamic server wallet is not configured. Set DYNAMIC_AUTH_TOKEN, DYNAMIC_ENVIRONMENT_ID, and DYNAMIC_WALLET_PASSWORD from https://app.dynamic.xyz',
    );
  }

  const { DynamicEvmWalletClient } = await import('@dynamic-labs-wallet/node-evm');
  const { ThresholdSignatureScheme } = await import('@dynamic-labs-wallet/core');
  const client = new DynamicEvmWalletClient({
    environmentId: creds.environmentId,
    enableMPCAccelerator: false,
  });
  await client.authenticateApiToken(creds.authToken);

  let wallet = await savedWallet();
  if (!wallet) {
    try {
      const existing = await client.getEvmWallets();
      const first = existing.find((entry) => entry.accountAddress && entry.walletId);
      if (first) {
        wallet = {
          walletId: first.walletId,
          accountAddress: first.accountAddress,
          chainName: first.chainName,
          thresholdSignatureScheme: first.thresholdSignatureScheme,
          derivationPath: first.derivationPath,
          externalServerKeySharesBackupInfo: first.externalServerKeySharesBackupInfo,
        };
        await remember(wallet);
      }
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      const message = error instanceof Error ? error.message : '';
      if (status !== 404 && !message.includes('404')) throw error;
    }
  }
  if (!wallet) {
    const created = await client.createWalletAccount({
      thresholdSignatureScheme: ThresholdSignatureScheme.TWO_OF_TWO,
      password: creds.password,
      backUpToDynamic: true,
    });
    wallet = created.walletMetadata;
    await remember(wallet);
  }

  return { client, wallet, password: creds.password };
}

let cached: { at: number; value: Promise<DynamicSession> } | null = null;

async function session() {
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.value;
  const value = openSession();
  cached = { at: Date.now(), value };
  try {
    return await value;
  } catch (error) {
    cached = null;
    throw error;
  }
}

export async function dynamicAddress() {
  const { wallet } = await session();
  return wallet.accountAddress as `0x${string}`;
}

export async function signDynamicHedge(message: string) {
  const { client, wallet, password } = await session();
  const signature = await client.signMessage({
    message,
    walletMetadata: wallet,
    password,
  });
  return { address: wallet.accountAddress, signature };
}

export async function signDynamicDigest(digest: `0x${string}`, typedData: {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}) {
  const { client, wallet, password } = await session();
  const signature = await client.signRawMessage({
    message: digest,
    walletMetadata: wallet,
    password,
    context: { evmTypedData: typedData as never },
  });
  return { address: wallet.accountAddress as `0x${string}`, signature: signature as `0x${string}` };
}

export async function signDynamicTypedData(typedData: {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}) {
  const { client, wallet, password } = await session();
  const signature = await client.signTypedData({
    walletMetadata: wallet,
    password,
    typedData: typedData as never,
  });
  return { address: wallet.accountAddress as `0x${string}`, signature };
}

export async function dynamicWalletClient() {
  const { client, wallet, password } = await session();
  const { monad } = await import('viem/chains');
  const walletClient = await client.getWalletClient({
    walletMetadata: wallet,
    password,
    chain: monad,
    chainId: 143,
    rpcUrl: 'https://rpc.monad.xyz',
  });
  return { address: wallet.accountAddress as `0x${string}`, walletClient };
}
