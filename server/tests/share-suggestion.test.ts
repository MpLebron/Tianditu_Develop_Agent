import { describe, expect, it } from 'vitest'
import { buildFallbackShareSuggestion, parseLabeledSuggestionText } from '../src/services/ShareSuggestionService.js'

describe('buildFallbackShareSuggestion', () => {
  it('writes a user-facing page introduction instead of a technical summary', () => {
    const code = `
      <html>
        <head><title>清华大学周边 POI 搜索演示</title></head>
        <body>
          <h1>清华大学周边 POI 搜索演示</h1>
          <button>搜索</button>
          <div>当前搜索中心</div>
          <div>搜索结果</div>
          <div>清华大学医院</div>
          <script>
            fetch('/api/tianditu/search?query=医院')
          </script>
        </body>
      </html>
    `

    const result = buildFallbackShareSuggestion({
      code,
      hint: '帮我做一个清华大学周边医院搜索地图',
    })

    expect(result.title).toContain('清华大学')
    expect(result.description).toMatch(/页面围绕|左侧|地图/)
    expect(result.description).not.toContain('/api/tianditu')
    expect(result.description).not.toMatch(/API|SDK|接口|技术|实现/)
  })
})

describe('parseLabeledSuggestionText', () => {
  it('parses streaming labeled text into title and description', () => {
    const parsed = parseLabeledSuggestionText('标题：北京基础地图\n描述：查看以北京市为中心的基础地图页面。')

    expect(parsed.title).toBe('北京基础地图')
    expect(parsed.description).toContain('基础地图页面')
  })
})
