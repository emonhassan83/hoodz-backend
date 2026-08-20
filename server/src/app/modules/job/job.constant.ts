export const JOB_STATUS = {
  matching: 'matching',
  assigned: 'assigned',
  accepted: 'accepted',
  picked_up: 'picked_up',
  on_the_way: 'on_the_way',
  otp_sent: 'otp_sent',
  delivered: 'delivered',
  cancelled: 'cancelled',
} as const;

export const JOB_ACTIVE_STATUSES = [
  JOB_STATUS.accepted,
  JOB_STATUS.picked_up,
  JOB_STATUS.on_the_way,
  JOB_STATUS.otp_sent,
] as const;

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

/** Delivery OTP lives in Redis for 6 minutes. */
export const DELIVERY_OTP_TTL_SECONDS = 360;

export const JOB_DEPOSIT_STATUS = {
  not_required: 'not_required',
  pending: 'pending',
  submitted: 'submitted',
  verified: 'verified',
} as const;

