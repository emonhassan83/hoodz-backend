import type { Request } from 'express';

import { i18next } from '@/app/configs/i18next.configs';

export type TNotificationCopyParams = Record<string, string | number | null | undefined>;

export const NOTIFICATION_LANGUAGES = {
  english: 'en',
  arabic: 'ar',
} as const;

const getStringValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : '';
  }
  return '';
};

export const getRequestLanguage = (req?: Partial<Request>) => {
  const acceptLanguageHeader =
    req?.headers?.['accept-language'] ?? req?.headers?.['Accept-Language'];

  const rawHeader = getStringValue(acceptLanguageHeader);
  const queryLang = getStringValue(req?.query?.lang);

  const lang = queryLang || rawHeader || NOTIFICATION_LANGUAGES.english;

  return lang.toLowerCase().startsWith('ar')
    ? NOTIFICATION_LANGUAGES.arabic
    : NOTIFICATION_LANGUAGES.english;
};

export const translateResponseMessage = (
  message: string,
  req?: Partial<Request>
) => {
  if (!message) return message;

  const lang = getRequestLanguage(req);

  return i18next.t(message, {
    lng: lang,
    ns: 'response',
    defaultValue: message,
  });
};

export const buildNotificationCopy = (
  key: string,
  params: TNotificationCopyParams = {}
) => {
  const titleKey = `${key}.title`;
  const messageKey = `${key}.message`;

  return {
    title: i18next.t(titleKey, { lng: NOTIFICATION_LANGUAGES.english, ...params }),
    message: i18next.t(messageKey, { lng: NOTIFICATION_LANGUAGES.english, ...params }),
    titleArabic: i18next.t(titleKey, { lng: NOTIFICATION_LANGUAGES.arabic, ...params }),
    messageArabic: i18next.t(messageKey, { lng: NOTIFICATION_LANGUAGES.arabic, ...params }),
  };
};

export const translateNotificationText = (
  key: string,
  params: TNotificationCopyParams = {}
) => ({
  english: i18next.t(key, { lng: NOTIFICATION_LANGUAGES.english, ...params }),
  arabic: i18next.t(key, { lng: NOTIFICATION_LANGUAGES.arabic, ...params }),
});
