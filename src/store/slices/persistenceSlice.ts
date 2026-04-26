import { StateCreator } from 'zustand';

export interface PersistenceSlice {
  persistenceEnabled: boolean;
  isLoadingGraph: boolean;
  isSavingGraph: boolean;
  lastSavedGraph: Date | null;
  persistenceError: string | null;

  setPersistenceEnabled: (enabled: boolean) => void;
  setLoadingGraph: (isLoading: boolean) => void;
  setSavingGraph: (isSaving: boolean) => void;
  setLastSavedGraph: (date: Date | null) => void;
  setPersistenceError: (error: string | null) => void;
  clearPersistenceError: () => void;
}

const STORAGE_KEY = 'codemaps-persistence-enabled';

export const createPersistenceSlice: StateCreator<PersistenceSlice, [], [], PersistenceSlice> = (set) => ({
  persistenceEnabled: localStorage.getItem(STORAGE_KEY) !== 'false',
  isLoadingGraph: false,
  isSavingGraph: false,
  lastSavedGraph: null,
  persistenceError: null,

  setPersistenceEnabled: (enabled) => {
    localStorage.setItem(STORAGE_KEY, enabled.toString());
    set({ persistenceEnabled: enabled });
  },
  setLoadingGraph: (isLoading) => set({ isLoadingGraph: isLoading }),
  setSavingGraph: (isSaving) => set({ isSavingGraph: isSaving }),
  setLastSavedGraph: (date) => set({ lastSavedGraph: date }),
  setPersistenceError: (error) => set({ persistenceError: error }),
  clearPersistenceError: () => set({ persistenceError: null }),
});
