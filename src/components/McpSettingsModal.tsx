import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';

export const McpSettingsModal: React.FC = () => {
  const isOpen = useStore(state => state.isMcpSettingsOpen);
  const setOpen = useStore(state => state.setMcpSettingsOpen);
  const graphData = useStore(state => state.graphData);
  const [port, setPort] = useState(3005);
  
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          Настройки MCP Сервера
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ background: 'var(--glass-bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '5px' }}>Статус</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4caf50', boxShadow: '0 0 8px #4caf50' }}></div>
              Активен (Ожидает агентов)
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Порт (Только чтение)</label>
            <input 
              type="text" 
              value={port}
              readOnly
              style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                padding: '10px',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                outline: 'none',
                fontFamily: 'monospace'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Доступный контекст (узлы)</label>
            <div style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                padding: '10px',
                borderRadius: '6px',
                color: 'var(--text-primary)'
            }}>
              {graphData ? `${graphData.nodes.length} узлов загружено` : 'Проект не открыт'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '25px' }}>
          <button className="btn-glass" onClick={() => setOpen(false)}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
