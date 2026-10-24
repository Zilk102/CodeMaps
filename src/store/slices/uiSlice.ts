// Store slice for UI chrome: active tab, panel visibility, sidebar width and the computed layout.
import { StateCreator } from 'zustand';
import type { LayoutResult } from '../../utils/layoutEngine';
import type { WorkspaceTab } from '../../types/workspace';

/**
 * Interface state that is not graph data: tools-panel and MCP-settings visibility, active tab,
 * sidebar width and the latest layout result.
 */
export interface UISlice {
  layoutData: LayoutResult | null;
  isMcpSettingsOpen: boolean;
  isToolsPanelOpen: boolean;
  activeTab: WorkspaceTab;
  sidebarWidth: number;

  setMcpSettingsOpen: (isOpen: boolean) => void;
  setLayoutData: (data: LayoutResult | null) => void;
  toggleToolsPanel: () => void;
  setActiveTab: (tab: WorkspaceTab) => void;
  setSidebarWidth: (width: number) => void;
}

/** Builds the UI slice with the overview tab active, panels closed and a 320px sidebar. */
export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  layoutData: null,
  isMcpSettingsOpen: false,
  isToolsPanelOpen: false,
  activeTab: 'overview',
  sidebarWidth: 320,

  setMcpSettingsOpen: (isOpen) => set({ isMcpSettingsOpen: isOpen }),
  setLayoutData: (data) => set({ layoutData: data }),
  toggleToolsPanel: () => set((state) => ({ isToolsPanelOpen: !state.isToolsPanelOpen })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
});
