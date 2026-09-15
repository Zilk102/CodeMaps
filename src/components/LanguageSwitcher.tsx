import React from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const languages = [
    { code: 'en', label: 'EN' },
    { code: 'ru', label: 'RU' },
    { code: 'zh', label: 'ZH' },
  ];

  const currentLang = i18n.language?.split('-')[0] || 'en';

  return (
    <div className="fixed bottom-4 left-4 z-[1000] flex items-center gap-1 rounded-md border border-(--border) bg-(--bg1) p-1 shadow-sm">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={`rounded-[4px] px-2 py-1 text-[11px] font-medium transition-colors ${
            currentLang === lang.code
              ? 'bg-(--bg3) text-(--t0) shadow-sm'
              : 'text-(--t2) hover:text-(--t0)'
          }`}
          title={lang.code}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
