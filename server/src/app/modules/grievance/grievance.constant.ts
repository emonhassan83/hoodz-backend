export const GRIEVANCE_ISSUE_TYPE = {
  delay_delivery: 'delay_delivery',
  damage_product: 'damage_product',
  missing_item: 'missing_item',
  others: 'others',
} as const;

export const GRIEVANCE_STATUS = {
  submitted: 'submitted',
  under_review: 'under_review',
  resolved: 'resolved',
  rejected: 'rejected',
} as const;

export const GRIEVANCE_RESOLUTION_TYPE = {
  none: 'none',
  voucher: 'voucher',
  wallet: 'wallet',
} as const;
