import { GENERAL_KEYS } from '@/app/modules/settings/settings.constant';

export type TGeneralSettings = Record<
  (typeof GENERAL_KEYS)[number],
  unknown | null
>;

export type TGeneralKey = (typeof GENERAL_KEYS)[number];

