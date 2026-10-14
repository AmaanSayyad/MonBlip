export const OPEN_DEPOSIT_EVENT = 'monblip:open-deposit';

let pending = false;
let pendingCredit: number | null = null;

/**
 * Opens the Wallet tab and its Deposit window. The flag covers a Deposit panel that mounts after the event.
 * `credit` is the house balance the player still needs; the Deposit window prefills enough to cover it after fees.
 */
export function requestDeposit(credit?: number) {
  pending = true;
  pendingCredit = credit && Number.isFinite(credit) && credit > 0 ? credit : null;
  window.dispatchEvent(new CustomEvent(OPEN_DEPOSIT_EVENT));
}

/** True while a Deposit request waits for the Wallet panel, e.g. one made on another page before /trade mounted. */
export function hasPendingDeposit() {
  return pending;
}

export function consumeDepositRequest() {
  const was = pending;
  pending = false;
  return was;
}

export function consumeDepositCredit() {
  const credit = pendingCredit;
  pendingCredit = null;
  return credit;
}

export const OPEN_WITHDRAW_EVENT = 'monblip:open-withdraw';

let pendingWithdraw = false;

/** Opens the Wallet tab and its Withdraw window, the same way requestDeposit opens Deposit. */
export function requestWithdraw() {
  pendingWithdraw = true;
  window.dispatchEvent(new CustomEvent(OPEN_WITHDRAW_EVENT));
}

export function hasPendingWithdraw() {
  return pendingWithdraw;
}

export function consumeWithdrawRequest() {
  const was = pendingWithdraw;
  pendingWithdraw = false;
  return was;
}
