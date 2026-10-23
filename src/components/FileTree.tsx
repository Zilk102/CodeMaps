import React from 'react';
import { useTranslation } from 'react-i18next';
import { useFileTreeState } from '../hooks/useFileTreeState';
import { ChevronIcon } from './FileTreeIcons';
import { FileTreeNode } from './FileTreeNode';
import type { FileTreeEntry } from './fileTreeModel';

const ErrorBanner: React.FC<{ error: string }> = ({ error }) => (
  <div
    style={{
      color: 'var(--red)',
      fontSize: 13,
      padding: '12px',
      background: 'rgba(238, 0, 0, 0.1)',
      borderRadius: 6,
    }}
  >
    {error}
  </div>
);

const EmptyState: React.FC<{ isLoading: boolean; openProject: () => void }> = ({
  isLoading,
  openProject,
}) => {
  const { t } = useTranslation();
  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: 'var(--t2)', fontSize: 13, textAlign: 'center' }}>
        {t('fileTree.noFolderOpen')}
      </div>
      <button
        onClick={openProject}
        disabled={isLoading}
        className="btn-primary"
        style={{
          width: '100%',
          padding: '8px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 500,
          textAlign: 'center',
        }}
      >
        {isLoading ? t('fileTree.analyzing') : t('fileTree.openFolder')}
      </button>
    </div>
  );
};

const ProjectTree: React.FC<{
  tree: FileTreeEntry;
  expandedFolders: Record<string, boolean>;
  toggleFolder: (path: string, currentlyExpanded: boolean) => void;
  selectedPath: string | null;
  onSelect: (node: FileTreeEntry) => void;
}> = ({ tree, expandedFolders, toggleFolder, selectedPath, onSelect }) => {
  const { t } = useTranslation();
  const rootExpanded = expandedFolders['root_folder'] !== false;
  return (
    <div style={{ paddingBottom: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          cursor: 'pointer',
          fontWeight: '600',
          fontSize: '11px',
          textTransform: 'uppercase',
          color: 'var(--t2)',
          marginBottom: '8px',
        }}
        onClick={() => toggleFolder('root_folder', rootExpanded)}
      >
        <ChevronIcon expanded={rootExpanded} />
        <span style={{ marginLeft: 6 }}>{t('fileTree.project')}</span>
      </div>

      {rootExpanded && (
        <FileTreeNode
          node={tree}
          level={0}
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      )}
    </div>
  );
};

export const FileTree: React.FC = () => {
  const { t } = useTranslation();
  const {
    selectedPath,
    isLoading,
    error,
    openProject,
    expandedFolders,
    toggleFolder,
    handleSelect,
    tree,
  } = useFileTreeState();

  return (
    <div
      style={{
        width: '100%',
        background: 'var(--bg1)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: 'var(--t1)',
        fontFamily: 'var(--font-family)',
      }}
    >
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
        <h2 className="section-label">{t('fileTree.explorer')}</h2>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px 4px',
          paddingBottom: '80px',
        }}
        className="sidebar-scroll"
      >
        {error ? (
          <ErrorBanner error={error} />
        ) : tree ? (
          <ProjectTree
            tree={tree}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            selectedPath={selectedPath}
            onSelect={handleSelect}
          />
        ) : (
          <EmptyState isLoading={isLoading} openProject={openProject} />
        )}
      </div>
    </div>
  );
};
