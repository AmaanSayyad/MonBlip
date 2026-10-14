const RULES: Array<[RegExp, string]> = [
  [/user rejected|user denied|rejected the request|request rejected|\b4001\b|action_rejected/i, 'You cancelled the request in the wallet.'],
  [/notallowederror|operation either timed out or was not allowed|passkey was not confirmed/i, 'The passkey prompt was closed or timed out. Try again.'],
  [/recovery id|signature recovery/i, 'The passkey could not sign this transfer. Reload the page and try again.'],
  [/insufficient funds|exceeds the balance|exceeds balance|gas required exceeds/i, 'Not enough MON to cover the amount and gas.'],
  [/nonce too low|nonce has already been used|replacement transaction underpriced|already known/i, 'An earlier transfer is still settling. Try again in a few seconds.'],
  [/http request failed|fetch failed|failed to fetch|network error|timed out|timeout|econnreset|503|502/i, 'Monad RPC did not answer. Try again in a moment.'],
  [/chain mismatch|wrong network|chain id/i, 'Switch the wallet to Monad (chain 143) and try again.'],
];

/** One readable sentence for a wallet or transaction error. Raw viem text carries request dumps and versions. */
export function friendlyTxError(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  const raw =
    error instanceof Error
      ? `${(error as { shortMessage?: string }).shortMessage ?? ''} ${error.message}`
      : typeof error === 'string'
        ? error
        : '';
  if (!raw.trim()) return fallback;
  for (const [pattern, text] of RULES) if (pattern.test(raw)) return text;
  const short = (error as { shortMessage?: string } | null)?.shortMessage;
  const line = (short || raw).split(/\n|Request Arguments:|Details:|Version:/)[0].trim();
  return line.length > 0 && line.length <= 140 ? line : fallback;
}
