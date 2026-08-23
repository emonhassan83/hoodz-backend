import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  ADMIN_SETTING_KEYS,
  GENERAL_KEYS,
  PLATFORM_GENERAL_KEYS,
} from '@/app/modules/settings/settings.constant';
import {
  buildPlatformGenerals,
  buildVendorGenerals,
  hasAllKeys,
  invalidateAdminSettingCaches,
  invalidateVendorSettingCaches,
} from '@/app/modules/settings/settings.helpers';
import { Setting } from '@/app/modules/settings/settings.model';
import {
  TGeneralSettings,
  TPlatformGeneralSettings,
} from '@/app/modules/settings/settings.types';
import { getCache, setCache } from '@/app/redis/helpers';
import { REDIS_KEYS } from '@/app/redis/keys';

// ─── Read ──────────────────────────────────────────────────────────────────

const getAdminSettings = async () => {
  const cacheKey = REDIS_KEYS.SETTINGS_ADMIN;
  const cached = await getCache<TPlatformGeneralSettings>(cacheKey);
  if (hasAllKeys(cached, PLATFORM_GENERAL_KEYS)) return cached;

  const settings = await Setting.find({
    key: { $in: PLATFORM_GENERAL_KEYS },
    vendor: null,
  })
    .select('key value -_id')
    .lean();

  const adminSettings = buildPlatformGenerals(settings);

  await setCache(cacheKey, adminSettings);
  return adminSettings;
};

const getSetting = async (traceId: string, key: string) => {
  if (!key)
    throw new ApiError(HttpStatusCode.BadRequest, 'Key is required', traceId);

  if (key === 'generals') {
    const cacheKey = REDIS_KEYS.SETTINGS_SINGLE('generals');
    const cached = await getCache<{
      key: string;
      value: TPlatformGeneralSettings;
    }>(cacheKey);
    if (cached && Object.keys(cached.value ?? {}).length === PLATFORM_GENERAL_KEYS.length) {
      return cached;
    }

    const value = await getAdminSettings();
    const setting = { key: 'generals', value };
    await setCache(cacheKey, setting);
    return setting;
  }

  const cacheKey = REDIS_KEYS.SETTINGS_SINGLE(key);
  const cached = await getCache<any>(cacheKey);
  if (cached) return cached;

  const setting = await Setting.findOne({ key, vendor: null })
    .select('key value -_id')
    .lean();
  if (!setting) {
    throw new ApiError(
      HttpStatusCode.NotFound,
      `Setting with key "${key}" not found`,
      traceId
    );
  }

  await setCache(cacheKey, setting);
  return setting;
};

/** Reads a numeric admin setting, falling back when missing or invalid. */
const getNumericSetting = async (key: string, fallback: number) => {
  try {
    const setting = await getSetting('system', key);
    const parsed = Number(setting?.value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  } catch {
    return fallback;
  }
  return fallback;
};

const getSettingGenerals = async (traceId: string, vendorId: string) => {
  if (!vendorId) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Vendor id is required',
      traceId
    );
  }

  const cacheKey = REDIS_KEYS.SETTINGS_GENERALS(vendorId);
  const cached = await getCache<TGeneralSettings>(cacheKey);
  if (hasAllKeys(cached, GENERAL_KEYS)) return cached;

  const settings = await Setting.find({
    key: { $in: GENERAL_KEYS },
    vendor: vendorId,
  })
    .select('key value -_id')
    .lean();

  const generalSettings = buildVendorGenerals(settings);

  await setCache(cacheKey, generalSettings);
  return generalSettings;
};

// ─── Write ─────────────────────────────────────────────────────────────────

const createOrUpdate = async (traceId: string, key: string, payload: any) => {
  if (!key || key === 'generals') {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Key is required and cannot be "generals"',
      traceId
    );
  }

  if (!ADMIN_SETTING_KEYS.includes(key as any)) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Only admin setting keys can be updated from this endpoint',
      traceId
    );
  }

  const settingValue =
    key === 'fawryAccount'
      ? payload.value ??
        payload[key] ??
        {
          fawryRefCode: payload.fawryRefCode,
          fawryMerchantCode: payload.fawryMerchantCode,
          fawryAccountNumber: payload.fawryAccountNumber,
          fawryAccountName: payload.fawryAccountName,
          fawryInstructions: payload.fawryInstructions,
        }
      : payload.value ?? payload[key] ?? payload;
  const setting = await Setting.findOneAndUpdate(
    { key, vendor: null },
    { key, value: settingValue, vendor: null },
    { returnDocument: 'after', upsert: true }
  ).select('key value -_id');

  await invalidateAdminSettingCaches([key]);

  return setting;
};

const updateAdminSettings = async (
  traceId: string,
  payload: Record<string, unknown>
) => {
  const validKeys = PLATFORM_GENERAL_KEYS.filter(
    (key) => payload[key] !== undefined
  );

  if (validKeys.length === 0) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'No valid admin setting keys provided',
      traceId
    );
  }

  await Promise.all(
    validKeys.map((key) =>
      Setting.findOneAndUpdate(
        { key, vendor: null },
        { key, value: payload[key], vendor: null },
        { upsert: true, returnDocument: 'after' }
      ).select('key value -_id')
    )
  );

  await invalidateAdminSettingCaches([...validKeys]);

  return getSetting(traceId, 'generals');
};

const updateGenerals = async (
  traceId: string,
  vendorId: string,
  payload: Record<string, any>
) => {
  if (!vendorId) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'Vendor id is required',
      traceId
    );
  }

  const validKeys = GENERAL_KEYS.filter((key) => payload[key] !== undefined);

  if (validKeys.length === 0) {
    throw new ApiError(
      HttpStatusCode.BadRequest,
      'No valid general setting keys provided',
      traceId
    );
  }

  // Update all matching keys in parallel
  await Promise.all(
    validKeys.map((key) =>
      Setting.findOneAndUpdate(
        { key, vendor: vendorId },
        { key, value: payload[key], vendor: vendorId },
        { upsert: true, returnDocument: 'after' }
      ).select('-__v')
    )
  );

  await invalidateVendorSettingCaches(vendorId, [...validKeys]);

  return getSettingGenerals(traceId, vendorId);
};

export const SettingService = {
  getSetting,
  getNumericSetting,
  getSettingGenerals,
  getAdminSettings,
  createOrUpdate,
  updateGenerals,
  updateAdminSettings,
};


