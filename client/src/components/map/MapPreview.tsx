import { useEffect, useRef, useState } from 'react'
import { useMapStore } from '../../stores/useMapStore'
import { useChatStore } from '../../stores/useChatStore'
import { useCodeRunner } from '../../hooks/useCodeRunner'
import { visualQaApi } from '../../services/visualQaApi'
import html2canvas from 'html2canvas'
import { DEFAULT_TIANDITU_TOKEN } from '../../constants/tianditu'

/** 默认地图 HTML — 展示中国全景，indigo 主题风格 */
const DEFAULT_MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden}
  #map{width:100%;height:100%}
</style>
<script src="https://api.tianditu.gov.cn/api/v5/js?tk=${DEFAULT_TIANDITU_TOKEN}"></script>
</head>
<body>
<div id="map"></div>
<script>
  var map = new TMapGL.Map('map', {
    center: [108.9, 34.2],
    zoom: 4.5,
    pitch: 0,
    doubleClickZoom: true,
    scrollZoom: true,
    touchZoomRotate: true
  });
  map.on('load', function() {
    map.addControl(new TMapGL.NavigationControl(), 'bottom-right');
  });
</script>
</body>
</html>`

const MIN_CAPTURE_BASE64_LEN = 800

function dataUrlToBase64(dataUrl: string): string | null {
  const raw = String(dataUrl || '')
  const marker = ';base64,'
  const idx = raw.indexOf(marker)
  if (idx < 0) return null
  const value = raw.slice(idx + marker.length).trim()
  return value || null
}

function isCaptureValid(base64?: string | null): base64 is string {
  return typeof base64 === 'string' && base64.length >= MIN_CAPTURE_BASE64_LEN
}

function pickLargestCanvas(doc: Document): { canvas: HTMLCanvasElement | null; count: number; maxArea: number } {
  const canvases = Array.from(doc.querySelectorAll('canvas'))
  if (!canvases.length) return { canvas: null, count: 0, maxArea: 0 }
  let candidate: HTMLCanvasElement | null = null
  let maxArea = 0
  for (const canvas of canvases) {
    const width = Number(canvas.width || canvas.clientWidth || 0)
    const height = Number(canvas.height || canvas.clientHeight || 0)
    const area = width * height
    if (area > maxArea) {
      maxArea = area
      candidate = canvas as HTMLCanvasElement
    }
  }
  return { canvas: candidate, count: canvases.length, maxArea }
}

async function captureIframeScreenshot(iframe: HTMLIFrameElement | null): Promise<{
  imageBase64: string
  mode: 'dom' | 'canvas'
  canvasCount: number
  largestCanvasArea: number
  canvasReadable: boolean
  canvasTainted: boolean
}> {
  if (!iframe) throw new Error('预览容器不存在')
  const win = iframe.contentWindow
  const doc = iframe.contentDocument
  if (!win || !doc) throw new Error('预览页面未就绪')

  await new Promise<void>((resolve) => {
    win.requestAnimationFrame(() => resolve())
  })
  await new Promise((resolve) => setTimeout(resolve, 220))

  const canvasMeta = pickLargestCanvas(doc)
  let canvasReadable = false
  let canvasTainted = false
  if (canvasMeta.canvas) {
    try {
      const directBase64 = dataUrlToBase64(canvasMeta.canvas.toDataURL('image/png'))
      if (isCaptureValid(directBase64)) {
        canvasReadable = true
        return {
          imageBase64: directBase64,
          mode: 'canvas',
          canvasCount: canvasMeta.count,
          largestCanvasArea: canvasMeta.maxArea,
          canvasReadable,
          canvasTainted: false,
        }
      }
    } catch {
      canvasTainted = true
    }
  }

  // 优先捕获完整页面，保留 UI 信息
  try {
    const rootEl = (doc.documentElement || doc.body) as HTMLElement | null
    if (rootEl) {
      const rendered = await html2canvas(rootEl, {
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: Math.max(320, rootEl.clientWidth || win.innerWidth || 0),
        height: Math.max(240, rootEl.clientHeight || win.innerHeight || 0),
        windowWidth: Math.max(320, win.innerWidth || 0),
        windowHeight: Math.max(240, win.innerHeight || 0),
        scrollX: win.scrollX || 0,
        scrollY: win.scrollY || 0,
      })
      const domBase64 = dataUrlToBase64(rendered.toDataURL('image/png'))
      if (isCaptureValid(domBase64)) {
        return {
          imageBase64: domBase64,
          mode: 'dom',
          canvasCount: canvasMeta.count,
          largestCanvasArea: canvasMeta.maxArea,
          canvasReadable,
          canvasTainted,
        }
      }
    }
  } catch {
    // ignore and fallback to canvas capture
  }

  throw new Error('无法从前端页面捕获有效截图')
}

export function MapPreview() {
  const {
    previewCode,
    currentCode,
    codeStreaming,
    executing,
    execError,
    fixing,
    fixingSource,
    fixRetryCount,
    visualChecking,
    visualFixRetryCount,
    lastVisualCheckedCodeHash,
  } = useMapStore()
  const { iframeRef, run } = useCodeRunner()
  const [showError, setShowError] = useState(true)
  const fixTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const thumbnailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visualInFlightRef = useRef(false)
  const thumbnailInFlightRef = useRef(false)
  const defaultLoaded = useRef(false)
  const MAX_FIX_RETRIES = 2
  const MAX_VISUAL_FIX_RETRIES = 2
  const VISUAL_STABLE_DELAY_MS = 1200
  const THUMBNAIL_CACHE_DELAY_MS = 700
  const renderCode = previewCode || currentCode
  const previewing = Boolean(previewCode && codeStreaming)

  const hashCode = (text: string) => {
    let hash = 2166136261
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i)
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
    }
    return `h${(hash >>> 0).toString(16)}`
  }

  // 加载默认地图或用户代码
  useEffect(() => {
    if (renderCode) {
      run(renderCode)
      defaultLoaded.current = false
    } else if (!defaultLoaded.current) {
      // 没有用户代码时显示默认地图（同样注入错误捕获脚本）
      run(DEFAULT_MAP_HTML)
      defaultLoaded.current = true
    }
  }, [renderCode, run, iframeRef])

  // 监听 iframe 错误
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'map-error') {
        const src = typeof e.data.src === 'string' ? e.data.src : ''
        const line = typeof e.data.line === 'number' ? e.data.line : 0
        const col = typeof e.data.col === 'number' ? e.data.col : 0
        const kind = typeof e.data.kind === 'string' ? e.data.kind : ''
        const requestUrl = typeof e.data.requestUrl === 'string' ? e.data.requestUrl : ''
        const method = typeof e.data.method === 'string' ? e.data.method : ''
        const status = typeof e.data.status === 'number' ? e.data.status : 0
        const kindInfo = kind ? `\n类型: ${kind}` : ''
        const requestInfo = requestUrl || method || status
          ? `\n请求: ${method ? `${method} ` : ''}${requestUrl || '[unknown]'}${status ? ` (${status})` : ''}`
          : ''
        const location = src ? `\n来源: ${src}${line ? `:${line}` : ''}${col ? `:${col}` : ''}` : ''
        useMapStore.getState().setExecError(`${e.data.message || '执行错误'}${kindInfo}${requestInfo}${location}`)
        useMapStore.getState().setVisualChecking(false)
        visualInFlightRef.current = false
        setShowError(true)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // 错误出现时自动触发修复（延迟 1.5s，避免瞬间错误）
  useEffect(() => {
    if (fixTimerRef.current) {
      clearTimeout(fixTimerRef.current)
      fixTimerRef.current = null
    }

    if (previewing) {
      return () => {
        if (fixTimerRef.current) {
          clearTimeout(fixTimerRef.current)
          fixTimerRef.current = null
        }
      }
    }

    if (execError) {
      setShowError(true)
      if (!fixing && fixRetryCount < MAX_FIX_RETRIES) {
        fixTimerRef.current = setTimeout(() => {
          useChatStore.getState().autoFixMapError()
        }, 1500)
      }
    }

    return () => {
      if (fixTimerRef.current) {
        clearTimeout(fixTimerRef.current)
        fixTimerRef.current = null
      }
    }
  }, [execError, fixing, fixRetryCount, previewing])

  // 渲染稳定后先在前端后台缓存一份缩略图，分享时直接复用，不再点击后临时抓图
  useEffect(() => {
    if (thumbnailTimerRef.current) {
      clearTimeout(thumbnailTimerRef.current)
      thumbnailTimerRef.current = null
    }

    if (previewing) return
    if (!currentCode || executing || fixing || execError) return
    if (useMapStore.getState().shareThumbnailBase64) return

    thumbnailTimerRef.current = setTimeout(async () => {
      const state = useMapStore.getState()
      if (state.previewCode && state.codeStreaming) return
      if (!state.currentCode || state.executing || state.fixing || state.execError) return
      if (state.shareThumbnailBase64 || thumbnailInFlightRef.current) return

      thumbnailInFlightRef.current = true
      try {
        const captured = await captureIframeScreenshot(iframeRef.current)
        useMapStore.getState().setShareThumbnailBase64(captured.imageBase64)
      } catch (err: any) {
        console.warn('[MapPreview] 分享缩略图后台缓存失败，本次分享将退回 SVG 占位图:', err?.message || err)
      } finally {
        thumbnailInFlightRef.current = false
      }
    }, THUMBNAIL_CACHE_DELAY_MS)

    return () => {
      if (thumbnailTimerRef.current) {
        clearTimeout(thumbnailTimerRef.current)
        thumbnailTimerRef.current = null
      }
    }
  }, [currentCode, execError, executing, fixing, iframeRef, previewing])

  // 渲染稳定后自动触发视觉巡检
  useEffect(() => {
    if (visualTimerRef.current) {
      clearTimeout(visualTimerRef.current)
      visualTimerRef.current = null
    }

    if (previewing) return
    if (!currentCode || executing || fixing || execError) return
    if (visualFixRetryCount >= MAX_VISUAL_FIX_RETRIES) return

    const codeHash = hashCode(currentCode)
    if (lastVisualCheckedCodeHash === codeHash) return

    visualTimerRef.current = setTimeout(async () => {
      const state = useMapStore.getState()
      if (state.previewCode && state.codeStreaming) return
      if (!state.currentCode || state.executing || state.fixing || state.execError) return
      if (visualInFlightRef.current) return

      visualInFlightRef.current = true
      useMapStore.setState({ visualChecking: true, lastVisualCheckedCodeHash: codeHash })

      try {
        const messages = useChatStore.getState().messages
        const latestUser = [...messages].reverse().find((m) => m.role === 'user')
        const hint = latestUser?.content?.trim() || ''
        const runId = `${Date.now()}-${codeHash.slice(0, 8)}`
        let imageBase64: string
        let captureMeta:
          | {
              mode: 'dom' | 'canvas'
              canvasCount: number
              largestCanvasArea: number
              canvasReadable: boolean
              canvasTainted: boolean
            }
          | undefined
        try {
          const captured = await captureIframeScreenshot(iframeRef.current)
          imageBase64 = captured.imageBase64
          useMapStore.getState().setShareThumbnailBase64(captured.imageBase64)
          captureMeta = {
            mode: captured.mode,
            canvasCount: captured.canvasCount,
            largestCanvasArea: captured.largestCanvasArea,
            canvasReadable: captured.canvasReadable,
            canvasTainted: captured.canvasTainted,
          }
        } catch (captureErr: any) {
          useMapStore.getState().setShareThumbnailBase64(null)
          useChatStore.getState().addAssistantMessage([
            '视觉巡检结果：不可用',
            `诊断：前端截图采样失败（${captureErr?.message || '未知原因'}）。`,
            '本轮不会触发自动补修。',
          ].join('\n'))
          return
        }
        const result = await visualQaApi.inspect({
          imageBase64,
          code: state.currentCode,
          captureMeta,
          hint,
          runId,
        })

        const latestState = useMapStore.getState()
        if (latestState.execError || latestState.executing) return

        if (result.status === 'unavailable') {
          useChatStore.getState().addAssistantMessage([
            '视觉巡检结果：不可用',
            `诊断：${result.diagnosis}`,
            '本轮不会触发自动补修。',
          ].join('\n'))
          return
        }

        if (!result.anomalous) {
          useChatStore.getState().addAssistantMessage([
            '视觉巡检结果：通过',
            `结论：${result.summary}`,
            `说明：${result.diagnosis}`,
            `结论把握度：${Math.round((result.confidence || 0) * 100)}%`,
          ].join('\n'))
          return
        }

        if (!result.shouldRepair) {
          useChatStore.getState().addAssistantMessage([
            `视觉巡检结果：发现异常（${result.severity}）`,
            `结论：${result.summary}`,
            `诊断：${result.diagnosis}`,
            'AI 判定当前无需触发自动补修。',
          ].join('\n'))
          return
        }

        useChatStore.getState().addAssistantMessage([
          `视觉巡检结果：发现异常（${result.severity}）`,
          `结论：${result.summary}`,
          `诊断：${result.diagnosis}`,
          'AI 判定需要自动补修，系统将触发视觉回灌补修。',
        ].join('\n'))

        const retryState = useMapStore.getState()
        if (retryState.visualFixRetryCount >= MAX_VISUAL_FIX_RETRIES) {
          useChatStore.getState().addAssistantMessage(`视觉自动补修已达到上限（${MAX_VISUAL_FIX_RETRIES} 轮），本次不再继续。`)
          return
        }

        const repairError = [
          `[视觉巡检异常] 严重级别: ${result.severity}`,
          `结论: ${result.summary}`,
          `诊断: ${result.diagnosis}`,
          `修复建议: ${result.repairHint}`,
        ].join('\n')

        await useChatStore.getState().autoFixMapError({
          source: 'visual',
          overrideError: repairError,
          userInputHint: '请根据视觉巡检结果做最小改动修复，优先修复渲染异常并保持现有布局与功能。',
        })
      } catch (err: any) {
        useChatStore.getState().addAssistantMessage(`视觉巡检执行失败：${err?.message || '未知错误'}`)
      } finally {
        useMapStore.getState().setVisualChecking(false)
        visualInFlightRef.current = false
      }
    }, VISUAL_STABLE_DELAY_MS)

    return () => {
      if (visualTimerRef.current) {
        clearTimeout(visualTimerRef.current)
        visualTimerRef.current = null
      }
    }
  }, [
    currentCode,
    previewing,
    executing,
    fixing,
    execError,
    lastVisualCheckedCodeHash,
    visualFixRetryCount,
  ])

  useEffect(() => {
    return () => {
      if (visualTimerRef.current) {
        clearTimeout(visualTimerRef.current)
        visualTimerRef.current = null
      }
    }
  }, [])

  const retriesExhausted = !fixing && execError && fixRetryCount >= MAX_FIX_RETRIES
  const fixingAttempt = fixingSource === 'visual' ? visualFixRetryCount + 1 : fixRetryCount + 1
  const fixingMax = fixingSource === 'visual' ? MAX_VISUAL_FIX_RETRIES : MAX_FIX_RETRIES

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* iframe — 始终可见（默认地图或用户代码） */}
      <iframe
        ref={iframeRef}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin"
        title="地图预览"
      />

      {/* 渲染中指示器 */}
      {executing && (
        <div className="absolute top-3 right-3 animate-fade-in">
          <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md shadow-lg shadow-black/5 border border-gray-200/60 text-blue-600 text-xs font-medium px-3 py-2 rounded-xl soft-surface">
            <div className="w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            渲染地图中...
          </div>
        </div>
      )}

      {/* 视觉巡检阻塞层（按方案要求前台阻塞） */}
      {visualChecking && !fixing && (
        <div className="visual-inspect-overlay absolute inset-0 z-[9] pointer-events-auto">
          <div className="visual-inspect-haze" />

          <div className="visual-inspect-grid visual-inspect-grid-ne" />
          <div className="visual-inspect-grid visual-inspect-grid-nw" />
          <div className="visual-inspect-grid visual-inspect-grid-se" />
          <div className="visual-inspect-grid visual-inspect-grid-sw" />

          <div className="visual-inspect-glow visual-inspect-glow-ne" />
          <div className="visual-inspect-glow visual-inspect-glow-nw" />
          <div className="visual-inspect-glow visual-inspect-glow-se" />
          <div className="visual-inspect-glow visual-inspect-glow-sw" />

          <div className="visual-inspect-scanline" />

          <div className="visual-inspect-center">
            <div className="visual-inspect-chip">
              <div className="visual-inspect-chip-title">AI视觉巡检中</div>
              <div className="visual-inspect-chip-subtitle">正在采样地图画面并进行一致性分析</div>
              <div className="visual-inspect-progress" />
            </div>
          </div>
        </div>
      )}

      {/* 自动修复中指示器 */}
      {fixing && (
        <div className="absolute top-3 right-3 animate-fade-in z-10">
          <div className="flex items-center gap-2 bg-amber-50/95 backdrop-blur-md shadow-lg shadow-amber-500/10 border border-amber-200/60 text-amber-700 text-xs font-medium px-3 py-2 rounded-xl soft-surface">
            <div className="w-3.5 h-3.5 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
            {fixingSource === 'visual' ? '正在视觉回灌补修' : '正在自动修复'} ({fixingAttempt}/{fixingMax})...
          </div>
        </div>
      )}

      {/* 视觉巡检中指示器（前台阻塞） */}
      {visualChecking && !fixing && (
        <div className="absolute top-3 right-3 animate-fade-in z-10">
          <div className="flex items-center gap-2 bg-slate-950/70 backdrop-blur-xl shadow-lg shadow-indigo-900/30 border border-indigo-300/20 text-indigo-100 text-xs font-medium px-3 py-2 rounded-xl soft-surface">
            <div className="w-3.5 h-3.5 border-2 border-violet-200 border-t-violet-500 rounded-full animate-spin" />
            正在进行AI视觉巡检...
          </div>
        </div>
      )}

      {/* 错误提示 — 修复中时隐藏 */}
      {execError && showError && !fixing && (
        <div className="absolute bottom-3 left-3 right-3 animate-slide-up">
          <div className={`backdrop-blur-md border px-4 py-3 rounded-xl shadow-lg flex items-start gap-3 ${
            retriesExhausted
              ? 'bg-orange-50/95 border-orange-200/60 text-orange-600 shadow-orange-500/5'
              : 'bg-red-50/95 border-red-200/60 text-red-600 shadow-red-500/5'
          } soft-surface`}>
            <svg className={`w-4 h-4 mt-0.5 shrink-0 ${retriesExhausted ? 'text-orange-400' : 'text-red-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium mb-0.5 ${retriesExhausted ? 'text-orange-700' : 'text-red-700'}`}>
                {retriesExhausted ? '自动修复未能解决此错误' : '执行错误'}
              </p>
              <p className={`text-[11px] leading-relaxed break-all ${retriesExhausted ? 'text-orange-500' : 'text-red-500'}`}>
                {execError}
              </p>
              {retriesExhausted && (
                <p className="text-[11px] text-orange-400 mt-1">
                  已尝试 {MAX_FIX_RETRIES} 次修复，请尝试在对话中描述问题以获取帮助
                </p>
              )}
            </div>
            <button
              onClick={() => setShowError(false)}
              className={`${retriesExhausted ? 'text-orange-300 hover:text-orange-500' : 'text-red-300 hover:text-red-500'} soft-pop shrink-0 p-0.5`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
