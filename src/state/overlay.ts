import { create } from 'zustand';

/** Pose overlay session state (the transform itself lives in Reanimated shared values). */
interface OverlayStore {
  poseId: string | null;
  mirrored: boolean;
  editing: boolean;
  /** Bumped to ask the camera screen to reset the overlay transform. */
  resetToken: number;
  setPose: (poseId: string | null) => void;
  toggleMirrored: () => void;
  setEditing: (editing: boolean) => void;
  requestReset: () => void;
}

export const useOverlayStore = create<OverlayStore>()((set) => ({
  poseId: null,
  mirrored: false,
  editing: false,
  resetToken: 0,
  setPose: (poseId) => set((state) => ({ poseId, mirrored: false, editing: false, resetToken: state.resetToken + 1 })),
  toggleMirrored: () => set((state) => ({ mirrored: !state.mirrored })),
  setEditing: (editing) => set({ editing }),
  requestReset: () => set((state) => ({ resetToken: state.resetToken + 1 })),
}));
