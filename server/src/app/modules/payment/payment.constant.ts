export const PAYMENT_STATUS = {
  pending: 'pending',
  paid: 'paid',
  failed: 'failed',
  cancelled: 'cancelled',
  refunded: 'refunded',
} as const;

export const PAYMENT_METHOD = {
  card: 'card',
  wallet: 'wallet',
  cod: 'cod',
} as const;

