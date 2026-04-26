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


export const createPersistenceSlice: StateCreator<PersistenceSlice, [], [], PersistenceSlice> = (set) => ({
  persistenceEnabled: true, // В памяти (in-memory state)
  isLoadingGraph: false,
  isSavingGraph: false,
  lastSavedGraph: null,
  persistenceError: null,

  setPersistenceEnabled: (enabled) => {
    set({ persistenceEnabled: enabled });
  },
  setLoadingGraph: (isLoading) => set({ isLoadingGraph: isLoading }),
  setSavingGraph: (isSaving) => set({ isSavingGraph: isSaving }),
  setLastSavedGraph: (date) => set({ lastSavedGraph: date }),
  setPersistenceError: (error) => set({ persistenceError: error }),
  clearPersistenceError: () => set({ persistenceError: null }),
});
