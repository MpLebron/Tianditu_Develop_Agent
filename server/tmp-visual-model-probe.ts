import { readFileSync } from 'fs'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createLLM } from './src/llm/createLLM.js'

async function main() {
  const llm = createLLM({
    provider: 'openai',
    model: 'gpt-4.1-nano',
    temperature: 0,
    maxTokens: 300,
    timeoutMs: 45000,
  })

  const imgPath = '/Users/mpl/Downloads/coding/project/work/tianditu-smart-map/tmp-pw-map-check.png'
  const base64 = readFileSync(imgPath).toString('base64')

  const response = await llm.invoke([
    new SystemMessage('你是视觉诊断助手。仅输出 JSON：{"anomalous":boolean,"summary":string,"diagnosis":string,"repairHint":string,"confidence":number,"severity":"low|medium|high"}'),
    new HumanMessage({
      content: [
        { type: 'text', text: '请根据图片判断是否异常。不要输出 markdown。' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
      ] as any,
    }),
  ])

  console.log('CONTENT_KIND:', Array.isArray(response.content) ? 'array' : typeof response.content)
  console.log('CONTENT_RAW_START')
  console.log(typeof response.content === 'string' ? response.content : JSON.stringify(response.content))
  console.log('CONTENT_RAW_END')
}

main().catch((err) => {
  console.error('PROBE_ERROR:', err?.message || String(err))
  process.exit(1)
})
