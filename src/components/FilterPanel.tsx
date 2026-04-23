import React from 'react';
import { useStore } from '../store/useStore';

export const FilterPanel: React.FC = () => {
  const { filters, setFilter } = useStore();

  return (
    <div style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(0,0,0,0.7)', padding: 15, borderRadius: 8, color: '#fff', fontSize: 13, zIndex: 10, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>Фильтры</h4>
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