export const VOUCHER_TYPE = {
  shopwise: 'shopwise',
  global: 'global',
  compension: 'compension',
} as const;

export const VOUCHER_DISCOUNT_TYPE = {
  fixed: 'fixed',
  percentage: 'percentage',
  gift: 'gift',
} as const;

export const VOUCHER_STATUS = {
  active: 'active',
  expired: 'expired',
  deactivated: 'deactivated',
} as const;
