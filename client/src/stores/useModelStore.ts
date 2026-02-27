import { create } from 'zustand'

export interface ModelProviderCatalogItem {
  id: string
  label: string
  models: string[]
}

interface ModelSelectionState {
  providers: ModelProviderCatalogItem[]
  selectedProvider: string | null
  selectedModel: string | null
  loaded: boolean
  loading: boolean
  error: string | null
  fetchCatalog: () => Promise<void>
  setSelection: (provider: string, model: string) => void
  getRequestSelection: () => { provider: string; model: string } | null
}

const STORAGE_KEY = 'tianditu-smart-map:model-selection'

function readStoredSelection(): { provider?: string; model?: string } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return {
      provider: typeof parsed.provider === 'string' ? parsed.provider : undefined,
      model: typeof parsed.model === 'string' ? parsed.model : undefined,
    }
  } catch {
    return {}
  }
}

function writeStoredSelection(provider: string | null, model: string | null) {
  try {
    if (!provider || !model) {
      window.localStorage.removeItem(STORAGE_KEY)
      return
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider, model }))
  } catch {
    // ignore storage errors
  }
}

function resolveSelectionAgainstCatalog(
  providers: ModelProviderCatalogItem[],
  preferred: { provider?: string; model?: string },
  fallback: { providerId: string; model: string },
) {
  const providerMap = new Map(providers.map((p) => [p.id, p]))

  if (preferred.provider && preferred.model) {
    const provider = providerMap.get(preferred.provider)
    if (provider && provider.models.includes(preferred.model)) {
      return { provider: provider.id, model: preferred.model }
    }
  }

  if (preferred.model) {
    for (const provider of providers) {
      if (provider.models.includes(preferred.model)) {
        return { provider: provider.id, model: preferred.model }
      }
    }
  }

  const fallbackProvider = providerMap.get(fallback.providerId)
  if (fallbackProvider && fallbackProvider.models.includes(fallback.model)) {
    return { provider: fallback.providerId, model: fallback.model }
  }

  const first = providers[0]
  return first ? { provider: first.id, model: first.models[0] || null } : { provider: null, model: null }
}

export const useModelStore = create<ModelSelectionState>((set, get) => ({
  providers: [],
  selectedProvider: null,
  selectedModel: null,
  loaded: false,
  loading: false,
  error: null,

  fetchCatalog: async () => {
    if (get().loading) return
    set({ loading: true, error: null })

    try {
      const response = await fetch('/api/chat/models')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const json = await response.json() as {
        success?: boolean
        data?: {
          providers?: ModelProviderCatalogItem[]
          defaultSelection?: { providerId?: string; model?: string }
        }
      }

      const providers = Array.isArray(json?.data?.providers) ? json.data.providers : []
      const defaultSelection = {
        providerId: typeof json?.data?.defaultSelection?.providerId === 'string'
          ? json.data.defaultSelection.providerId
          : '',
        model: typeof json?.data?.defaultSelection?.model === 'string'
          ? json.data.defaultSelection.model
          : '',
      }

      const stored = readStoredSelection()
      const nextSelection = resolveSelectionAgainstCatalog(providers, stored, defaultSelection)

      set({
        providers,
        selectedProvider: nextSelection.provider,
        selectedModel: nextSelection.model,
        loaded: true,
        loading: false,
        error: null,
      })
      writeStoredSelection(nextSelection.provider, nextSelection.model)
    } catch (err: any) {
      set({
        loading: false,
        error: err?.message || '模型列表加载失败',
      })
    }
  },

  setSelection: (provider, model) => {
    const p = get().providers.find((item) => item.id === provider)
    if (!p || !p.models.includes(model)) return
    set({ selectedProvider: provider, selectedModel: model })
    writeStoredSelection(provider, model)
  },

  getRequestSelection: () => {
    const { selectedProvider, selectedModel } = get()
    if (!selectedProvider || !selectedModel) return null
    return { provider: selectedProvider, model: selectedModel }
  },
}))

