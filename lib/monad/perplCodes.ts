export const ORDER_STATUS = ['Unspecified', 'Pending', 'Open', 'Partially filled', 'Filled', 'Canceled', 'Expired', 'Failed', 'Untriggered', 'Triggered', 'Executed'];

export const ORDER_REASON = [
  'Unspecified', 'AmountExceedsAvailableBalance', 'AccountFrozen', 'CancelExistingInvalidCloseOrders', 'CantChangeCloseOrder',
  'ChangeExpiredOrderNeedsNewExpiry', 'ClearingExpiredOrder', 'ClearingFrozenAccountOrder', 'ClearingInvalidCloseOrder',
  'ClearingSelfMatchingOrder', 'CloseOrderExceedsPosition', 'CloseOrderPositionMismatch', 'ContractNotOperational', 'CrossesBook',
  'ExceedsLastExecutionBlock', 'ForwardingReverted', 'ImmediateOrCancelExecuted', 'ImmediateOrderUnderMinimum',
  'InsuficientFundsForRecycleFee', 'InvalidAccountFrozenOrder', 'InvalidExpiryBlock', 'InvalidOrderId', 'MakerOrderFilled',
  'MakerOrderSettlementFailed', 'MaximumAccountOrders', 'MaxMatchesReached', 'NoOp', 'OrderBookFull', 'OrderCancelled',
  'OrderCancelledByAdmin', 'OrderCancelledByLiquidator', 'OrderChanged', 'OrderDescIdTooLow', 'OrderDoesNotExist',
  'OrderForwardingNotAllowed', 'OrderPlaced', 'OrderPostFailed', 'OrderSettlementImpliesInsolvent',
  'OrderSizeExceedsAvailableSize', 'PostOrderUnderMinimum', 'PriceOutOfRange', 'RecycleBalanceInsufficientSevere',
  'SizeOutOfRange', 'TakerOrderFilled', 'TakerOrderSettlementFailed', 'UnableToCancelOrder', 'UnmatchedLotRemainsInFillOrKill',
  'UnspecifiedCollateral', 'UnspecifiedPrice', 'UnspecifiedSize', 'WrongAccountForOrder', 'WrongChainForOrder',
  'WrongMarketForOrder', 'PerpetualInsolvent', 'Triggered', 'InvalidAmount',
];

export const REASON_TEXT: Record<number, string> = {
  1: 'The order needed more free balance than the account holds.',
  2: 'The account is frozen.',
  14: 'The order expired before a block executed it.',
  16: 'Immediate-or-cancel: the part that did not match right away was cancelled.',
  17: 'The order is below the market minimum.',
  34: 'Forwarding is off on this Perpl account, so the API order was rejected on-chain.',
  40: 'The price was outside the allowed range.',
  42: 'The size was outside the allowed range.',
  43: 'Filled as taker.',
  22: 'Filled as maker.',
};

export const words = (name: string) => {
  const spaced = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}.`;
};

export const reasonText = (code: number) => REASON_TEXT[code] ?? words(ORDER_REASON[code] ?? 'Unspecified');
