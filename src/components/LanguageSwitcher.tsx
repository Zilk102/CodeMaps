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
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: 20,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'var(--bg1)',
        padding: '6px 10px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      <span style={{ fontSize: '11px', color: 'var(--t3)', marginRight: '4px' }}>
        {t('languageSwitcher.language')}:
      </span>
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: currentLang === lang.code ? '1px solid var(--acc)' : '1px solid transparent',
            background: currentLang === lang.code ? 'var(--accbg)' : 'transparent',
            color: currentLang === lang.code ? 'var(--acc)' : 'var(--t1)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: currentLang === lang.code ? 700 : 400,
            transition: 'all 0.15s ease',
          }}
          title={lang.code}
        >
          {lang.flag} {lang.label}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
