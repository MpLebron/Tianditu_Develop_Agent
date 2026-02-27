import type { ThoughtChainItem } from '../../types/chat'

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null
}

function formatValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function statusLabel(item: ThoughtChainItem) {
  if (item.status === 'running') return '运行中'
  if (item.status === 'error') return '失败'
  return '完成'
}

function statusClass(item: ThoughtChainItem) {
  if (item.status === 'running') return 'bg-blue-50 text-blue-600 border-blue-200/70'
  if (item.status === 'error') return 'bg-red-50 text-red-600 border-red-200/70'
  return 'bg-emerald-50 text-emerald-600 border-emerald-200/70'
}

function getMode(item: ThoughtChainItem): 'fix' | 'generate' | undefined {
  const args = asRecord(item.args)
  const result = asRecord(item.result)
  const mode = args?.mode ?? result?.mode
  return mode === 'fix' || mode === 'generate' ? mode : undefined
}

function getTitle(item: ThoughtChainItem): string {
  const mode = getMode(item)
  const args = asRecord(item.args)
  const result = asRecord(item.result)
  const skillName = String(args?.skillName ?? result?.skillName ?? '').trim()

  switch (item.toolName) {
    case 'skill_tool_loop.decideNextAction':
      return mode === 'fix'
        ? '修复阶段：决定下一步（读文档 / 直接修复）'
        : '生成阶段：决定下一步（读文档 / 开始生成）'
    case 'doc_loader.readSkillDoc':
      return `${mode === 'fix' ? '修复阶段' : mode === 'generate' ? '生成阶段' : 'Agent'}：读取 skill 文档${skillName ? `（${skillName}）` : ''}`
    case 'code_generator.fixError':
      return '根据运行错误修复代码'
    case 'code_generator.generateStream':
      return '调用代码生成器'
    case 'skill_planner.selectSkills':
      return mode === 'fix' ? '修复阶段兜底：选择技能' : '生成阶段兜底：选择技能'
    case 'skill_matcher.matchByKeywords':
      return '关键词匹配兜底（仅在规划失败时）'
    default:
      return item.toolName
  }
}

function getSummary(item: ThoughtChainItem): string | null {
  const args = asRecord(item.args)
  const result = asRecord(item.result)
  const mode = getMode(item)

  if (item.toolName === 'skill_tool_loop.decideNextAction') {
    if (item.status === 'running') {
      const iteration = args?.iteration != null ? `第 ${args.iteration} 轮` : '当前轮'
      const errorHint = mode === 'fix' && typeof args?.runtimeErrorPreview === 'string' ? '，已带入运行错误信息' : ''
      return `${iteration}决策中${errorHint}`
    }
    const summary = typeof result?.decisionSummary === 'string' ? result.decisionSummary : ''
    const reason = typeof result?.reason === 'string' ? result.reason : ''
    return [summary, reason ? `原因：${reason}` : ''].filter(Boolean).join(' | ') || null
  }

  if (item.toolName === 'doc_loader.readSkillDoc') {
    const skillName = String(args?.skillName ?? result?.skillName ?? '').trim()
    if (item.status === 'running') {
      const reason = typeof args?.selectionReason === 'string' ? `，原因：${args.selectionReason}` : ''
      return `${skillName ? `正在读取 ${skillName}` : '正在读取 skill 文档'}${reason}`
    }
    const docChars = typeof result?.docChars === 'number' ? `${result.docChars} chars` : ''
    const totalLoaded = typeof result?.totalLoadedSkills === 'number' ? `累计 ${result.totalLoadedSkills} 个 skill` : ''
    const reason = typeof result?.selectionReason === 'string' ? `原因：${result.selectionReason}` : ''
    return [skillName ? `已读取 ${skillName}` : '', docChars, totalLoaded, reason].filter(Boolean).join(' | ') || null
  }

  if (item.toolName === 'code_generator.fixError') {
    if (item.status === 'running') {
      const matchedSkills = Array.isArray(args?.matchedSkills) ? args.matchedSkills : []
      const skillInfo = matchedSkills.length ? `已加载 skills: ${matchedSkills.join(', ')}` : '未加载额外 skill 文档'
      return `正在基于运行错误和当前代码生成修复方案 | ${skillInfo}`
    }
    if (typeof item.result === 'string') return item.result
    const fixed = result?.fixed === true
    const codeChars = typeof result?.codeChars === 'number' ? `${result.codeChars} chars` : ''
    const matchedSkills = Array.isArray(result?.matchedSkills) && result.matchedSkills.length
      ? `使用 skills: ${result.matchedSkills.join(', ')}`
      : '未使用额外 skill 文档'
    return [fixed ? '已生成修复代码' : '未生成可用修复代码', codeChars, matchedSkills].filter(Boolean).join(' | ')
  }

  if (item.toolName === 'code_generator.generateStream') {
    if (item.status === 'running') {
      const selectedSkills = Array.isArray(args?.selectedSkills) && args.selectedSkills.length
        ? `skills: ${args.selectedSkills.join(', ')}`
        : '未预加载 skill 文档'
      return `正在生成回复/代码 | ${selectedSkills}`
    }
    const hasFinalCode = result?.hasFinalCode === true ? '包含最终代码' : '无最终代码'
    const textChunks = typeof result?.textChunks === 'number' ? `文本块 ${result.textChunks}` : ''
    const codeChunks = typeof result?.codeChunks === 'number' ? `代码块 ${result.codeChunks}` : ''
    return [hasFinalCode, textChunks, codeChunks].filter(Boolean).join(' | ') || null
  }

  if (item.toolName === 'skill_planner.selectSkills') {
    if (item.status === 'running') return '规划器兜底中'
    const selected = Array.isArray(result?.selectedSkills) ? result.selectedSkills : []
    const reason = typeof result?.reason === 'string' ? result.reason : ''
    return [
      selected.length ? `选中 skills: ${selected.join(', ')}` : '未选中 skill',
      reason ? `原因：${reason}` : '',
    ].filter(Boolean).join(' | ') || null
  }

  if (item.toolName === 'skill_matcher.matchByKeywords') {
    if (item.status === 'running') return '关键词兜底匹配中（说明上游 planner 异常）'
    const matched = Array.isArray(result?.matchedSkills) ? result.matchedSkills : []
    const source = typeof result?.source === 'string' ? result.source : ''
    return [
      matched.length ? `匹配结果: ${matched.join(', ')}` : '未匹配到 skill',
      source ? `来源：${source}` : '',
    ].filter(Boolean).join(' | ') || null
  }

  return null
}

function modeBadgeClass(mode: 'fix' | 'generate' | undefined) {
  if (mode === 'fix') return 'bg-amber-50 text-amber-700 border-amber-200/80'
  if (mode === 'generate') return 'bg-slate-50 text-slate-600 border-slate-200/80'
  return 'bg-gray-50 text-gray-500 border-gray-200/80'
}

export function ThoughtChain({ items, streaming }: { items: ThoughtChainItem[]; streaming?: boolean }) {
  if (!items.length) return null

  const runningCount = items.filter((i) => i.status === 'running').length

  return (
    <details open={streaming ? true : undefined} className="mb-2 rounded-xl border border-gray-200/80 bg-gray-50/70 overflow-hidden">
      <summary className="list-none cursor-pointer select-none px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-gray-50">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-5 h-5 rounded-md bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4.5 6.75h15m-15 5.25h10.5m-10.5 5.25h15" />
            </svg>
          </span>
          <span className="text-[12px] font-medium text-gray-700">ThoughtChain</span>
          <span className="text-[11px] text-gray-400">{items.length} 步</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {runningCount > 0 && (
            <span className="text-[11px] text-blue-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {runningCount} 运行中
            </span>
          )}
          <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 9l-7.5 7.5L4.5 9" />
          </svg>
        </div>
      </summary>

      <div className="px-2 pb-2 space-y-1.5">
        {items.map((item) => {
          const argsText = formatValue(item.args)
          const resultText = formatValue(item.result)
          const mode = getMode(item)
          const title = getTitle(item)
          const summary = getSummary(item)
          const durationMs =
            typeof item.startedAt === 'number' && typeof item.endedAt === 'number'
              ? Math.max(0, item.endedAt - item.startedAt)
              : null

          return (
            <details
              key={item.toolCallId}
              open={item.status === 'running' ? true : undefined}
              className="bg-white border border-gray-200/80 rounded-lg overflow-hidden"
            >
              <summary className="list-none cursor-pointer px-2.5 py-2 flex items-center justify-between gap-2 hover:bg-gray-50/60">
                <div className="min-w-0">
                  <div className="text-[11.5px] font-medium text-gray-700 truncate">{title}</div>
                  <div className="text-[10.5px] text-gray-400 truncate font-mono">{item.toolName}</div>
                  {summary && (
                    <div className="text-[10.5px] text-gray-500 truncate">{summary}</div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {mode && (
                    <span className={`text-[10.5px] px-1.5 py-0.5 rounded-md border ${modeBadgeClass(mode)}`}>
                      {mode === 'fix' ? '修复' : '生成'}
                    </span>
                  )}
                  {durationMs != null && item.status !== 'running' && (
                    <span className="text-[10.5px] text-gray-400">{durationMs}ms</span>
                  )}
                  <span className={`text-[10.5px] px-1.5 py-0.5 rounded-md border ${statusClass(item)}`}>
                    {statusLabel(item)}
                  </span>
                </div>
              </summary>

              <div className="border-t border-gray-100 px-2.5 py-2 space-y-2">
                <div>
                  <div className="text-[10.5px] text-gray-400 mb-1">调用 ID</div>
                  <div className="m-0 p-2 rounded-md bg-gray-50 text-[10.5px] leading-relaxed text-gray-600 break-all font-mono">
                    {item.toolCallId}
                  </div>
                </div>
                {argsText && (
                  <div>
                    <div className="text-[10.5px] text-gray-400 mb-1">参数</div>
                    <pre className="m-0 p-2 rounded-md bg-gray-50 text-[10.5px] leading-relaxed text-gray-600 whitespace-pre-wrap break-all font-mono">
                      {argsText}
                    </pre>
                  </div>
                )}
                {resultText && (
                  <div>
                    <div className="text-[10.5px] text-gray-400 mb-1">结果</div>
                    <pre className="m-0 p-2 rounded-md bg-gray-50 text-[10.5px] leading-relaxed text-gray-600 whitespace-pre-wrap break-all font-mono">
                      {resultText}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          )
        })}
      </div>
    </details>
  )
}
