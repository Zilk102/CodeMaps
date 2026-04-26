import { create } from 'zustand';
import { createGraphSlice, type GraphSlice } from './slices/graphSlice';
import { createUISlice, type UISlice } from './slices/uiSlice';
import { createConnectionSlice, type ConnectionSlice } from './slices/connectionSlice';

export type StoreState = GraphSlice & UISlice & ConnectionSlice;

export const useStore = create<StoreState>()((...a) => ({
  ...createGraphSlice(...a),
  ...createUISlice(...a),
  ...createConnectionSlice(...a),
}));
