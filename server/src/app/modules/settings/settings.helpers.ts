import {
  GENERAL_KEYS,
  PLATFORM_GENERAL_KEYS,
} from '@/app/modules/settings/settings.constant';
import {
  TGeneralSettings,
  TPlatformGeneralSettings,
} from '@/app/modules/settings/settings.types';
import { deleteCache, deleteCachePattern } from '@/app/redis/helpers';
import { REDIS_KEYS } from '@/app/redis/keys';

export const hasAllKeys = <T extends string>(
  value: unknown,
  keys: readonly T[]
): value is Record<T, unknown> =>
  Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value as object, key))
  );

export const mapSettingsByKeys = <T extends string>(
  settings: Array<{ key: string; value: unknown }>,
  keys: readonly T[]
) => {
  const settingsByKey = new Map(
    settings.map((setting) => [setting.key, setting.value])
  );
  return Object.fromEntries(
    keys.map((key) => [key, settingsByKey.get(key) ?? null])
  );
};

export const buildPlatformGenerals = (
  settings: Array<{ key: string; value: unknown }>
) =>
  mapSettingsByKeys(settings, PLATFORM_GENERAL_KEYS) as TPlatformGeneralSettings;

export const buildVendorGenerals = (
  settings: Array<{ key: string; value: unknown }>
) => mapSettingsByKeys(settings, GENERAL_KEYS) as TGeneralSettings;

export const invalidateAdminSettingCaches = async (keys: string[] = []) =>
  Promise.all([
    deleteCache(REDIS_KEYS.SETTINGS_ADMIN),
    deleteCache(REDIS_KEYS.SETTINGS_SINGLE('generals')),
    deleteCachePattern('setting:*'),
    ...keys.map((key) => deleteCache(REDIS_KEYS.SETTINGS_SINGLE(key))),
  ]);

export const invalidateVendorSettingCaches = async (
  vendorId: string,
  keys: string[] = []
) =>
  Promise.all([
    deleteCache(REDIS_KEYS.SETTINGS_GENERALS(vendorId)),
    deleteCachePattern('setting:*'),
    ...keys.map((key) =>
      deleteCache(REDIS_KEYS.SETTINGS_SINGLE(key, vendorId))
    ),
  ]);
