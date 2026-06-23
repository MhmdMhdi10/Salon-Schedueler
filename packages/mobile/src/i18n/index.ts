import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fa from './fa.json';

/**
 * i18next configuration for the mobile app.
 * Persian (fa) is the default language.
 * Requirements: 17.1, 17.2
 */
i18n.use(initReactI18next).init({
  resources: {
    fa: { translation: fa },
  },
  lng: 'fa', // Persian as default
  fallbackLng: 'fa',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;

/** Helper to check if current language is RTL */
export function isRtl(): boolean {
  return i18n.dir() === 'rtl' || i18n.language === 'fa';
}
