export type WorkspaceTab =
  'overview' | 'blast' | 'heatmap' | 'pr' | 'decomposition' | 'duplicates' | 'documentation';
export type ToolTab = Exclude<WorkspaceTab, 'overview'>;
