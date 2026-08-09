export const ORDER_STATUS = {
  pending: 'pending',
  cancelled: 'cancelled',
  confirmed: 'confirmed',
  processing: 'processing',
  shipped: 'shipped',
  rider_assigned: 'rider_assigned',
  picked_up: 'picked_up',
  on_the_way: 'on_the_way',
  delivered: 'delivered'
} as const;

export const PAYMENT_STATUS = {
  unpaid: 'unpaid',
  paid: 'paid',
  failed: 'failed',
  refunded: 'refunded',
} as const;

export const DELIVERY_TYPE = {
  regular: 'regular',
  instant: 'instant',
} as const;


