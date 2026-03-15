import { describe, expect, it } from 'vitest'
import { selectContracts } from '../src/agent/ContractSelector.js'

describe('ContractSelector', () => {
  it('prefers valid suggested contract ids', () => {
    const result = selectContracts({
      userInput: '帮我做一个 POI 搜索页面',
      mode: 'generate',
      suggestedIds: ['search-v2-poi'],
      source: 'planner',
    })

    expect(result.contractIds).toEqual(['search-v2-poi'])
    expect(result.decisionSource).toBe('planner')
  })

  it('falls back to trigger-based selection when suggestions are invalid', () => {
    const result = selectContracts({
      userInput: '从故宫开车到首都机场',
      mode: 'generate',
      suggestedIds: ['not-exists'],
      source: 'planner',
    })

    expect(result.contractIds).toContain('drive')
    expect(result.decisionSource).toBe('fallback')
  })
})
