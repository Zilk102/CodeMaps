import React from 'react';

interface ZoomControlsProps {
  zoomIn: (step?: number) => void;
  zoomOut: (step?: number) => void;
  resetTransform: () => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({ zoomIn, zoomOut, resetTransform }) => {
  return (
    <div style={{ position: 'absolute', bottom: 20, right: 20, display: 'flex', gap: '8px', zIndex: 20 }}>
      <button 
        onClick={() => zoomIn(0.2)} 
        style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '8px 12px', cursor: 'pointer' }}
      >
        +
      </button>
      <button 
        onClick={() => zoomOut(0.2)} 
        style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '8px 12px', cursor: 'pointer' }}
      >
        -
      </button>
      <button 
        onClick={() => resetTransform()} 
        style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '8px 12px', cursor: 'pointer' }}
      >
        Reset
      </button>
    </div>
  );
};