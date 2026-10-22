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
    <div
      role="group"
      aria-label="Language"
      className="flex items-center gap-0.5 rounded-lg border border-(--border2) bg-(--bg1) p-0.5"
    >
      {languages.map((lang) => (
        <button
          key={lang.code}
          type="button"
          aria-pressed={currentLang === lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-all ${
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
