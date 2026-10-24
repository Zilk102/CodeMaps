// Recursive row of the file explorer tree: indentation, icon, selection and expansion.
import React from 'react';
import { ChevronIcon, FileIcon } from './FileTreeIcons';
import { sortedChildren, type FileTreeEntry } from './fileTreeModel';

/**
 * Inputs of a tree row: the entry, its depth, which folders are expanded, the selected path and
 * the select and toggle callbacks.
 */
export interface FileTreeNodeProps {
  node: FileTreeEntry;
  level: number;
  expandedFolders: Record<string, boolean>;
  toggleFolder: (path: string, currentlyExpanded: boolean) => void;
  selectedPath: string | null;
  onSelect: (node: FileTreeEntry) => void;
}

const BASE_PADDING = 8;
const INDENT_STEP = 16;

/** Renders the children of an entry as rows one level deeper, folders first. */
const ChildNodes: React.FC<FileTreeNodeProps & { childLevel: number }> = ({
  childLevel,
  ...props
}) => (
  <>
    {sortedChildren(props.node).map((child) => (
      <FileTreeNode
        key={child.path}
        node={child}
        level={childLevel}
        expandedFolders={props.expandedFolders}
        toggleFolder={props.toggleFolder}
        selectedPath={props.selectedPath}
        onSelect={props.onSelect}
      />
    ))}
  </>
);

/**
 * One clickable explorer line with chevron (folders only), icon and name, highlighted when
 * selected.
 */
const NodeRow: React.FC<{
  node: FileTreeEntry;
  isSelected: boolean;
  isExpanded: boolean;
  currentIndent: number;
  onClick: () => void;
}> = ({ node, isSelected, isExpanded, currentIndent, onClick }) => (
  <div
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={`group flex items-center py-1.5 cursor-pointer rounded-md transition-colors select-none text-[13px] ${
      isSelected ? 'bg-(--accbg) text-(--t0) font-medium' : 'text-(--t1) hover:bg-(--hover)'
    }`}
    style={{ paddingLeft: `${currentIndent}px`, paddingRight: '8px' }}
  >
    <div className="flex items-center justify-center w-4 mr-1 shrink-0">
      {node.isDir ? <ChevronIcon expanded={isExpanded} /> : null}
    </div>

    <div className="flex items-center mr-2 shrink-0">
      <FileIcon name={node.name} isDir={node.isDir} />
    </div>

    <span className="flex-1 truncate group-hover:text-(--t0) transition-colors">{node.name}</span>
  </div>
);

const isSyntheticRoot = (node: FileTreeEntry) => !node.name || node.name === 'root';

/**
 * Children of an expanded folder with a vertical guide line; renders nothing for files or
 * collapsed folders.
 */
const ExpandedChildren: React.FC<FileTreeNodeProps & { isExpanded: boolean; lineLeft: number }> = ({
  isExpanded,
  lineLeft,
  ...props
}) => {
  if (!props.node.isDir || !isExpanded || !props.node.children) return null;
  return (
    <div className="relative">
      <div
        className="absolute top-0 bottom-0 w-px bg-(--border)"
        style={{ left: `${lineLeft}px`, zIndex: 1 }}
      />

      <ChildNodes {...props} childLevel={props.level + 1} />
    </div>
  );
};

/**
 * Row for a file or folder and, when expanded, its children. Top-level folders start expanded.
 * Clicking selects the entry and toggles a folder; the synthetic root is skipped and only its
 * children drawn.
 */
export const FileTreeNode: React.FC<FileTreeNodeProps> = (props) => {
  const { node, level, expandedFolders, toggleFolder, selectedPath, onSelect } = props;
  const isExpanded = expandedFolders[node.path] ?? level === 0;

  if (isSyntheticRoot(node)) {
    return (
      <div className="px-2">
        <ChildNodes {...props} childLevel={0} />
      </div>
    );
  }

  const currentIndent = BASE_PADDING + level * INDENT_STEP;
  const onClick = () => {
    if (node.isDir) toggleFolder(node.path, isExpanded);
    onSelect(node);
  };

  return (
    <div className="relative">
      <NodeRow
        node={node}
        isSelected={selectedPath === node.path}
        isExpanded={isExpanded}
        currentIndent={currentIndent}
        onClick={onClick}
      />

      {/* The guide line aligns with the centre of the chevron icon (16px wide, so +8px). */}
      <ExpandedChildren {...props} isExpanded={isExpanded} lineLeft={currentIndent + 8} />
    </div>
  );
};
