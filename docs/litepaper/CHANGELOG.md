# Litepaper Changelog

## v1.5.0 - 2026-10-14

- The live desk is Monad only. Play assets are AUSD and MON.
- Sponsors are Mera, MetaMask, Agora, Aurora, Envio, Chainlink CRE, Dynamic, Perpl, and Nansen.
- Prices are Pyth, then an exchange quote. CRE closes the round.
- Founder links replace product URLs in the builder note.

## v1.4.0 - 2026-10-11

- Rewrote the document to the live desk: Classic, Box, Draw, and Blitz on Robinhood Chain, Solana, Base, Arbitrum, and Tempo.
- Prices are described as Chainlink on Robinhood Chain, then Hyperliquid mids, then public quotes.
- Removed the old token section. Older unsupported ledger rows are refused, not converted.
- Dropped the origin story and the twelve-chain list. Those are not the product.

## v1.3.0 - 2026-04-09

- Bumped document version and “current state” to reflect Aptos (APT) and treasury/backend hardening.
- Multi-chain topology: Aptos adapter and treasury node in architecture diagram; expanded adapter list in prose.
- Scope: clarified Blitz entry fee in native gas vs house ledger; noted separate SUI vs USDC house ledgers on Sui.
- Risk: auto-approval threshold for APT (10) aligned with production config.
- Security: documented the optional internal secret gate for balance mutation routes.
- Roadmap: chain-expansion note on matching treasury keys (NEAR full-access, Aptos Ed25519, etc.).
- Removed unused `Metadata` import on `/litepaper` page; fixed `'use client'` directive formatting.

## v1.0.0 - 2026-04-01

- Initial public litepaper published.
- Added core sections for architecture, risk, security, utility, and roadmap.
- Published web route at `/litepaper`.

