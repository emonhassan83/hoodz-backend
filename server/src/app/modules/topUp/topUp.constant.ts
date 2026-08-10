export const TOP_UP_STATUS = {
  pending: 'pending',
  paid: 'paid',
  failed: 'failed',
  cancelled: 'cancelled',
  refunded: 'refunded',
} as const;

export const TOP_UP_PAYMENT_METHOD = {
  card: 'card',
} as const;
