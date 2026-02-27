import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '../../stores/useChatStore'
import { useModelStore } from '../../stores/useModelStore'

interface ModelSelectorProps {
  variant?: 'header' | 'chatFooter' | 'chatInline'
}

export function ModelSelector({ variant = 'header' }: ModelSelectorProps) {
  const {
    providers,
    selectedProvider,
    selectedModel,
    loading,
    loaded,
    error,
    fetchCatalog,
    setSelection,
  } = useModelStore()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const messageCount = useChatStore((s) => s.messages.length)
  const conversationLocked = messageCount > 0

  useEffect(() => {
    if (!loaded && !loading) {
      void fetchCatalog()
    }
  }, [loaded, loading, fetchCatalog])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (rootRef.current && target instanceof Node && !rootRef.current.contains(target)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const providerLabel = providers.find((p) => p.id === selectedProvider)?.label || '模型'
  const selectValue = selectedProvider && selectedModel ? `${selectedProvider}::${selectedModel}` : ''
  const isCompact = variant === 'chatFooter' || variant === 'chatInline'
  const isInline = variant === 'chatInline'

  const selectEl = (
    <div className={`relative ${isCompact ? 'min-w-0 w-[180px] sm:w-[220px]' : ''}`}>
      <select
        value={selectValue}
        onChange={(e) => {
          const [provider, ...rest] = e.target.value.split('::')
          const model = rest.join('::')
          if (provider && model) setSelection(provider, model)
        }}
        disabled={loading || providers.length === 0}
        className={[
          'appearance-none w-full rounded-lg border bg-white text-gray-700 transition-all disabled:opacity-60',
          'focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100',
          isCompact
            ? 'h-7 pl-2.5 pr-7 text-[11px] border-gray-200/80 shadow-sm shadow-black/[0.02]'
            : 'h-8 pl-3 pr-8 text-[12px] border-gray-200/80 shadow-sm shadow-black/[0.02]',
        ].join(' ')}
        style={{ WebkitAppearance: 'none' }}
        title={selectedModel || '选择模型'}
      >
        {!providers.length && (
          <option value="">{loading ? '加载模型列表中...' : '暂无模型列表'}</option>
        )}
        {providers.map((provider) => (
          <optgroup key={provider.id} label={provider.label}>
            {provider.models.map((model) => (
              <option key={`${provider.id}:${model}`} value={`${provider.id}::${model}`}>
                {model}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className={`pointer-events-none absolute inset-y-0 right-2 flex items-center ${isCompact ? 'right-2' : ''}`}>
        {loading ? (
          <div className={`${isCompact ? 'w-3 h-3' : 'w-3 h-3'} border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin`} />
        ) : (
          <svg className={`${isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-gray-300`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 9l-7.5 7.5L4.5 9" />
          </svg>
        )}
      </div>
    </div>
  )

  if (isCompact) {
    const selectedLabel = selectedModel || (loading ? '加载模型列表中...' : providers.length ? '选择模型' : '暂无模型')
    const disabled = loading || providers.length === 0 || conversationLocked

    return (
      <div ref={rootRef} className="relative shrink-0 min-w-0">
        <button
          type="button"
          onClick={() => {
            if (disabled) return
            setOpen((v) => !v)
          }}
          disabled={disabled}
          className={[
            'group inline-flex items-center gap-1.5 h-7 min-w-0 px-2 rounded-full border',
            'bg-white/95 shadow-sm shadow-black/[0.03] transition-all',
            'border-gray-200/80 text-gray-700',
            !disabled ? 'hover:border-blue-200 hover:shadow-blue-100/20' : '',
            'focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            isInline ? 'max-w-[165px] sm:max-w-[200px]' : 'max-w-[240px] sm:max-w-[280px]',
            error ? 'border-red-200/90' : '',
          ].join(' ')}
          title={conversationLocked ? '当前会话已锁定模型，清空对话后可切换' : (selectedModel || '选择模型')}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {!isInline && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-gray-200/80 bg-gray-50 text-[10px] text-gray-500 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              {providerLabel}
            </span>
          )}
          <span className="min-w-0 truncate text-[11px]">{selectedLabel}</span>
          {conversationLocked && (
            <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 10.5V7.875a4.125 4.125 0 10-8.25 0V10.5m-.75 0h9.75c.621 0 1.125.504 1.125 1.125v7.125c0 .621-.504 1.125-1.125 1.125h-9.75A1.125 1.125 0 016.375 18.75v-7.125c0-.621.504-1.125 1.125-1.125z" />
            </svg>
          )}
          {loading ? (
            <div className="ml-auto w-3 h-3 border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin shrink-0" />
          ) : (
            <svg
              className={`ml-auto w-3 h-3 text-gray-300 shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${conversationLocked ? 'opacity-50' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 9l-7.5 7.5L4.5 9" />
            </svg>
          )}
        </button>

        {open && (
          <div className="absolute right-0 bottom-full mb-2 z-30 w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200/80 bg-white shadow-xl shadow-black/10 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
              <div className="text-[10px] uppercase tracking-[0.08em] text-gray-400">AIHubMix</div>
              <div className="text-[11px] text-gray-500 mt-0.5">选择对话生成与自动修复使用的模型</div>
            </div>

            <div className="max-h-[280px] overflow-y-auto p-1.5">
              {providers.map((provider) => (
                <div key={provider.id} className="mb-1.5 last:mb-0">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                    {provider.label}
                  </div>
                  <div className="space-y-0.5">
                    {provider.models.map((model) => {
                      const active = provider.id === selectedProvider && model === selectedModel
                      return (
                        <button
                          key={`${provider.id}:${model}`}
                          type="button"
                          onClick={() => {
                            setSelection(provider.id, model)
                            setOpen(false)
                          }}
                          className={[
                            'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors',
                            active
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800',
                          ].join(' ')}
                          role="option"
                          aria-selected={active}
                        >
                          <span
                            className={[
                              'w-1.5 h-1.5 rounded-full shrink-0',
                              active ? 'bg-blue-500' : 'bg-gray-200',
                            ].join(' ')}
                          />
                          <span className="min-w-0 flex-1 truncate text-[11px]">{model}</span>
                          {active && (
                            <svg className="w-3 h-3 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && !isInline && (
          <span
            className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-red-50 text-red-500 border border-red-100/80 shrink-0"
            title={error}
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="hidden md:flex items-center gap-2 mr-2">
      <span className="text-[10.5px] uppercase tracking-[0.08em] text-gray-300">AIHubMix</span>

      <span className="inline-flex items-center px-2 py-1 rounded-md border border-gray-200/80 bg-gray-50 text-[11px] text-gray-600">
        {providerLabel}
      </span>

      <div className="w-[240px]">
        {selectEl}
      </div>

      {error && (
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-50 text-red-500 border border-red-100/80"
          title={error}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
      )}
    </div>
  )
}
