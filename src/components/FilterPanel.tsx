import React from 'react';
import { useStore } from '../store/useStore';

export const FilterPanel: React.FC = () => {
  const { filters, layoutMode, setFilter, setLayoutMode } = useStore();
  const modeDescription = layoutMode === 'hierarchy'
    ? 'Рамки и вложенность проекта. Связи лучше читать после выбора конкретного узла.'
    : 'Обзор зависимостей на уровне файлов и ADR. После выбора узла показывается его локальный subgraph.';

  return (
    <div style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(0,0,0,0.7)', padding: 15, borderRadius: 8, color: '#fff', fontSize: 13, zIndex: 10, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>Фильтры</h4>
      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 6, color: 'var(--t2)', fontSize: 12 }}>Режим Layout</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setLayoutMode('hierarchy')}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: layoutMode === 'hierarchy' ? '1px solid var(--acc)' : '1px solid rgba(255,255,255,0.15)',
              background: layoutMode === 'hierarchy' ? 'var(--accbg)' : 'rgba(255,255,255,0.04)',
              color: layoutMode === 'hierarchy' ? 'var(--acc)' : '#fff',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Иерархия
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('dependencies')}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: layoutMode === 'dependencies' ? '1px solid var(--acc)' : '1px solid rgba(255,255,255,0.15)',
              background: layoutMode === 'dependencies' ? 'var(--accbg)' : 'rgba(255,255,255,0.04)',
              color: layoutMode === 'dependencies' ? 'var(--acc)' : '#fff',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Зависимости
          </button>
        </div>
        <div style={{ marginTop: 8, color: 'var(--t3)', fontSize: 11, lineHeight: 1.35, maxWidth: 220 }}>
          {modeDescription}
        </div>
      </div>
      <label style={{ display: 'block', marginBottom: 5, cursor: 'pointer' }}>
        <input type="checkbox" checked={filters.showDirectories} onChange={(e) => setFilter('showDirectories', e.target.checked)} style={{ marginRight: 8 }} />
        Папки
      </label>
      <label style={{ display: 'block', marginBottom: 5, cursor: 'pointer' }}>
        <input type="checkbox" checked={filters.showFiles} onChange={(e) => setFilter('showFiles', e.target.checked)} style={{ marginRight: 8 }} />
        Файлы
      </label>
      <label style={{ display: 'block', marginBottom: 5, cursor: 'pointer' }}>
        <input type="checkbox" checked={filters.showFunctions} onChange={(e) => setFilter('showFunctions', e.target.checked)} style={{ marginRight: 8 }} />
        Функции
      </label>
      <label style={{ display: 'block', marginBottom: 5, cursor: 'pointer' }}>
        <input type="checkbox" checked={filters.showClasses} onChange={(e) => setFilter('showClasses', e.target.checked)} style={{ marginRight: 8 }} />
        Классы
      </label>
      <label style={{ display: 'block', marginBottom: 5, cursor: 'pointer' }}>
        <input type="checkbox" checked={filters.showADR} onChange={(e) => setFilter('showADR', e.target.checked)} style={{ marginRight: 8 }} />
        ADR
      </label>
      <label style={{ display: 'block', marginBottom: 0, cursor: 'pointer' }}>
        <input type="checkbox" checked={filters.showEdges} onChange={(e) => setFilter('showEdges', e.target.checked)} style={{ marginRight: 8 }} />
        Связи (линии)
      </label>
    </div>
  );
};
