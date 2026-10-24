// Styles and small building blocks shared by the MCP settings tabs.
import React from 'react';

export const commonSectionStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.025))',
  padding: '16px',
  borderRadius: '16px',
  border: '1px solid var(--glass-border)',
  boxShadow: '0 12px 30px rgba(0,0,0,0.14)',
};

/** Monospace block for endpoints, snippets and paths; wraps long lines and scrolls past 200px. */
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

/** Label, large value and optional hint, used for the overview counts. */
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

/** Card heading: the title, with an optional pill (for example "recommended for agents"). */
export const CardTitle = ({
  title,
  badge,
  id,
}: {
  title: string;
  badge?: string | false;
  /** Technical identifier shown under the title (tool name or resource URI). */
  id: string;
}) => (
  <div>
    <div
      style={{
        fontWeight: 700,
        color: 'var(--text-primary)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      }}
    >
      <span>{title}</span>
      {badge && (
        <span
          style={{
            fontSize: '10px',
            padding: '2px 8px',
            borderRadius: '999px',
            background: 'var(--accbg)',
            border: '1px solid var(--acc)',
            color: 'var(--acc)',
          }}
        >
          {badge}
        </span>
      )}
    </div>
    <div style={{ fontSize: '11px', color: 'var(--acc)', marginTop: '2px' }}>{id}</div>
  </div>
);

/** Secondary-coloured description text under a card title. */
export const CardDescription = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      marginTop: '8px',
      color: 'var(--text-secondary)',
      fontSize: '12px',
      lineHeight: 1.45,
    }}
  >
    {children}
  </div>
);
