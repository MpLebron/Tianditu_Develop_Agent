import { exampleCards, getExamplePrompt } from '../../data/exampleCards'

interface WorkspaceExampleGalleryProps {
  onSelectExample: (prompt: string, sampleId?: string) => void
  disabled?: boolean
}

export function WorkspaceExampleGallery({
  onSelectExample,
  disabled = false,
}: WorkspaceExampleGalleryProps) {
  return (
    <div className="min-h-full px-5 py-10">
      <div className="mx-auto w-full max-w-[360px]">
        <div className="mb-6 text-center">
          <h3 className="text-[32px] font-semibold tracking-tight text-slate-900">开始创建</h3>
        </div>

        <div className="space-y-2.5">
          {exampleCards.map((example, index) => (
            <button
                key={example.title}
                type="button"
                disabled={disabled}
                onClick={() => onSelectExample(getExamplePrompt(example), example.sampleId)}
                className="group flex w-full items-start rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-[15px] font-medium text-slate-900">
                      {example.title}
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      {example.category}
                    </span>
                  </div>
                  <div className="mt-1 text-[13px] leading-5 text-slate-500">
                    {example.desc}
                  </div>
                </div>
              </button>
            ))}
          </div>
      </div>
    </div>
  )
}
