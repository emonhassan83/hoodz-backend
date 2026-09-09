import { REVIEW_SORT } from '@/app/modules/review/review.constant';

export const corsWhiteList = [
  'https://dashboard.thehoodz.net',
  'http://localhost:3000',
  'http://72.244.153.29:3000'
];
export const corsAllowedHosts = ['10.10.10.27'];
export const SALT_ROUNDS = 12;
export const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
export const baseUrl = {
  v1: '/api/v1',
};
export const otpPageTokenExpireIn = '1d';
export const userLocationCacheExpireIn = '1d';
export const userAccessTokenExpiresIn = '30d';
export const adminAccessTokenExpiresIn = '15m';
export const refreshTokenExpiresInWithOutRememberMe = '3d';
export const refreshTokenExpiresInWithRememberMe = '30d';
export const otpExpireAt = 4;
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const DEFAULT_RADIUS_KM = 5;
export const EARTH_RADIUS_KM = 6371;
export const SUBSCRIPTION_FEATURE_CACHE_EXPIRY = '1d';

/**
 * ==============================================
 * ------------------REDIS KEYS------------------
 * ==============================================
 */

/**
 * ⚠️ DEVELOPER NOTICE: REDIS KEY PREFIXES
 *
 * Rules for adding new prefixes:
 * 1. DO NOT include a trailing colon (:) at the end of the string.
 * 2. The `createRedisKey` utility automatically manages colon separators.
 *
 * Adding a trailing colon here will cause broken keys like 'user:otp::12345'.
 */
export const REDIS_PREFIXES = {
  otp: 'user:otp',
  blacklist: 'blacklist:token',
  user: 'user',
  category: 'category',
  settings: 'settings',
  notification: 'notification',
  unreadNotification: 'user:unread:notification',
  recentlyViewedProducts: 'user:recently-viewed:products',
  wishlist: 'user:wishlist',
  product: 'product',
  search: 'search',
  cart: 'user:cart',
  rider: 'rider',
  session: 'session',
  rateLimit: 'rate:limit',
  contents: 'contents'
} as const;

export const OTP_GENERATE_CONFIG = {
  digits: true,
  lowerCaseAlphabets: false,
  specialChars: false,
  upperCaseAlphabets: false,
} as const;

/**
 * ==============================================
 * -------------------- JOB ---------------------
 * ==============================================
 */
export const JOB_ASSIGNMENT_TYPE = {
  agent: 'agent',
  auto: 'auto',
} as const;

export const JOB_ACTIVE_STATUSES = [
  'accepted',
  'picked_up',
  'on_the_way',
  'otp_sent',
] as const;

export const RIDER_MATCH_DEFAULTS = {
  intervalSeconds: 180,
  maxAttempts: 5,
} as const;

export const RIDER_LOCATION = {
  persistIntervalSeconds: 300,
  minMoveMeters: 50,
} as const;

export const JOB_MATCH_RADIUS_KM = [5, 10, 20, 50] as const;

/** Delivery OTP lives in Redis for 6 minutes. */
export const DELIVERY_OTP_TTL_SECONDS = 360;

/**
 * ==============================================
 * -------------------- COIN --------------------
 * ==============================================
 */
export const COIN_EXPIRY_DAYS = 60;
export const COIN_INACTIVITY_REMINDER_DAYS = 30;
export const COIN_EXPIRY_WARNING_DAYS = 10;

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
export const DEFAULT_COINS_PER_EGP = 10;

/**
 * ==============================================
 * -------------------- CART --------------------
 * ==============================================
 */
export const CART_RECOMMENDED_LIMIT = 6;

/**
 * ==============================================
 * ------------------ ANALYSIS ------------------
 * ==============================================
 */
export const MONTH_SHORT = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

/**
 * ==============================================
 * ------------------- SEARCH -------------------
 * ==============================================
 */
export const FILTER_PAGE_SIZES = [
  'xs',
  's',
  'm',
  'l',
  'xl',
  'xxl',
  '3xl',
  '4xl',
  '5xl',
] as const;

export const FILTER_PAGE_GENDERS = [
  'all',
  'men',
  'women',
  'unisex',
  'kids',
  'baby',
] as const;

/**
 * ==============================================
 * ------------------- REVIEW -------------------
 * ==============================================
 */
export const REVIEW_SORT_MAP: Record<string, string> = {
  [REVIEW_SORT.latest]: '-createdAt',
  [REVIEW_SORT.highest]: '-rating -createdAt',
  [REVIEW_SORT.lowest]: 'rating -createdAt',
};


