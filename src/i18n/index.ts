import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getIDBStorage } from '../store/idb-storage';

import en from './locales/en.json';
import ru from './locales/ru.json';
import zh from './locales/zh.json';

const idbLanguageDetector = {
  type: 'languageDetector' as const,
  async: true,
  init: () => {},
  detect: (callback: (lng: string | undefined) => void) => {
    const storage = getIDBStorage('codemaps-db', 'ui-store');
    storage.getItem('i18nextLng')
      .then((lng) => {
        if (lng) {
          callback(lng);
        } else {
          // Fallback to navigator
          const navLng = navigator.language.split('-')[0];
          callback(navLng);
        }
      })
      .catch(() => callback(undefined));
  },
  cacheUserLanguage: (lng: string) => {
    const storage = getIDBStorage('codemaps-db', 'ui-store');
    storage.setItem('i18nextLng', lng).catch(console.error);
  }
};

i18n
  .use(idbLanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
      zh: { translation: zh },
    },
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    saveMissing: true,
    missingKeyHandler: (lng, ns, key) => {
      console.error(`[i18n] Missing translation for key "${key}" in language "${lng}"`);
    },
  });

export default i18n;
