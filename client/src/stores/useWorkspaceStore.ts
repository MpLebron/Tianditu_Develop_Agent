import { create } from 'zustand'

interface WorkspaceStore {
  showCode: boolean
  chatWidth: number
  toggleCode: () => void
  setShowCode: (v: boolean) => void
  setChatWidth: (w: number) => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  showCode: false,
  chatWidth: 400,
  toggleCode: () => set((s) => ({ showCode: !s.showCode })),
  setShowCode: (v) => set({ showCode: v }),
  setChatWidth: (w) => set({ chatWidth: w }),
}))
