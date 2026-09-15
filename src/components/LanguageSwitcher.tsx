import React from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation();

  const languages = [
    { code: 'en', label: 'EN', flag: '🇬🇧' },
    { code: 'ru', label: 'RU', flag: '🇷🇺' },
    { code: 'zh', label: 'ZH', flag: '🇨🇳' },
  ];

  const currentLang = i18n.language?.split('-')[0] || 'en';

  return (
    <div className="floating-toast fixed bottom-5 left-5 z-[1000] flex items-center gap-2 rounded-full border px-3 py-2">
      <span className="text-[11px] text-(--t3)">{t('languageSwitcher.language')}:</span>
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
            currentLang === lang.code
              ? 'border-(--acc) bg-[rgba(0,255,157,0.12)] font-bold text-(--acc)'
              : 'border-transparent text-(--t1) hover:border-(--border) hover:text-(--t0)'
          }`}
          title={lang.code}
        >
          {lang.flag} {lang.label}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
