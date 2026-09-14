import path from 'node:path';
import { existsSync } from 'node:fs';

import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import i18nextMiddleware from 'i18next-http-middleware';

const distLocalePath = path.join(process.cwd(), 'dist', 'app', 'locales');
const srcLocalePath = path.join(process.cwd(), 'src', 'app', 'locales');
const localeRoot = existsSync(distLocalePath) ? distLocalePath : srcLocalePath;

i18next
  .use(Backend)
  .use(i18nextMiddleware.LanguageDetector)
  .init({
    fallbackLng: 'en',
    preload: ['en', 'ar'],
    supportedLngs: ['en', 'ar'],
    ns: ['notification', 'response'],
    defaultNS: 'notification',
    lowerCaseLng: true,
    initAsync: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['header', 'querystring'],
      lookupHeader: 'accept-language',
      lookupQuerystring: 'lang',
      caches: false,
    },
    backend: {
      loadPath: path.join(localeRoot, '{{lng}}', '{{ns}}.json'),
    },
  })
  .catch((error) => {
    console.error('[i18next] initialization failed:', error);
  });

export { i18next, i18nextMiddleware };
