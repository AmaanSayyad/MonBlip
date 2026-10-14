---
name: monblip
description: Place a capped BTC up/down round on MonBlip through the MetaMask Agent Wallet. Use when the user wants the agent to fund the MonBlip house or stake a short round on Monad.
---

# MonBlip

The human account on the site is a passkey. This skill is the agent path. Every transfer and every round signature goes through `mm`, which keeps Agent Wallet policy and MFA. Do not send a raw key, do not call the house bet API yourself, and do not raise the 10 unit cap.

## Commands

Read the desk. No wallet:

```bash
mm monblip desk
```

Fund the house. This submits a Monad transaction. AUSD is an ERC-20 transfer. MON is a native transfer. Both go to the house treasury. After the Agent Wallet broadcasts a hash, the command asks MonBlip to credit that exact transfer.

```bash
mm monblip fund --asset AUSD --amount 1
mm monblip fund --asset MON --amount 1
```

Stake a round from house balance. The Agent Wallet signs the round text. MonBlip recovers the signer and debits that wallet's house balance. If the signature is still waiting on MFA, no stake is taken.

```bash
mm monblip round --direction UP --amount 1 --currency AUSD --duration 5
```

`direction` is `UP` or `DOWN`. `duration` is `5`, `10`, `15`, `30`, or `60`. `currency` is `AUSD` or `MON`.

## Before a round

1. Run `mm monblip desk` and use that BTC price as the strike context.
2. Fund first when `mm monblip round` reports no house balance.
3. Stop when the command returns a pending status. Ask the user to approve in MetaMask, then run the same command again. Do not retry with a new amount while an approval is open.

`MONBLIP_URL` defaults to `https://monblip.fun`. Set it to `http://127.0.0.1:3010` for a local desk.
