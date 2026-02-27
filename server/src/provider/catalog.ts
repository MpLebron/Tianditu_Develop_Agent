export type LlmProviderId = 'claude' | 'openai' | 'qwen' | 'deepseek'

export interface ProviderCatalogItem {
  id: LlmProviderId
  label: string
  models: string[]
}

export interface LlmSelectionInput {
  provider?: string
  model?: string
}

export interface LlmSelection {
  providerId: LlmProviderId
  model: string
}

const PROVIDER_CATALOG: ProviderCatalogItem[] = [
  {
    id: 'claude',
    label: 'Claude',
    models: [
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-sonnet-4-5',
      'claude-opus-4-5',
      'claude-opus-4-0',
      'claude-3-7-sonnet',
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    models: [
      'gpt-5.2-codex',
      'gpt-5.2',
      'gpt-5.2-high',
      'gpt-5.1-codex-max',
      'gpt-5.1-codex-mini',
    ],
  },
  {
    id: 'qwen',
    label: 'Qwen',
    models: [
      'qwen3.5-397b-a17b',
      'qwen3-coder-next',
      'qwen3.5-plus',
      'qwen3-max-2026-01-23',
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    models: [
      'deepseek-v3.2-fast',
      'deepseek-v3.2',
      'DeepSeek-V3',
      'DeepSeek-R1',
    ],
  },
]

const providerMap = new Map(PROVIDER_CATALOG.map((p) => [p.id, p]))
const modelLookup = new Map<string, { providerId: LlmProviderId; model: string }>()

for (const provider of PROVIDER_CATALOG) {
  for (const model of provider.models) {
    modelLookup.set(model.toLowerCase(), { providerId: provider.id, model })
  }
}

export function getProviderCatalog(): ProviderCatalogItem[] {
  return PROVIDER_CATALOG.map((p) => ({ ...p, models: [...p.models] }))
}

export function getCatalogDefaultSelection(): LlmSelection {
  const firstProvider = PROVIDER_CATALOG[0]
  return { providerId: firstProvider.id, model: firstProvider.models[0] }
}

export function inferProviderFromModel(model?: string | null): LlmSelection | null {
  if (!model) return null
  return modelLookup.get(model.trim().toLowerCase()) || null
}

export function resolveLlmSelection(input: LlmSelectionInput, fallback?: LlmSelection): LlmSelection {
  const resolvedFallback = fallback || getCatalogDefaultSelection()

  const providerRaw = typeof input.provider === 'string' ? input.provider.trim().toLowerCase() : ''
  const modelRaw = typeof input.model === 'string' ? input.model.trim() : ''

  if (!providerRaw && !modelRaw) return resolvedFallback

  if (!providerRaw && modelRaw) {
    const inferred = inferProviderFromModel(modelRaw)
    if (!inferred) throw new Error(`不支持的模型: ${modelRaw}`)
    return inferred
  }

  const provider = providerMap.get(providerRaw as LlmProviderId)
  if (!provider) {
    throw new Error(`不支持的模型提供商: ${input.provider}`)
  }

  if (!modelRaw) {
    return { providerId: provider.id, model: provider.models[0] }
  }

  const normalized = inferProviderFromModel(modelRaw)
  if (!normalized) {
    throw new Error(`不支持的模型: ${modelRaw}`)
  }
  if (normalized.providerId !== provider.id) {
    throw new Error(`模型 ${normalized.model} 不属于提供商 ${provider.label}`)
  }

  return normalized
}

