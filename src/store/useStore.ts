import { create } from 'zustand';
import { createGraphSlice, type GraphSlice } from './slices/graphSlice';
import { createUISlice, type UISlice } from './slices/uiSlice';
import { createConnectionSlice, type ConnectionSlice } from './slices/connectionSlice';
import { createPersistenceSlice, type PersistenceSlice } from './slices/persistenceSlice';

export type StoreState = GraphSlice & UISlice & ConnectionSlice & PersistenceSlice;

export const useStore = create<StoreState>()((...a) => ({
  ...createGraphSlice(...a),
  ...createUISlice(...a),
  ...createConnectionSlice(...a),
  ...createPersistenceSlice(...a),
}));
