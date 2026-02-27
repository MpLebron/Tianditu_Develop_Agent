import { useEffect, useRef, useState } from 'react'
import { useMapStore } from '../../stores/useMapStore'
import { useChatStore } from '../../stores/useChatStore'
import { useCodeRunner } from '../../hooks/useCodeRunner'

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
<script src="https://api.tianditu.gov.cn/api/v5/js?tk=4043dde46add842282bacc412299311d"></script>
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

export function MapPreview() {
  const { currentCode, executing, execError, fixing, fixRetryCount } = useMapStore()
  const { iframeRef, run } = useCodeRunner()
  const [showError, setShowError] = useState(true)
  const fixTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const defaultLoaded = useRef(false)

  // 加载默认地图或用户代码
  useEffect(() => {
    if (currentCode) {
      run(currentCode)
      defaultLoaded.current = false
    } else if (!defaultLoaded.current) {
      // 没有用户代码时显示默认地图（同样注入错误捕获脚本）
      run(DEFAULT_MAP_HTML)
      defaultLoaded.current = true
    }
  }, [currentCode, run, iframeRef])

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
      fixTimerRef.current = undefined
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
      }
    }
  }, [execError, fixing, fixRetryCount])

  const MAX_FIX_RETRIES = 2
  const retriesExhausted = !fixing && execError && fixRetryCount >= MAX_FIX_RETRIES

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
          <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md shadow-lg shadow-black/5 border border-gray-200/60 text-blue-600 text-xs font-medium px-3 py-2 rounded-xl">
            <div className="w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            渲染地图中...
          </div>
        </div>
      )}

      {/* 自动修复中指示器 */}
      {fixing && (
        <div className="absolute top-3 right-3 animate-fade-in z-10">
          <div className="flex items-center gap-2 bg-amber-50/95 backdrop-blur-md shadow-lg shadow-amber-500/10 border border-amber-200/60 text-amber-700 text-xs font-medium px-3 py-2 rounded-xl">
            <div className="w-3.5 h-3.5 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
            正在自动修复 ({fixRetryCount + 1}/{MAX_FIX_RETRIES})...
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
          }`}>
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
              className={`${retriesExhausted ? 'text-orange-300 hover:text-orange-500' : 'text-red-300 hover:text-red-500'} transition shrink-0 p-0.5`}
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
