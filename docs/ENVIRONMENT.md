# Environment

The app reads one file: `.env`. Do not add `.env.local` or `.env.example`. Next.js would let `.env.local` override `.env`.

Do not commit `.env`, and do not paste secret values into chat or docs.

## Live chain

Monad mainnet, chain ID 143. RPC `https://rpc.monad.xyz`. Explorer https://monadvision.com.

| Use | Public address | Notes |
|---|---|---|
| Treasury | `0xcbae80461bb820e4075035f765f8a46fa65a6ded` | AUSD and MON deposits and payouts |
| AUSD | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` | 6 decimals |
| Fee wallet | `0x9B4d9039A96Bfd7320C865aaCC69F35b51f425a7` | `NEXT_PUBLIC_PLATFORM_FEE_WALLET_EVM` |

The human account is a Mera passkey. MetaMask is the other wallet. Privy is not the Monad login.

## App and data

`NEXT_PUBLIC_APP_URL` is the public origin, `https://monblip.fun`. A value that still contains `tapt`, `localhost`, or `127.0.0.1` is ignored for canonical links.

`NEXT_PUBLIC_SUPABASE_URL`
`NEXT_PUBLIC_SUPABASE_ANON_KEY`
`SUPABASE_SERVICE_KEY`

`BALANCE_SETTLEMENT_SECRET`
`BALANCE_INTERNAL_SECRET`

`NEXT_PUBLIC_POSTHOG_KEY`
`NEXT_PUBLIC_POSTHOG_HOST`

## Sponsors

`AURORA_INTENTS_API_KEY` quotes a deposit address that delivers MON. `AURORA_MONAD_AUSD_ASSET` stays empty while Aurora does not list AUSD on Monad.

`DYNAMIC_AUTH_TOKEN`, `DYNAMIC_ENVIRONMENT_ID`, and `DYNAMIC_WALLET_PASSWORD` sign the house hedge. `DYNAMIC_AGENT_PRIVATE_KEY` stays empty. Local runs keep the hedge wallet in `.dynamic/hedge-wallet.json`. Hosted runs read the same metadata from `DYNAMIC_HEDGE_WALLET`.

`PERPL_CLAIM_ADDRESSES` lists the passkeys that may claim house Perpl funds, comma separated.

`NANSEN_API_KEY` reads wallet labels. `ENVIO_API_TOKEN` reads HyperSync.

`CRE_WEBHOOK_SECRET` is set only when the Chainlink CRE workflow sends `x-cre-secret`. The local settle route is `/api/monad/settle`.

`CRE_ETH_PRIVATE_KEY` is for the CRE CLI. It lives in the same `.env`, so run the simulation from `cre/` with `-e ../.env`:

```bash
cre workflow simulate round-close -e ../.env --target staging-settings --non-interactive --trigger-index 0 --http-payload payload.json --skip-type-checks --allow-unknown-chains
```

## Prices and admin

`PYTH_PRO_ENABLE` stays `false` unless a Pro key is in use. The chart reads Pyth, then an exchange quote.

`DASHBOARD_PASSWORD` signs the admin session. `ADMIN_SESSION_HOURS` is optional.
