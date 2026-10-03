import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import hi from './locales/hi.json';

i18n
  // Detect user language from browser / localStorage
  .use(LanguageDetector)
  // Pass i18n instance to react-i18next
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
    },
    fallbackLng: 'en',
    interpolation: {
      // React already escapes by default
      escapeValue: false,
    },
    detection: {
      // Persist the user's language choice in localStorage so it
      // survives page reloads — useful for nodal officers who always
      // want Hindi without re-selecting each session.
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'kaushaldrishty_lang',
    },
  });

export default i18n;
