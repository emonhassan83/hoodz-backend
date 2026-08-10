export const WALLET_TRANSACTION_TYPE = {
  top_up: 'top_up',
  purchase: 'purchase',
  refund_credit: 'refund_credit',
  refund_to_card: 'refund_to_card',
} as const;

export const WALLET_TRANSACTION_DIRECTION = {
  credit: 'credit',
  debit: 'debit',
} as const;

export const WALLET_TRANSACTION_STATUS = {
  pending: 'pending',
  completed: 'completed',
  failed: 'failed',
} as const;

export const WALLET_TRANSACTION_REFERENCE_TYPE = {
  TopUp: 'TopUp',
  Order: 'Order',
  Payment: 'Payment',
  Refund: 'Refund',
  Grievance: 'Grievance',
  WalletTransaction: 'WalletTransaction',
} as const;
