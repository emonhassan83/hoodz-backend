export const JOB_STATUS = {
  assigned: 'assigned',
  accepted: 'accepted',
  rejected: 'rejected',
  go_pickup: 'go_pickup',
  picked_up: 'picked_up',
  on_the_way: 'on_the_way',
  otp_sent: 'otp_sent',
  delivered: 'delivered',
  cancelled: 'cancelled',
} as const;

export const JOB_ASSIGNMENT_TYPE = {
  vendor: 'vendor',
  admin: 'admin',
  agent: 'agent',
  auto: 'auto',
} as const;

export const RIDER_MATCH_DEFAULTS = {
  intervalSeconds: 180,
  maxAttempts: 5,
} as const;

export const RIDER_LOCATION = {
  persistIntervalSeconds: 300,
  minMoveMeters: 50,
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

export const JOB_MATCH_RADIUS_KM = [5, 10, 20, 50] as const;

export const JOB_DEPOSIT_STATUS = {
  not_required: 'not_required',
  pending: 'pending',
  submitted: 'submitted',
  verified: 'verified',
} as const;

