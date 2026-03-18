import { create } from 'zustand'

interface WorkspaceStore {
  showCode: boolean
  chatWidth: number
  codeWidth: number
  toggleCode: () => void
  setShowCode: (v: boolean) => void
  setChatWidth: (w: number) => void
  setCodeWidth: (w: number) => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  showCode: false,
  chatWidth: 400,
  codeWidth: 420,
  toggleCode: () => set((s) => ({ showCode: !s.showCode })),
  setShowCode: (v) => set({ showCode: v }),
  setChatWidth: (w) => set({ chatWidth: w }),
  setCodeWidth: (w) => set({ codeWidth: w }),
}))
