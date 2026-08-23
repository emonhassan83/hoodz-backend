export const COIN_TRANSACTION_TYPE = {
  earn: 'earn',
  redeem: 'redeem',
  expire: 'expire',
} as const;

export const COIN_TRANSACTION_STATUS = {
  active: 'active',
  used: 'used',
  expired: 'expired',
} as const;

export const COIN_EARNING_ACTION = {
  account_creation: 'account_creation',
  profile_completion: 'profile_completion',
  purchase: 'purchase',
  product_review: 'product_review',
  photo_review: 'photo_review',
  referral_inviter: 'referral_inviter',
  referral_invitee: 'referral_invitee',
} as const;

export const COIN_REFERENCE_TYPE = {
  user: 'User',
  order: 'Order',
  review: 'Review',
} as const;
