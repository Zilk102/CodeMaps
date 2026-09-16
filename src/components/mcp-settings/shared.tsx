import React from 'react';

export const commonSectionStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.025))',
  padding: '16px',
  borderRadius: '16px',
  border: '1px solid var(--glass-border)',
  boxShadow: '0 12px 30px rgba(0,0,0,0.14)',
};

export const CodeBlock = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      background: 'rgba(0,0,0,0.3)',
      padding: '10px 12px',
      borderRadius: '8px',
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      color: 'var(--text-primary)',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      border: '1px solid rgba(255,255,255,0.05)',
      maxHeight: '200px',
      overflowY: 'auto',
    }}
  >
    {children}
  </div>
);

export const MetricCard = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div>
    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
      {label}
    </div>
    <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    {hint && <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{hint}</div>}
  </div>
);
