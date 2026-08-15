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

export const COIN_EXPIRY_DAYS = 60;
export const COIN_INACTIVITY_REMINDER_DAYS = 30;
export const COIN_EXPIRY_WARNING_DAYS = 10;

export const COIN_VALUE_EGP = 1;

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

export const COIN_REWARD_AMOUNT = {
  account_creation: 20,
  profile_completion: 10,
  product_review: 5,
  photo_review: 15,
  referral_inviter: 30,
  referral_invitee: 20,
} as const;

export const COIN_PURCHASE_SPEND_UNIT_EGP = 100;
export const COIN_REVIEW_MONTHLY_CAP = 2;

export const COIN_REDEMPTION_MIN_BALANCE = 50;
export const COIN_REDEMPTION_MIN_BASKET_SUBTOTAL_EGP = 500;
export const COIN_REDEMPTION_MAX_SUBTOTAL_PERCENT = 15;
