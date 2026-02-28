import { createLLM } from '../llm/createLLM.js'
import { config } from '../config.js'
import type { LlmSelection } from '../provider/index.js'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

/**
 * 知识驱动的 LLM 代码生成
 */
export class CodeGenerator {
  constructor() {}

  /**
   * 生成地图代码（或纯文字回复，由 LLM 自主判断）
   */
  async generate(params: {
    userInput: string
    skillDocs: string
    skillCatalog?: string
    conversationHistory?: string
    existingCode?: string
    fileData?: string
    llmSelection?: LlmSelection
  }): Promise<{ code: string; explanation: string }> {
    const systemPrompt = this.buildSystemPrompt({ skillDocs: params.skillDocs, skillCatalog: params.skillCatalog })
    const userPrompt = this.buildUserPrompt(params)

    const llm = createLLM({ temperature: 0.3, llmSelection: params.llmSelection })
    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ])

    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content)

    return this.parseResponse(content)
  }

  /**
   * 修复代码错误
   */
  async fixError(params: {
    code: string
    error: string
    skillDocs: string
    fileData?: string
    errorDiagnosis?: string
    llmSelection?: LlmSelection
  }): Promise<{ code: string; explanation: string }> {
    const systemPrompt = this.buildFixSystemPrompt({ skillDocs: params.skillDocs })
    const userPrompt = this.buildFixUserPrompt(params)

    const llm = createLLM({ temperature: 0.3, llmSelection: params.llmSelection })
    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ])

    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content)

    return this.parseResponse(content)
  }

  /**
   * 流式修复代码错误：让前端在自动修复阶段也能实时看到修复分析和代码增量
   */
  async *fixErrorStream(params: {
    code: string
    error: string
    skillDocs: string
    fileData?: string
    errorDiagnosis?: string
    llmSelection?: LlmSelection
  }): AsyncGenerator<{ type: 'text' | 'code_start' | 'code_delta' | 'code' | 'error'; content: string }> {
    const systemPrompt = this.buildFixSystemPrompt({ skillDocs: params.skillDocs })
    const userPrompt = this.buildFixUserPrompt(params)

    try {
      const llm = createLLM({ temperature: 0.3, llmSelection: params.llmSelection })
      const stream = await llm.stream([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ])

      let fullContent = ''
      let inCodeBlock = false
      let codeStartEmitted = false
      let textBuffer = ''
      let codeBuffer = ''

      for await (const chunk of stream) {
        const text = typeof chunk.content === 'string' ? chunk.content : ''
        if (!text) continue
        fullContent += text

        for (const char of text) {
          textBuffer += char

          if (!inCodeBlock && textBuffer.endsWith('```html')) {
            const beforeCode = textBuffer.slice(0, -7)
            if (beforeCode) yield { type: 'text' as const, content: beforeCode }
            textBuffer = ''
            inCodeBlock = true
            if (!codeStartEmitted) {
              codeStartEmitted = true
              yield { type: 'code_start' as const, content: '' }
            }
          } else if (inCodeBlock && textBuffer.endsWith('```')) {
            const lastCodeChunk = textBuffer.slice(0, -3)
            if (lastCodeChunk) {
              codeBuffer += lastCodeChunk
              yield { type: 'code_delta' as const, content: lastCodeChunk }
            }
            inCodeBlock = false
            textBuffer = ''
          } else if (inCodeBlock && textBuffer.length > 80) {
            const flush = textBuffer.slice(0, -3)
            codeBuffer += flush
            yield { type: 'code_delta' as const, content: flush }
            textBuffer = textBuffer.slice(-3)
          } else if (!inCodeBlock && textBuffer.length > 10) {
            const flush = textBuffer.slice(0, -6)
            if (flush) yield { type: 'text' as const, content: flush }
            textBuffer = textBuffer.slice(-6)
          }
        }
      }

      if (textBuffer) {
        if (inCodeBlock) {
          codeBuffer += textBuffer
          yield { type: 'code_delta' as const, content: textBuffer }
          inCodeBlock = false
        } else {
          yield { type: 'text' as const, content: textBuffer }
        }
      }

      const parsed = this.parseResponse(fullContent)
      let finalCode = parsed.code

      // 第一层兜底：代码块未闭合时，使用已流式拼接的 code_delta 还原
      if (!finalCode) {
        const recovered = this.recoverCodeFromCodeDelta(codeBuffer)
        if (recovered) {
          finalCode = recovered
          yield { type: 'text' as const, content: '\n\n检测到修复输出被截断，已使用流式代码自动收尾。' }
        }
      }

      // 第二层兜底：再尝试一次非流式重试，要求“只输出完整 HTML”
      if (!finalCode) {
        const retried = await this.retryCompleteHtml({
          systemPrompt,
          userPrompt,
          llmSelection: params.llmSelection,
        })
        if (retried.code) {
          finalCode = retried.code
          if (retried.explanation) {
            yield { type: 'text' as const, content: `\n\n${retried.explanation}` }
          }
        }
      }

      if (finalCode) {
        yield { type: 'code' as const, content: finalCode }
      } else {
        yield {
          type: 'error' as const,
          content: '修复输出不完整：未得到可用的最终 HTML 代码，请重试或简化修复目标。',
        }
      }
    } catch (err: any) {
      yield { type: 'error' as const, content: err.message }
    }
  }

  /**
   * 流式生成：文字和代码都实时流式推送
   *
   * 事件类型：
   * - text: 说明文字（逐段推送）
   * - code_start: 代码块开始（通知前端展开代码面板）
   * - code_delta: 代码增量内容（逐段推送，前端拼接显示）
   * - code: 完整代码（代码块结束后推送，用于最终渲染地图）
   * - error: 错误信息
   */
  async *generateStream(params: {
    userInput: string
    skillDocs: string
    skillCatalog?: string
    conversationHistory?: string
    existingCode?: string
    fileData?: string
    llmSelection?: LlmSelection
  }): AsyncGenerator<{ type: 'text' | 'code_start' | 'code_delta' | 'code' | 'error'; content: string }> {
    const systemPrompt = this.buildSystemPrompt({ skillDocs: params.skillDocs, skillCatalog: params.skillCatalog })
    const userPrompt = this.buildUserPrompt(params)

    try {
      const llm = createLLM({ temperature: 0.3, llmSelection: params.llmSelection })
      const stream = await llm.stream([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ])

      let fullContent = ''
      let inCodeBlock = false
      let codeStartEmitted = false
      let textBuffer = ''
      let codeBuffer = ''

      for await (const chunk of stream) {
        const text = typeof chunk.content === 'string' ? chunk.content : ''
        if (!text) continue
        fullContent += text

        for (const char of text) {
          textBuffer += char

          if (!inCodeBlock && textBuffer.endsWith('```html')) {
            // 进入代码块：推送之前的文字，然后发出 code_start
            const beforeCode = textBuffer.slice(0, -7)
            if (beforeCode) yield { type: 'text' as const, content: beforeCode }
            textBuffer = ''
            inCodeBlock = true
            if (!codeStartEmitted) {
              codeStartEmitted = true
              yield { type: 'code_start' as const, content: '' }
            }
          } else if (inCodeBlock && textBuffer.endsWith('```')) {
            // 退出代码块：推送最后一段 code_delta（去掉结尾 ```）
            const lastCodeChunk = textBuffer.slice(0, -3)
            if (lastCodeChunk) {
              codeBuffer += lastCodeChunk
              yield { type: 'code_delta' as const, content: lastCodeChunk }
            }
            inCodeBlock = false
            textBuffer = ''
          } else if (inCodeBlock && textBuffer.length > 80) {
            // 在代码块内：批量推送代码增量（保留末尾 3 字符防止截断 ```）
            const flush = textBuffer.slice(0, -3)
            codeBuffer += flush
            yield { type: 'code_delta' as const, content: flush }
            textBuffer = textBuffer.slice(-3)
          } else if (!inCodeBlock && textBuffer.length > 10) {
            // 不在代码块内：推送文字
            const flush = textBuffer.slice(0, -6)
            if (flush) yield { type: 'text' as const, content: flush }
            textBuffer = textBuffer.slice(-6)
          }
        }
      }

      // 推送剩余文字缓冲区
      if (textBuffer) {
        if (inCodeBlock) {
          codeBuffer += textBuffer
          yield { type: 'code_delta' as const, content: textBuffer }
          inCodeBlock = false
        } else {
          yield { type: 'text' as const, content: textBuffer }
        }
      }

      // 最后解析完整内容，推送完整代码（用于地图渲染）
      const parsed = this.parseResponse(fullContent)
      let finalCode = parsed.code
      const codeLikelyExpected = codeStartEmitted || codeBuffer.trim().length > 0 || /```html/i.test(fullContent)

      // 第一层兜底：代码块未闭合时，优先用 code_delta 还原
      if (!finalCode && codeLikelyExpected) {
        const recovered = this.recoverCodeFromCodeDelta(codeBuffer)
        if (recovered) {
          finalCode = recovered
          yield { type: 'text' as const, content: '\n\n检测到输出在代码中途结束，已使用流式代码自动收尾。' }
        }
      }

      // 第二层兜底：自动重试一轮，要求模型直接返回完整 HTML
      if (!finalCode && codeLikelyExpected) {
        const retried = await this.retryCompleteHtml({
          systemPrompt,
          userPrompt,
          llmSelection: params.llmSelection,
        })
        if (retried.code) {
          finalCode = retried.code
          if (retried.explanation) {
            yield { type: 'text' as const, content: `\n\n${retried.explanation}` }
          }
        }
      }

      if (finalCode) {
        yield { type: 'code' as const, content: finalCode }
      } else {
        // 纯文字回答场景：没有代码输出是合法结果，不应误判为截断
        if (!codeLikelyExpected) return
        yield {
          type: 'error' as const,
          content: '输出不完整：未得到可用的最终 HTML 代码，请重试或缩小本次需求范围。',
        }
      }
    } catch (err: any) {
      yield { type: 'error' as const, content: err.message }
    }
  }

  private buildSystemPrompt(params: { skillDocs: string; skillCatalog?: string }): string {
    return `你是天地图 JS API v5.0 智能开发助手。你需要根据用户请求自主判断应该做什么。

## 你的能力
1. **生成地图代码**：当用户需要创建/修改地图、可视化数据、搜索地点、规划路线时，生成可运行的 HTML
2. **回答技术问题**：当用户询问 API 用法、概念解释等纯知识性问题时，用文字回答
3. **分析数据文件**：当用户上传文件并询问其内容时，基于文件摘要回答

## 自主判断规则
- 如果用户的请求需要在地图上展示任何内容（标注、图层、路线、搜索结果、数据可视化等），生成 HTML 代码
- 如果用户说"修改"、"调整"、"改一下"等，基于现有代码修改并输出新的完整 HTML
- 如果用户询问的是纯知识性问题（如"什么是 GeoJSON"、"这个 API 怎么用"），用文字回答，不生成代码
- 如果用户上传了文件并问"这个数据里面是什么"、"有多少条记录"等分析性问题，基于文件摘要用文字回答
- 如果有现有代码且用户的后续请求含有动作词（如"帮我"、"添加"、"在地图上"），生成修改后的代码

## 代码生成规则（仅当你判断需要生成代码时）
1. 命名空间：只使用 TMapGL
2. Token：使用 \${TIANDITU_TOKEN} 占位符
2.1 地图构造函数必须使用天地图 v5 写法：\`new TMapGL.Map('map', { ... })\`，禁止使用 mapbox 风格 \`new TMapGL.Map({ container: 'map', ... })\`
3. 控件/图层：必须在 map.on("load", ...) 回调内
4. 坐标格式：[经度, 纬度]
5. 输出：完整可运行 HTML 文件
6. 中文注释
7. 默认底图时不要显式设置 style（不要写 style: 'default'，该写法在当前运行环境可能触发底图 404）
8. 如需主题样式，仅使用 'black' 或 'blue'，禁止使用 mapbox:// 或任何其他样式 URL
9. 地图实例变量统一使用 \`var map\`，禁止在同一 HTML 中重复 \`let/const map\` 声明（避免 "Identifier 'map' has already been declared"）
10. 默认不要添加 \`symbol + text-field\` 的常驻文字标注图层（容易触发字体 pbf 请求告警）；优先用侧边栏/弹窗展示文字信息。仅当用户明确要求“地图上常驻文字标注”时才添加文本图层

## 数据文件处理规则（极其重要，必须严格遵守）
当用户上传了数据文件时：
- 用户上传的文件信息中包含"文件获取链接URL"字段（可能是完整 URL）
- 你**必须原封不动地使用该 URL 路径**，不得修改、缩写或自编文件名
- 在生成的代码中使用 fetch() 加载该 URL，不要将数据硬编码在代码中
- 若文件上下文标注了“返回结构: 标准 GeoJSON FeatureCollection”，则 fetch(url).json() 的结果可直接作为 GeoJSON 使用（无需猜测 rawData.data / rawData[0].data）
- 若文件上下文中提供了 "GeoJSON提取路径"，必须按该路径提取 GeoJSON（例如 rawData.data）
- 传给 map.addSource({ type: 'geojson', data }) 的 data 必须是 FeatureCollection/Feature 对象
- 禁止把 geojson.features（数组）直接传给 map.addSource 的 data
- ❌ 错误示范：fetch('/uploads/us-airports.geojson') ← 自编文件名，绝对禁止
- ✅ 正确做法：从用户上传文件信息的"文件获取链接URL"字段中复制完整路径直接使用

## API 引入
\`\`\`html
<script src="https://api.tianditu.gov.cn/api/v5/js?tk=\${TIANDITU_TOKEN}"></script>
\`\`\`

## 参考文档
${params.skillDocs}

${params.skillCatalog ? '## 可用文档目录\n' + params.skillCatalog : ''}

## 输出格式
- 如果生成代码：先简要说明思路，然后输出 \`\`\`html 代码块，最后简要说明
- 如果纯文字回答：直接用中文回答，简洁准确，不要输出 \`\`\`html 代码块`
  }

  private buildFixSystemPrompt(params: { skillDocs: string }): string {
    return `你是天地图 JS API v5.0 代码修复专家。修复用户代码中的错误。

## 修复规则
1. 只修复报错的部分，保持其他代码不变
2. 必须使用 TMapGL 命名空间
3. 输出完整的可运行 HTML
4. 优先修复真正导致报错的根因，避免大幅重写
5. 如果是异步加载/事件时序问题，要增加必要的判空和时机保护
5.1 如果提供了“错误诊断”信息，必须先遵循诊断中的根因与检查清单再改代码
6. 若错误涉及 GeoJSON/数据格式（如 "not a valid GeoJSON object"、"无法识别的数据格式"）：
   - 优先检查 fetch 返回结构是否为包装对象（如 rawData.data）
   - 优先检查传给 map.addSource 的 data 是否误传成 features 数组
   - 在确认结构/入参无误前，不要优先归因到坐标系问题
7. 如果文件上下文给出了 "GeoJSON提取路径"，修复时必须遵循该提取路径
8. 如果错误包含 "AJAXError: Not Found (404): default"，优先检查并移除/修正 style: 'default'（默认样式应省略 style 字段）
9. 如果错误包含 "Identifier 'map' has already been declared"：
   - 检查是否存在重复 \`let/const map\` 声明
   - 统一改为单次声明或改为 \`var map\`
   - 不要在同一 HTML 的多个脚本块中重复声明 \`let/const map\`
10. 如果错误是 \`vector.tianditu.gov.cn/static/font/*.pbf\` 的 404：
   - 这通常是字体资源请求告警，不一定影响地图主体功能
   - 优先避免新增 \`symbol + text-field\` 常驻文字图层，改为侧边栏/弹窗展示文字
   - 不要因为该告警去重写核心业务逻辑（先确认地图主体与交互是否正常）

## 参考文档
${params.skillDocs}`
  }

  private buildFixUserPrompt(params: {
    code: string
    error: string
    skillDocs: string
    fileData?: string
    errorDiagnosis?: string
  }): string {
    let prompt = `## 当前代码
\`\`\`html
${params.code}
\`\`\`

## 错误信息
${params.error}

请修复以上错误，输出修复后的完整 HTML 代码。`

    if (params.errorDiagnosis) {
      prompt += `\n\n## 错误诊断（必须先按此定位根因再修改）\n${params.errorDiagnosis}`
    }

    if (params.fileData) {
      prompt += `\n\n## 用户上传的数据文件上下文（可能包含真实文件URL）\n${params.fileData}`
    }

    return prompt
  }

  private buildUserPrompt(params: {
    userInput: string
    conversationHistory?: string
    existingCode?: string
    fileData?: string
  }): string {
    let prompt = params.userInput

    if (params.existingCode) {
      prompt += `\n\n## 当前代码（需要在此基础上修改）\n\`\`\`html\n${params.existingCode}\n\`\`\``
    }

    if (params.fileData) {
      prompt += `\n\n## 用户上传的数据文件\n${params.fileData}`
    }

    if (params.conversationHistory) {
      prompt = `## 对话历史\n${params.conversationHistory}\n\n## 当前请求\n${prompt}`
    }

    return prompt
  }

  private recoverCodeFromCodeDelta(codeDelta: string): string {
    const normalized = codeDelta
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim()

    if (!normalized) return ''
    if (!/(<!doctype\s+html|<html\b)/i.test(normalized)) return ''
    return this.ensureHtmlClosed(normalized)
  }

  private ensureHtmlClosed(code: string): string {
    let next = code.trim()

    if (/<body\b/i.test(next) && !/<\/body>/i.test(next)) {
      next += '\n</body>'
    }
    if (/<html\b/i.test(next) && !/<\/html>/i.test(next)) {
      next += '\n</html>'
    }

    return next
  }

  private async retryCompleteHtml(params: {
    systemPrompt: string
    userPrompt: string
    llmSelection?: LlmSelection
  }): Promise<{ code: string; explanation: string }> {
    const maxRounds = Math.max(0, config.llm.recoveryRounds || 0)
    if (maxRounds === 0) return { code: '', explanation: '' }

    let lastExplanation = ''

    for (let i = 0; i < maxRounds; i += 1) {
      const llm = createLLM({ temperature: 0.2, llmSelection: params.llmSelection })
      const retryPrompt = [
        params.userPrompt,
        '',
        '## 系统续写要求（必须遵守）',
        '你上一条响应在代码中途结束。请重新输出“完整可运行 HTML”。',
        '- 只输出 HTML 代码本身，不要解释',
        '- 从 <!DOCTYPE html> 开始，到 </html> 结束',
        '- 不要使用 Markdown 代码块包裹',
        '- 在保证需求的前提下尽量精简样式和冗余文案',
      ].join('\n')

      const response = await llm.invoke([
        new SystemMessage(params.systemPrompt),
        new HumanMessage(retryPrompt),
      ])

      const content = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content)
      const parsed = this.parseResponse(content)
      if (parsed.code) {
        return {
          code: parsed.code,
          explanation: '检测到上一次输出被截断，已自动完成一轮续写并恢复完整代码。',
        }
      }
      lastExplanation = parsed.explanation || ''
    }

    return { code: '', explanation: lastExplanation }
  }

  private parseResponse(content: string): { code: string; explanation: string } {
    // 提取 HTML 代码块
    const htmlMatch = content.match(/```html\s*([\s\S]*?)```/)
    if (htmlMatch) {
      const code = this.postProcessGeneratedHtml(htmlMatch[1].trim())
      const explanation = content.replace(htmlMatch[0], '').trim()
      return { code, explanation }
    }

    // 如果整个响应就是 HTML
    if (content.trim().startsWith('<!DOCTYPE') || content.trim().startsWith('<html')) {
      return { code: this.postProcessGeneratedHtml(content.trim()), explanation: '' }
    }

    return { code: '', explanation: content }
  }

  /**
   * 生成代码兜底规范化：
   * 将可能导致重复声明语法错误的 let/const map 统一降级为 var map。
   */
  private postProcessGeneratedHtml(code: string): string {
    if (!code) return code

    let next = code
      .replace(/\blet\s+map\s*;/g, 'var map;')
      .replace(/\bconst\s+map\s*;/g, 'var map;')
      .replace(/\blet\s+map\s*=/g, 'var map =')
      .replace(/\bconst\s+map\s*=/g, 'var map =')

    // 纠偏：将误生成的 mapbox 风格构造改为天地图 v5 构造签名
    // from: new TMapGL.Map({ container: 'map', ... })
    // to:   new TMapGL.Map('map', { ... })
    next = next.replace(/new\s+TMapGL\.Map\s*\(\s*\{([\s\S]*?)\}\s*\)/g, (full, body) => {
      const containerMatch = String(body).match(/container\s*:\s*(['"`])([^'"`]+)\1/)
      if (!containerMatch) return full

      const containerId = containerMatch[2]
      let optionsBody = String(body).replace(/(^|,)\s*container\s*:\s*(['"`])[^'"`]+\2\s*(?=,|$)/, '$1')
      optionsBody = optionsBody.replace(/^\s*,\s*/, '').replace(/,\s*,/g, ',')
      return `new TMapGL.Map('${containerId}', {${optionsBody}})`
    })

    return next
  }
}
