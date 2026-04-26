import { StateCreator } from 'zustand';
import type { LayoutResult } from '../../utils/layoutEngine';

export interface UISlice {
  layoutData: LayoutResult | null;
  isMcpSettingsOpen: boolean;

  setMcpSettingsOpen: (isOpen: boolean) => void;
  setLayoutData: (data: LayoutResult | null) => void;
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  layoutData: null,
  isMcpSettingsOpen: false,

  setMcpSettingsOpen: (isOpen) => set({ isMcpSettingsOpen: isOpen }),
  setLayoutData: (data) => set({ layoutData: data }),
});
