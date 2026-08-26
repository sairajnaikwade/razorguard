import { create } from 'zustand';

interface UIState {
  /** Mobile/tablet navigation drawer open state. */
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  /** Global "Score Transaction" dialog visibility. */
  scoreDialogOpen: boolean;
  setScoreDialogOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  scoreDialogOpen: false,
  setScoreDialogOpen: (open) => set({ scoreDialogOpen: open }),
}));
