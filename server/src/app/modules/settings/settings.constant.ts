export const GENERAL_KEYS = [
  'weekendSettings',
  'fualPricing',
  'deliveryCharge',
  'platformLocation',
  'platformLocationAddress',
] as const;

export const ALLOWED_KEYS = [...GENERAL_KEYS, 'privacyAndPolicy'] as const;
