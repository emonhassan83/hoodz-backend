export const JOB_STATUS = {
  matching: 'matching',
  assigned: 'assigned',
  accepted: 'accepted',
  picked_up: 'picked_up',
  on_the_way: 'on_the_way',
  otp_sent: 'otp_sent',
  delivered: 'delivered',
} as const;

export const JOB_PAYMENT_METHOD = {
  card: 'card',
  wallet: 'wallet',
  cod: 'cod',
} as const;

export const DELIVERY_TYPE = {
  regular: 'regular',
  instant: 'instant',
} as const;

export const JOB_DEPOSIT_STATUS = {
  not_required: 'not_required',
  pending: 'pending',
  submitted: 'submitted',
  verified: 'verified',
} as const;
