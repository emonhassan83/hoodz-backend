import {
  GENERAL_KEYS,
  PLATFORM_GENERAL_KEYS,
} from '@/app/modules/settings/settings.constant';

export type TGeneralSettings = Record<
  (typeof GENERAL_KEYS)[number],
  unknown | null
>;

export type TGeneralKey = (typeof GENERAL_KEYS)[number];

export type TPlatformGeneralSettings = Record<
  (typeof PLATFORM_GENERAL_KEYS)[number],
  unknown | null
>;


