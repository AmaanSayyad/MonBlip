const NANSEN_URL = 'https://api.nansen.ai/api/v1/profiler/address/labels';

export type DeskRead = {
  configured: boolean;
  stance: 'exchange' | 'fund' | 'named' | 'unlabeled' | 'unknown';
  title: string;
  detail: string;
};

type NansenLabel = { label?: string; category?: string | null };

const cache = new Map<string, { at: number; read: DeskRead }>();

function configured() {
  return Boolean(process.env.NANSEN_API_KEY?.trim());
}

function stanceFor(labels: NansenLabel[]): DeskRead {
  const named = labels.find((row) => row.label);
  if (!named?.label) {
    return {
      configured: true,
      stance: 'unlabeled',
      title: 'Unlabeled',
      detail: 'Nansen has no public label for this wallet. Treat the result as an unknown trader.',
    };
  }
  const category = (named.category || '').toLowerCase();
  const label = named.label;
  if (category === 'cefi' || category === 'exchange' || /binance|coinbase|okx|kraken|bybit/i.test(label)) {
    return {
      configured: true,
      stance: 'exchange',
      title: label,
      detail: `${label} is a labeled exchange wallet. Fading it is fading a venue.`,
    };
  }
  if (category === 'defi' || category === 'smart_money') {
    return {
      configured: true,
      stance: 'fund',
      title: label,
      detail: `${label} is a labeled onchain entity. The board is not an anonymous trader.`,
    };
  }
  return {
    configured: true,
    stance: 'named',
    title: label,
    detail: `Nansen names this wallet ${label}.`,
  };
}

async function fetchLabels(key: string, address: string, chain: string) {
  const response = await fetch(NANSEN_URL, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({
      address,
      chain,
      pagination: { page: 1, per_page: 10 },
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = typeof body.message === 'string' ? body.message : `Address labels returned ${response.status}.`;
    return { ok: false as const, status: response.status, labels: [] as NansenLabel[], message };
  }
  const body = await response.json();
  const labels: NansenLabel[] = Array.isArray(body.data) ? body.data : [];
  return { ok: true as const, status: response.status, labels, message: '' };
}

/** Monad first. An empty Monad page still has labels on other chains, which Nansen returns under chain "all". */
async function labelsFor(key: string, address: string): Promise<NansenLabel[]> {
  const monad = await fetchLabels(key, address, 'monad');
  if (!monad.ok) throw new Error(monad.message);
  if (monad.labels.length > 0) return monad.labels;
  const all = await fetchLabels(key, address, 'all');
  return all.ok ? all.labels : monad.labels;
}

/** Turns Nansen labels into a trading stance. The raw label list stays on Nansen. */
export async function readWallet(address: string): Promise<DeskRead> {
  const key = process.env.NANSEN_API_KEY?.trim();
  if (!key) {
    return {
      configured: false,
      stance: 'unknown',
      title: 'Nansen is not configured',
      detail: 'Set NANSEN_API_KEY from https://nansen.ai. The desk cannot tell a venue from an unknown wallet until then.',
    };
  }
  if (!address.startsWith('0x')) {
    return {
      configured: true,
      stance: 'unknown',
      title: 'Not an EVM wallet',
      detail: 'Nansen labels on this desk are for Monad addresses.',
    };
  }

  const cached = cache.get(address.toLowerCase());
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.read;

  let labels: NansenLabel[];
  try {
    labels = await labelsFor(key, address);
  } catch (error) {
    return {
      configured: true,
      stance: 'unknown',
      title: 'Nansen did not answer',
      detail: error instanceof Error ? error.message : 'Address labels failed.',
    };
  }
  const read = stanceFor(labels);
  cache.set(address.toLowerCase(), { at: Date.now(), read });
  return read;
}

export function nansenConfigured() {
  return configured();
}
