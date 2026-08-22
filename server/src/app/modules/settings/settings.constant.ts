export const VENDOR_GENERAL_KEYS = [
  'returnPolicyTime',
  'deliveryMinTime',
  'deliveryMaxTime',
  'instantDeliveryMinTime',
  'instantDeliveryMaxTime',
  'isInstantDeliveryAvailable',
  'openingTime',
  'closingTime',
  'weekends',
  'timezone',
] as const;

export const SETTING_TIME_UNIT = {
  minute: 'minute',
  hour: 'hour',
  day: 'day',
} as const;

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
  'riderMatchIntervalSeconds',
  'riderMatchMaxAttempts',
  'fawryAccount',
] as const;

export const PLATFORM_GENERAL_KEYS = [
  'riderMatchIntervalSeconds',
  'riderMatchMaxAttempts',
] as const;

export const GENERAL_KEYS = VENDOR_GENERAL_KEYS;

export const ALLOWED_KEYS = [
  ...VENDOR_GENERAL_KEYS,
  ...ADMIN_SETTING_KEYS,
] as const;


