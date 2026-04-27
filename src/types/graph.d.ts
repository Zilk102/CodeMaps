export interface GraphNode {
    id: string;
    label: string;
    group: number;
    type: string;
    churn?: number;
    adr?: string;
    parentId?: string;
    exports?: Array<{
        exportedName: string;
        localName?: string;
        isDefault?: boolean;
    }>;
    x?: number;
    y?: number;
    z?: number;
}
export interface GraphLink {
    source: string | GraphNode;
    target: string | GraphNode;
    value: number;
    type?: 'structure' | 'import' | 'adr' | 'entity';
}
export interface GraphData {
    projectRoot: string;
    nodes: GraphNode[];
    links: GraphLink[];
}
export type LayoutMode = 'hierarchy' | 'dependencies';
export interface GraphFilters {
    showDirectories: boolean;
    showFiles: boolean;
    showFunctions: boolean;
    showClasses: boolean;
    showADR: boolean;
    showEdges: boolean;
}
