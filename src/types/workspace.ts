export type WorkspaceTab = 'overview' | 'blast' | 'heatmap' | 'pr' | 'decomposition' | 'duplicates';
export type ToolTab = Exclude<WorkspaceTab, 'overview'>;
