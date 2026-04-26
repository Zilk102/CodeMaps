import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import type { GraphNode } from '../types/graph';

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: Record<string, TreeNode>;
  nodeData?: GraphNode;
}

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg 
    width="16" height="16" viewBox="0 0 16 16" 
    style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.1s', minWidth: 16 }}
  >
    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FileIcon = ({ name, isDir }: { name: string, isDir: boolean }) => {
  if (isDir) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ minWidth: 16 }}>
        <path d="M1.5 4.5C1.5 3.39543 2.39543 2.5 3.5 2.5H6.58579C6.851 2.5 7.10536 2.60536 7.29289 2.79289L8.70711 4.20711C8.89464 4.39464 9.149 4.5 9.41421 4.5H12.5C13.6046 4.5 14.5 5.39543 14.5 6.5V11.5C14.5 12.6046 13.6046 13.5 12.5 13.5H3.5C2.39543 13.5 1.5 12.6046 1.5 11.5V4.5Z" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
    );
  }

  const ext = name.split('.').pop()?.toLowerCase();
  
  if (ext === 'tsx' || ext === 'jsx') {
    return (
      <svg width="16" height="16" viewBox="-11.5 -10.23174 23 20.46348" xmlns="http://www.w3.org/2000/svg" style={{ minWidth: 16 }}>
        <circle cx="0" cy="0" r="2.05" fill="#61dafb"/>
        <g stroke="#61dafb" strokeWidth="1" fill="none">
          <ellipse rx="11" ry="4.2"/>
          <ellipse rx="11" ry="4.2" transform="rotate(60)"/>
          <ellipse rx="11" ry="4.2" transform="rotate(120)"/>
        </g>
      </svg>
    );
  }
  
  if (ext === 'ts') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style={{ minWidth: 16 }}>
        <rect x="2" y="2" width="12" height="12" fill="#3178c6"/>
        <path d="M7.4 9.9H8.6V13H9.8V9.9H11V8.8H7.4V9.9ZM5.3 10.6C5.3 10.1 5.4 9.8 5.7 9.5C5.9 9.3 6.3 9.2 6.7 9.2C7 9.2 7.3 9.3 7.5 9.4L7.3 10.4C7.1 10.3 6.9 10.3 6.7 10.3C6.5 10.3 6.4 10.3 6.3 10.4C6.3 10.5 6.2 10.6 6.2 10.8C6.2 10.9 6.3 11 6.3 11.1C6.4 11.2 6.5 11.2 6.7 11.3L7.1 11.4C7.5 11.5 7.8 11.7 8 11.9C8.2 12.1 8.3 12.4 8.3 12.8C8.3 13.2 8.1 13.6 7.8 13.8C7.5 14 7.1 14.1 6.6 14.1C6.1 14.1 5.7 14 5.3 13.8L5.6 12.8C5.8 12.9 6 13 6.2 13.1C6.4 13.1 6.5 13.2 6.7 13.2C6.9 13.2 7 13.1 7.1 13C7.2 12.9 7.3 12.8 7.3 12.6C7.3 12.4 7.2 12.3 7.1 12.2C7 12.1 6.9 12.1 6.7 12L6.3 11.9C5.9 11.8 5.6 11.6 5.5 11.4C5.4 11.2 5.3 10.9 5.3 10.6Z" fill="white"/>
      </svg>
    );
  }

  if (ext === 'html') {
    return <span style={{ color: '#e34c26', fontWeight: 'bold', fontSize: 11, minWidth: 16, textAlign: 'center' }}>&lt;&gt;</span>;
  }
  
  if (ext === 'json') {
    return <span style={{ color: '#cbcb41', fontWeight: 'bold', fontSize: 11, minWidth: 16, textAlign: 'center' }}>{`{}`}</span>;
  }
  
  if (name.includes('config')) {
    return <span style={{ fontSize: 12, minWidth: 16, textAlign: 'center' }}>⚙️</span>;
  }

  if (name.includes('vite')) {
    return <span style={{ fontSize: 12, minWidth: 16, textAlign: 'center' }}>⚡</span>;
  }

  return <span style={{ fontSize: 12, minWidth: 16, textAlign: 'center' }}>📄</span>;
};

const FileTreeNode: React.FC<{
  node: TreeNode;
  level: number;
  expandedFolders: Record<string, boolean>;
  toggleFolder: (path: string) => void;
  selectedPath: string | null;
  onSelect: (node: TreeNode) => void;
}> = ({ node, level, expandedFolders, toggleFolder, selectedPath, onSelect }) => {
  const isSelected = selectedPath === node.path;
  const isExpanded = !!expandedFolders[node.path];
  
  if (!node.name || node.name === 'root') {
    return (
      <div style={{ padding: '0 10px' }}>
        {Object.values(node.children || {})
          .sort((a, b) => {
            if (a.isDir && !b.isDir) return -1;
            if (!a.isDir && b.isDir) return 1;
            return a.name.localeCompare(b.name);
          })
          .map(child => (
          <FileTreeNode 
            key={child.path} 
            node={child} 
            level={0} 
            expandedFolders={expandedFolders} 
            toggleFolder={toggleFolder}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div 
        onClick={(e) => {
          e.stopPropagation();
          if (node.isDir) toggleFolder(node.path);
          onSelect(node);
        }}
        style={{ 
          display: 'flex',
          alignItems: 'center',
          padding: '4px 0',
          paddingLeft: `${level * 16}px`,
          cursor: 'pointer',
          background: isSelected ? 'var(--accbg)' : 'transparent',
          color: isSelected ? 'var(--acc)' : 'var(--t1)',
          fontSize: '11px',
          fontFamily: "var(--font-family)",
          userSelect: 'none',
          borderRadius: '4px',
          transition: 'background 0.15s, color 0.15s'
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = 'var(--hover)';
            e.currentTarget.style.color = 'var(--t0)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--t1)';
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', width: 16, justifyContent: 'center', marginRight: 4 }}>
          {node.isDir ? <ChevronIcon expanded={isExpanded} /> : <div style={{ width: 16 }} />}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', marginRight: 6 }}>
          <FileIcon name={node.name} isDir={node.isDir} />
        </div>
        
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
      </div>
      
      {node.isDir && isExpanded && node.children && (
        <div style={{ position: 'relative' }}>
          {/* Indentation Guide */}
          <div style={{
            position: 'absolute',
            left: `${(level + 1) * 16 + 8}px`,
            top: 0,
            bottom: 0,
            width: '1px',
            background: 'var(--border)',
            zIndex: 1
          }} />
          
          {Object.values(node.children)
            .sort((a, b) => {
              if (a.isDir && !b.isDir) return -1;
              if (!a.isDir && b.isDir) return 1;
              return a.name.localeCompare(b.name);
            })
            .map(child => (
              <FileTreeNode 
                key={child.path} 
                node={child} 
                level={level + 1}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
        </div>
      )}
    </div>
  );
};

export const FileTree: React.FC = () => {
  const { t } = useTranslation();
  const { graphData, selectedPath, isLoading, error, setSelectedNode, setSelectedPath, openProject } = useStore();
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleSelect = (node: TreeNode) => {
    setSelectedPath(node.path);
    if (node.nodeData) {
      setSelectedNode(node.nodeData);
    } else {
      setSelectedNode(null);
    }
  };

  const tree = useMemo(() => {
    if (!graphData) return null;
    
    const root: TreeNode = { name: 'root', path: '', isDir: true, children: {} };
    
    const files = graphData.nodes.filter(n => n.type === 'file');
    files.forEach(file => {
      let relPath = file.id.replace(graphData.projectRoot.replace(/\\/g, '/'), '');
      if (relPath.startsWith('/')) relPath = relPath.substring(1);
      
      const parts = relPath.split('/');
      let current = root;
      
      parts.forEach((part, idx) => {
        const isLast = idx === parts.length - 1;
        if (!current.children) current.children = {};
        
        if (!current.children[part]) {
          const path = parts.slice(0, idx + 1).join('/');
          current.children[part] = {
            name: part,
            path,
            isDir: !isLast,
            nodeData: isLast ? file : undefined
          };
          
          // Auto-expand first level by default
          if (idx === 0) {
            setExpandedFolders(prev => ({ ...prev, [path]: true }));
          }
        }
        current = current.children[part];
      });
    });
    
    return root;
  }, [graphData]);

  return (
    <div style={{ 
      width: '100%', 
      background: 'var(--bg1)', 
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      color: 'var(--t1)',
      fontFamily: 'var(--font-family)'
    }}>
      <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: '9px', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {t('fileTree.explorer')}
        </h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px' }} className="sidebar-scroll">
        {error ? (
          <div style={{ color: 'var(--red)', fontSize: 11, padding: '10px', background: 'rgba(255, 95, 95, 0.1)', borderRadius: 6 }}>
            {error}
          </div>
        ) : tree ? (
          <div style={{ paddingBottom: 20 }}>
            {/* Folder Root Label */}
            <div 
              style={{ 
                display: 'flex', alignItems: 'center', padding: '4px 10px', cursor: 'pointer',
                fontWeight: '600', fontSize: '10px', textTransform: 'uppercase', color: 'var(--t2)'
              }}
              onClick={() => toggleFolder('root_folder')}
            >
              <ChevronIcon expanded={expandedFolders['root_folder'] !== false} />
              <span style={{ marginLeft: 4 }}>{t('fileTree.project')}</span>
            </div>
            
            {(expandedFolders['root_folder'] !== false) && (
              <FileTreeNode 
                node={tree} 
                level={0}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                selectedPath={selectedPath}
                onSelect={handleSelect}
              />
            )}
          </div>
        ) : (
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ color: '#888', fontSize: 13, textAlign: 'center' }}>{t('fileTree.noFolderOpen')}</div>
            <button 
              onClick={openProject}
              disabled={isLoading}
              style={{ 
                width: '100%', padding: '8px', background: '#0e639c', color: '#fff', 
                border: 'none', borderRadius: '2px', cursor: 'pointer', fontSize: '13px'
              }}
            >
              {isLoading ? t('fileTree.analyzing') : t('fileTree.openFolder')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
