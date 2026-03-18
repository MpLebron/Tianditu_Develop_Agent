import { describe, expect, it } from 'vitest'
import { buildToolUiMetadata } from '../src/agent/ToolUiMetadata.js'

describe('buildToolUiMetadata', () => {
  it('groups reference planning steps into a user-facing reference-support bucket', () => {
    const metadata = buildToolUiMetadata({
      toolName: 'reference_planner.decide',
      args: { mode: 'generate' },
      result: { action: 'read_skill_docs', reason: '需要补充参考资料' },
      status: 'done',
    })

    expect(metadata.uiVisibility).toBe('grouped')
    expect(metadata.uiGroup).toBe('reference_support')
    expect(metadata.uiGroupLabel).toBe('补充资料')
  })

  it('marks native tool loop wrapper as debug-only', () => {
    const metadata = buildToolUiMetadata({
      toolName: 'native_tool_loop.run',
      status: 'done',
    })

    expect(metadata.uiVisibility).toBe('debug')
  })

  it('produces user-facing activity labels for web search', () => {
    const metadata = buildToolUiMetadata({
      toolName: 'web_search.search',
      args: { query: '南京师范大学 正确位置' },
      status: 'running',
    })

    expect(metadata.uiVisibility).toBe('activity')
    expect(metadata.uiLabel).toBe('联网搜索资料')
    expect(metadata.uiSummary).toContain('南京师范大学')
  })
})
