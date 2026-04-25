import React from 'react';
import { useTranslation } from 'react-i18next';

interface DragDropZoneProps {
  isActive: boolean;
}

const DragDropZone: React.FC<DragDropZoneProps> = ({ isActive }) => {
  const { t } = useTranslation();

  if (!isActive) return null;

  return (
    <div className={`drag-drop-zone${isActive ? ' drag-active' : ''}`}>
      <div className="drag-drop-content">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <polyline points="13 2 13 9 20 9" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
          <path d="M10 9H8" />
        </svg>
        <p className="drag-drop-title">{t('dragDrop.dropHere')}</p>
        <p className="drag-drop-subtitle">{t('dragDrop.dropSubtitle')}</p>
      </div>
    </div>
  );
};

export default DragDropZone;
