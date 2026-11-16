export const ORDER_STATUS = {
  pending: 'pending',
  accepted: 'accepted',
  confirmed: 'confirmed',
  preparing: 'preparing',
  processing: 'processing',
  out_for_delivery: 'out_for_delivery',
  rider_assigned: 'rider_assigned',
  collected: 'collected',
  picked_up: 'picked_up',
  on_the_way: 'on_the_way',
  delivered: 'delivered',
  cancelled: 'cancelled',
  rejected: 'rejected',
} as const;

/** Statuses that may start or continue automatic rider dispatch. */
export const ORDER_DISPATCH_STATUSES = [
  ORDER_STATUS.preparing,
  ORDER_STATUS.processing,
  ORDER_STATUS.rider_assigned,
] as const;

export const ORDER_VENDOR_ACCEPTED_STATUSES = [
  ORDER_STATUS.accepted,
  ORDER_STATUS.confirmed,
] as const;

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
  ORDER_STATUS.accepted,
  ORDER_STATUS.confirmed,
  ORDER_STATUS.preparing,
  ORDER_STATUS.processing,
  ORDER_STATUS.out_for_delivery,
  ORDER_STATUS.rider_assigned,
  ORDER_STATUS.collected,
  ORDER_STATUS.picked_up,
  ORDER_STATUS.on_the_way,
] as const;


