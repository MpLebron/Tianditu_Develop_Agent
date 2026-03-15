import { describe, expect, it } from 'vitest'
import { CodeGenerator } from '../src/agent/CodeGenerator.js'

describe('CodeGenerator truncated HTML recovery', () => {
  const generator = new CodeGenerator() as any

  it('rejects truncated script bodies during code-delta recovery', () => {
    const recovered = generator.recoverCodeFromCodeDelta(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Test</title>
</head>
<body>
  <div id="map"></div>
  <script>
    function showStatus(message, type) {
`)

    expect(recovered).toBe('')
  })

  it('rejects fenced HTML that closes markdown before script closes', () => {
    const parsed = generator.parseResponse(`\`\`\`html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Test</title>
</head>
<body>
  <script>
    function initMap() {
      console.log('start')
\`\`\``)

    expect(parsed.code).toBe('')
  })

  it('accepts complete HTML with balanced script tags', () => {
    const parsed = generator.parseResponse(`\`\`\`html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Test</title>
</head>
<body>
  <div id="map"></div>
  <script>
    function initMap() {
      console.log('ready')
    }
  </script>
</body>
</html>
\`\`\``)

    expect(parsed.code).toContain('</script>')
    expect(parsed.code).toContain('</html>')
  })

  it('accepts complete HTML when script contains regex replacement and entity maps', () => {
    const parsed = generator.parseResponse(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Test</title></head>
<body>
  <div id="app"></div>
  <script>
    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/[&<>"']/g, function (m) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[m];
      });
    }

    document.addEventListener('DOMContentLoaded', function () {
      console.log(escapeHtml('<tag>'));
    });
  </script>
</body>
</html>`)

    expect(parsed.code).toContain('</html>')
    expect(parsed.code).toContain('escapeHtml')
  })

  it('extracts complete html even when explanatory text trails after </html>', () => {
    const parsed = generator.parseResponse(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Test</title></head>
<body><div id="app"></div></body>
</html>
使用方式
将 \${TIANDITU_TOKEN} 替换为您的天地图 API Key`)

    expect(parsed.code).toContain('</html>')
    expect(parsed.code).not.toContain('使用方式')
  })

  it('keeps only the first complete html document when extra script content trails after </html>', () => {
    const parsed = generator.parseResponse(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Test</title></head>
<body><div id="app"></div></body>
</html>
<script>
  console.log('duplicate tail should be ignored')
</script>`)

    expect(parsed.code).toContain('</html>')
    expect(parsed.code).not.toContain('duplicate tail should be ignored')
  })

  it('skips invalid early </html> candidates inside script bodies and keeps the first valid html document', () => {
    const extracted = generator.extractFirstCompleteHtmlDocument(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Valid</title></head>
<body>
  <script>
    const fakeTail = "</html>";
  </script>
  <div id="app"></div>
</body>
</html>`)

    expect(extracted).toContain('<title>Valid</title>')
    expect(extracted).toContain('<div id="app"></div>')
  })

  it('streams only the missing suffix when recovered html keeps the same prefix', () => {
    const plan = generator.buildRecoveryStreamPlan(
      '<!DOCTYPE html><html><body><div id="app"></div></body></html>',
      '<!DOCTYPE html><html><body><div id="app">',
    )

    expect(plan.reset).toBe(false)
    expect(plan.streamCode).toBe('</div></body></html>')
  })

  it('falls back to reset when recovered html rewrites the previous prefix', () => {
    const plan = generator.buildRecoveryStreamPlan(
      '<!DOCTYPE html><html><body><main id="app"></main></body></html>',
      '<!DOCTYPE html><html><body><div id="app">',
    )

    expect(plan.reset).toBe(true)
    expect(plan.streamCode).toContain('<!DOCTYPE html>')
  })
})
