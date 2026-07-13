import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import {
  deleteCache,
  deleteCachePattern,
  getCache,
  setCache,
} from '@/app/redis/helpers';
import { REDIS_KEYS } from '@/app/redis/keys';
import { GENERAL_KEYS } from '@/app/modules/settings/settings.constant';
import { Setting } from '@/app/modules/settings/settings.model';

type TGeneralSettings = Record<(typeof GENERAL_KEYS)[number], unknown | null>;

// ─── Read ──────────────────────────────────────────────────────────────────

const getSetting = async (traceId: string, key: string) => {
  if (!key)
    throw new ApiError(HttpStatusCode.BadRequest, 'Key is required', traceId);

  const cacheKey = REDIS_KEYS.SETTINGS_SINGLE(key);
  const cached = await getCache<any>(cacheKey);
  if (cached) return cached;

  const setting = await Setting.findOne({ key }).select('-__v').lean();
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

const getSettingGenerals = async (_traceId: string) => {
  const cacheKey = REDIS_KEYS.SETTINGS_GENERALS;
  const cached = await getCache<TGeneralSettings>(cacheKey);
  const hasCurrentGeneralKeys =
    cached &&
    !Array.isArray(cached) &&
    Object.keys(cached).length === GENERAL_KEYS.length &&
    GENERAL_KEYS.every((key) => Object.hasOwn(cached, key));
  if (hasCurrentGeneralKeys) return cached;

  const settings = await Setting.find({ key: { $in: GENERAL_KEYS } })
    .select('key value -_id')
    .lean();

  const settingsByKey = new Map(
    settings.map((setting) => [setting.key, setting.value])
  );
  const generalSettings = Object.fromEntries(
    GENERAL_KEYS.map((key) => [key, settingsByKey.get(key) ?? null])
  ) as TGeneralSettings;

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

  const settingValue = payload.value ?? payload;
  const setting = await Setting.findOneAndUpdate(
    { key },
    { key, value: settingValue, name: payload.name },
    { returnDocument: 'after', upsert: true }
  ).select('-__v');

  // Invalidate single + generals + pattern in parallel
  await Promise.all([
    deleteCache(REDIS_KEYS.SETTINGS_SINGLE(key)),
    deleteCache(REDIS_KEYS.SETTINGS_GENERALS),
    deleteCachePattern('setting:*'),
  ]);

  return setting;
};

const updateGenerals = async (
  traceId: string,
  payload: Record<string, any>
) => {
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
        { key },
        { value: payload[key] },
        { upsert: true, returnDocument: 'after' }
      ).select('-__v')
    )
  );

  // Invalidate all affected caches in parallel
  await Promise.all([
    deleteCache(REDIS_KEYS.SETTINGS_GENERALS),
    deleteCachePattern('setting:*'),
    ...validKeys.map((key) => deleteCache(REDIS_KEYS.SETTINGS_SINGLE(key))),
  ]);
};

export const SettingService = {
  getSetting,
  getSettingGenerals,
  createOrUpdate,
  updateGenerals,
};
