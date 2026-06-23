import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fa from './fa.json';

i18n.use(initReactI18next).init({
  resources: {
    fa: { translation: fa },
  },
  lng: 'fa', // Persian as default
  fallbackLng: 'fa',
  interpolation: {
    escapeValue: false, // React already handles XSS
  },
});

export default i18n;
