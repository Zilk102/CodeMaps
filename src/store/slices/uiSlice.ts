import { StateCreator } from 'zustand';
import type { LayoutResult } from '../../utils/layoutEngine';

export interface UISlice {
  layoutData: LayoutResult | null;
  isMcpSettingsOpen: boolean;
  isToolsPanelOpen: boolean;

  setMcpSettingsOpen: (isOpen: boolean) => void;
  setLayoutData: (data: LayoutResult | null) => void;
  toggleToolsPanel: () => void;
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  layoutData: null,
  isMcpSettingsOpen: false,
  isToolsPanelOpen: false,

  setMcpSettingsOpen: (isOpen) => set({ isMcpSettingsOpen: isOpen }),
  setLayoutData: (data) => set({ layoutData: data }),
  toggleToolsPanel: () => set((state) => ({ isToolsPanelOpen: !state.isToolsPanelOpen })),
});
