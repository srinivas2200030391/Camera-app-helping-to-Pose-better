import { create } from 'zustand';

/**
 * Data-version counter. Repositories bump it after every write; list screens include it in
 * their effect dependencies to re-query. Cheaper and more predictable than a cache layer.
 */
interface LibraryStore {
  photosVersion: number;
  posesVersion: number;
  bumpPhotos: () => void;
  bumpPoses: () => void;
}

export const useLibraryStore = create<LibraryStore>()((set) => ({
  photosVersion: 0,
  posesVersion: 0,
  bumpPhotos: () => set((state) => ({ photosVersion: state.photosVersion + 1 })),
  bumpPoses: () => set((state) => ({ posesVersion: state.posesVersion + 1 })),
}));
