# Contributing Guidelines

Thanks for helping improve MonBlip. The live chain is Monad mainnet. The play assets are AUSD and MON. Changes that touch bets, balances, or withdrawals need extra care.

## Code of conduct

Be respectful. Report technical issues via the issue tracker; security issues via `docs/SECURITY_REPORTING.md`.

## How to contribute

1. Fork the repo (or create a branch in your workflow).
2. Create a new branch for your change (example: `fix/waitlist-load`).
3. Make your changes.
4. Verify with lint + tests (see below).
5. Submit a Pull Request with a clear description and test evidence.

## Prerequisites

- Node.js + Yarn (Yarn is used in this repo).
- A Supabase project + database configured with the migrations.
- (Optional) Flow toolchain if you touch contracts.

## Setup (local dev)

1. Install dependencies:

```bash
yarn install
```

If you hit a Node engine mismatch, you can use:

```bash
yarn install --ignore-engines
```

2. Use the existing `.env`. It is the only env file.

Never add `.env.local` or `.env.example`. Never commit `.env` or any secrets to Git.

## Quality checks

Run at least:

```bash
yarn lint
yarn test
```

If you touch Supabase-related logic, also run:

```bash
yarn test:db
yarn db:verify
```

If you touch Flow contracts:

```bash
yarn test:contracts
```

## Security & correctness expectations

- Never log or return secrets (private keys, seed phrases, service-role keys).
- Prefer server-side validation for any money-moving or admin action.
- If you change any balance/bet/withdrawal logic, add or update tests.
- Any new admin route should require authorization and should not expose sensitive data.

## Style and review

- Follow existing conventions in the codebase (TypeScript types, existing helper utilities, React/Next patterns).
- Keep changes focused. If a PR is large, split it.
- In PR description, include:
 - what you changed and why
 - links to related issues
 - how to test (commands + which pages/routes)

## Pull Request Guidelines

- Branch naming
  - Use `feat/...` for features (example: `feat/dashboard-demo-real-metrics`)
  - Use `fix/...` for bug fixes (example: `fix/waitlist-load`)
  - Use `docs/...` for documentation updates
  - Use `chore/...` for tooling/refactors that do not change behavior
- Pull request description template
  - Summary (2-4 sentences): what changed and why
  - Risk assessment: which parts of the app could be affected (balances, payouts, admin endpoints, UI)
  - Test plan: exact commands you ran and where you verified behavior
  - Notes for reviewers: any assumptions, follow-ups, or known limitations
- Required checks before requesting review
  - `yarn lint`
  - `yarn test`
  - If you touched Supabase logic: `yarn test:db` and `yarn db:verify`
  - If you touched contracts: `yarn test:contracts`
- Security checklist for PRs that touch money movement or admin routes
  - Confirm the change does not expose secrets to the client
  - Confirm server routes use correct authorization and do not rely on unauthenticated anon access for sensitive data
  - Confirm any new/changed DB queries respect RLS expectations
- Review expectations
  - Be ready to justify correctness and edge cases, not only style
  - Expect security and reliability review for any PR that impacts: bets, payouts, balances, withdrawals, leaderboard/admin reads
  - If a PR is blocking an incident response, mention it explicitly in the PR description

## Bug Report Guidelines

Before filing a bug:

- Check existing issues to avoid duplicates.
- If you suspect a security issue, do not open a public bug. Use `docs/SECURITY_REPORTING.md` instead.

Use this template (copy/paste):

- Title: short summary of the problem
- Environment
  - App version/commit (or deployment link)
  - Browser + version
  - Network (Monad), asset (AUSD or MON), and mode (real/demo)
  - Any relevant feature flags/config
- Steps to reproduce
  1. ...
  2. ...
  3. ...
- Expected behavior
- Actual behavior
- Frequency
  - Always / Often / Sometimes / Rarely
- Logs/evidence
  - Browser console output (paste error text)
  - Network request errors (route + status code)
  - Screenshots/screen recordings (if UI-related)
- Impact/severity suggestion
  - Low: cosmetic issue
  - Medium: functionality issue that users can work around
  - High: affects money movement, balances, payouts, admin access, or breaks trading

Thanks for reporting bugs responsibly: include enough detail for someone else to reproduce the issue quickly.

## Commit message suggestions

Use a short imperative message, for example:

- `fix: update leaderboard timeout handling`
- `feat: split demo and real dashboard stats`
- `docs: add security reporting workflow`

