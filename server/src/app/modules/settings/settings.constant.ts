export const VENDOR_GENERAL_KEYS = [
  'returnPolicyDays',
  'deliveryMinDays',
  'deliveryMaxDays',
  'instantDeliveryMaxDays',
  'instantDeliveryMinDays',
  'isInstantDeliveryAvailable'
] as const;

export const ADMIN_SETTING_KEYS = [
  'userTermsAndConditions',
  'userPrivacyAndPolicy',
  'riderTermsAndConditions',
  'riderPrivacyAndPolicy',
  'vendorTermsAndConditions',
  'vendorPrivacyAndPolicy',
  'agentTermsAndConditions',
  'agentPrivacyAndPolicy',
  'deliveryCharge',
] as const;

export const GENERAL_KEYS = VENDOR_GENERAL_KEYS;

export const ALLOWED_KEYS = [
  ...VENDOR_GENERAL_KEYS,
  ...ADMIN_SETTING_KEYS,
] as const;

