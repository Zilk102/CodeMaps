/** Tabs of the right-hand tools panel, including the overview that lists the other tools. */
export type WorkspaceTab =
  'overview' | 'blast' | 'heatmap' | 'pr' | 'decomposition' | 'duplicates' | 'documentation';
/** The tabs that host an actual analysis tool, i.e. every workspace tab except the overview. */
export type ToolTab = Exclude<WorkspaceTab, 'overview'>;
