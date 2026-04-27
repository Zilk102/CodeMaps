import { StateCreator } from 'zustand';
import type { LayoutResult } from '../../utils/layoutEngine';

export interface UISlice {
  layoutData: LayoutResult | null;
  isMcpSettingsOpen: boolean;
  isToolsPanelOpen: boolean;
  activeTab: 'pr' | 'blast' | 'heatmap';
  sidebarWidth: number;

  setMcpSettingsOpen: (isOpen: boolean) => void;
  setLayoutData: (data: LayoutResult | null) => void;
  toggleToolsPanel: () => void;
  setActiveTab: (tab: 'pr' | 'blast' | 'heatmap') => void;
  setSidebarWidth: (width: number) => void;
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  layoutData: null,
  isMcpSettingsOpen: false,
  isToolsPanelOpen: false,
  activeTab: 'blast',
  sidebarWidth: 320,

  setMcpSettingsOpen: (isOpen) => set({ isMcpSettingsOpen: isOpen }),
  setLayoutData: (data) => set({ layoutData: data }),
  toggleToolsPanel: () => set((state) => ({ isToolsPanelOpen: !state.isToolsPanelOpen })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
});
