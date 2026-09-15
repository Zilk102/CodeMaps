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
    <div className="fixed bottom-6 left-6 z-[1000] flex items-center gap-1 rounded-lg border border-(--border2) bg-(--bg0)/80 p-1.5 shadow-sm backdrop-blur-md">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-all ${
            currentLang === lang.code
              ? 'bg-(--bg2) text-(--t0) shadow-sm'
              : 'text-(--t2) hover:text-(--t0) hover:bg-(--bg1)'
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
