# mm-plugin-monblip

An Agent Wallet plugin for the MonBlip desk on Monad. It adds three `mm` commands:

- `mm monblip desk` reads the BTC price and the round terms. It does not sign.
- `mm monblip fund` sends at most 10 AUSD or 10 MON to the house treasury. The Agent Wallet signs and broadcasts the transaction. Policy and MFA stay in the wallet.
- `mm monblip round` asks the Agent Wallet to sign a round. MonBlip checks that signature, then stakes that wallet's house balance.

The plugin does not hold a key. If the wallet has not returned a transaction hash or a signature, the house is not credited and the round is not staked.

## Install

Requires Agent Wallet `v6.2.0` or newer.

```bash
cd plugins/mm-monblip
npm install
npm run build
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install "file:$PWD" --accept-permissions
mm monblip desk
```

The live desk is `https://monblip.fun`. Set `MONBLIP_URL` to `http://127.0.0.1:3010` for a local desk.

Agent instructions live in `skills/monblip/SKILL.md`.
