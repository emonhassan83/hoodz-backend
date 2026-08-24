export const ORDER_STATUS = {
  pending: 'pending',
  cancelled: 'cancelled',
  confirmed: 'confirmed',
  processing: 'processing',
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

export const ORDER_LIST_FILTER = {
  active: 'active',
  completed: 'completed',
  cancelled: 'cancelled',
} as const;

export const ORDER_ACTIVE_STATUSES = [
  ORDER_STATUS.pending,
  ORDER_STATUS.confirmed,
  ORDER_STATUS.processing,
  ORDER_STATUS.rider_assigned,
  ORDER_STATUS.picked_up,
  ORDER_STATUS.on_the_way,
] as const;


