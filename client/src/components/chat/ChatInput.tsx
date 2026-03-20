import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { JsonPreviewModal } from '../common/JsonPreviewModal'
import { isJsonPreviewableFileName } from '../../utils/jsonPreview'
import { validateJsonLikeFile } from '../../utils/fileValidation'

interface ChatInputProps {
  onSend: (message: string, file?: File, filePreviewText?: string | null) => void
  loading: boolean
  disabled?: boolean
  disabledReason?: string | null
}

export function ChatInput({ onSend, loading, disabled = false, disabledReason = null }: ChatInputProps) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [filePreviewText, setFilePreviewText] = useState<string | null>(null)
  const [filePreviewLoading, setFilePreviewLoading] = useState(false)
  const [filePreviewError, setFilePreviewError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [dragReject, setDragReject] = useState(false)
  const [uploadHint, setUploadHint] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dragDepthRef = useRef(0)
  const previewLoadIdRef = useRef(0)
  const inputLocked = loading || disabled
  const canPreviewCurrentFile = !!file && isJsonPreviewableFileName(file.name)

  const isSupportedFile = (candidate: File) => {
    const name = candidate.name.toLowerCase()
    return ['.csv', '.xlsx', '.xls', '.json', '.geojson'].some((ext) => name.endsWith(ext))
  }

  const attachFile = async (candidate: File | null | undefined) => {
    if (inputLocked) return
    if (!candidate) return
    if (!isSupportedFile(candidate)) {
      setUploadHint('仅支持 CSV / Excel / JSON / GeoJSON 文件')
      setDragReject(true)
      return
    }
    const requestId = previewLoadIdRef.current + 1
    previewLoadIdRef.current = requestId

    setFilePreviewText(null)
    setFilePreviewError(null)
    setFilePreviewLoading(false)

    if (!isJsonPreviewableFileName(candidate.name)) {
      setFile(candidate)
      setUploadHint(`已附加文件：${candidate.name}`)
      setDragReject(false)
      return
    }

    setFilePreviewLoading(true)
    setUploadHint('正在校验 JSON / GeoJSON 文件...')
    setDragReject(false)

    const validation = await validateJsonLikeFile(candidate)
    if (previewLoadIdRef.current !== requestId) return

    if (!validation.valid) {
      setFile(null)
      setFilePreviewText(null)
      setFilePreviewError(validation.error)
      setFilePreviewLoading(false)
      setUploadHint(validation.error)
      setDragReject(true)
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setFile(candidate)
    setFilePreviewText(validation.previewText)
    setFilePreviewError(null)
    setFilePreviewLoading(false)
    setUploadHint(`已附加文件：${candidate.name}`)
    setDragReject(false)
  }

  const handleSend = () => {
    const msg = text.trim()
    if (!msg || inputLocked) return
    onSend(msg, file || undefined, filePreviewText)
    setText('')
    setFile(null)
    setFilePreviewText(null)
    setFilePreviewError(null)
    setFilePreviewLoading(false)
    setPreviewOpen(false)
    setUploadHint(null)
    setDragActive(false)
    setDragReject(false)
    previewLoadIdRef.current += 1
    if (fileRef.current) fileRef.current.value = ''
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (value: string) => {
    setText(value)
    if (uploadHint) setUploadHint(null)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (inputLocked) return
    dragDepthRef.current += 1

    const hasFiles = Array.from(e.dataTransfer?.items || []).some((item) => item.kind === 'file')
    if (!hasFiles) return

    setDragActive(true)
    setDragReject(false)
    setUploadHint('松开以上传文件')
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (inputLocked) return
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'

    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      const ok = isSupportedFile(files[0])
      setDragActive(true)
      setDragReject(!ok)
      setUploadHint(ok ? '松开以上传文件' : '文件格式不支持，仅支持 CSV / Excel / JSON / GeoJSON')
    }
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (inputLocked) return
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current > 0) return

    setDragActive(false)
    setDragReject(false)
    setUploadHint(file ? `已附加文件：${file.name}` : null)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (inputLocked) return
    dragDepthRef.current = 0

    const dropped = e.dataTransfer?.files?.[0]
    setDragActive(false)
    setDragReject(false)
    void attachFile(dropped)
  }

  return (
    <div className="p-3 bg-white">
      {/* 附件预览 */}
      {file && (
        <div className="flex items-center gap-2 mb-2 mx-1">
          <div className="flex max-w-full items-center gap-2 rounded-2xl border border-slate-200/85 bg-white/92 px-3 py-2 text-[12px] shadow-[0_12px_28px_rgba(15,23,42,0.05)] backdrop-blur-xl soft-surface animate-fade-in">
            {isJsonPreviewableFileName(file.name) ? (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="min-w-0 flex flex-1 items-center gap-3 rounded-xl px-1 py-0.5 text-left text-slate-700 hover:bg-slate-50/85 hover:text-slate-900 soft-pop"
                title="点击预览 JSON 文件"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-500">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </span>
                <span className="min-w-0 flex flex-1 items-center gap-2">
                  <span className="truncate font-medium text-[13px] text-slate-700">{file.name}</span>
                  <span className="shrink-0 text-slate-400">({(file.size / 1024).toFixed(0)}KB)</span>
                </span>
                <span className="ml-auto shrink-0 rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-700">
                  {filePreviewLoading ? '读取中' : '预览'}
                </span>
              </button>
            ) : (
              <div className="min-w-0 flex flex-1 items-center gap-3 px-1 py-0.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </span>
                <span className="min-w-0 flex flex-1 items-center gap-2">
                  <span className="truncate font-medium text-[13px] text-slate-700">{file.name}</span>
                  <span className="shrink-0 text-slate-400">({(file.size / 1024).toFixed(0)}KB)</span>
                </span>
              </div>
            )}
            <button
              onClick={() => {
                setFile(null)
                setFilePreviewText(null)
                setFilePreviewError(null)
                setFilePreviewLoading(false)
                setPreviewOpen(false)
                setUploadHint(null)
                previewLoadIdRef.current += 1
                if (fileRef.current) fileRef.current.value = ''
              }}
              className="ml-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-300 hover:bg-red-50 hover:text-red-400 soft-pop"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 输入框容器 — 支持拖拽上传 */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          'relative rounded-2xl soft-panel',
          dragActive
            ? (dragReject
              ? 'ring-2 ring-red-200 bg-red-50/50'
              : 'ring-2 ring-blue-200 bg-blue-50/50')
            : '',
        ].join(' ')}
      >
        {dragActive && (
          <div
            className={[
              'absolute inset-0 z-10 rounded-2xl border-2 border-dashed pointer-events-none flex items-center justify-center animate-fade-in',
              dragReject ? 'border-red-300 bg-red-50/80' : 'border-blue-300 bg-white/75 backdrop-blur-sm',
            ].join(' ')}
          >
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl border border-white/70 bg-white/80 shadow-lg shadow-black/5 soft-surface">
              <span
                className={[
                  'w-7 h-7 rounded-lg flex items-center justify-center',
                  dragReject ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500',
                ].join(' ')}
              >
                {dragReject ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16V8m0 0l-3 3m3-3l3 3M4 16.5A2.5 2.5 0 006.5 19h11a2.5 2.5 0 002.5-2.5" />
                  </svg>
                )}
              </span>
              <div className="min-w-0">
                <div className={`text-[12px] font-medium ${dragReject ? 'text-red-600' : 'text-blue-700'}`}>
                  {dragReject ? '文件格式不支持' : '拖拽上传文件'}
                </div>
                <div className={`text-[11px] ${dragReject ? 'text-red-400' : 'text-gray-500'}`}>
                  {dragReject ? '仅支持 CSV / Excel / JSON / GeoJSON' : '松开即可附加到当前消息'}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className={[
          'flex items-center min-h-[56px] rounded-[28px] border bg-white/96 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_16px_36px_rgba(15,23,42,0.06)] backdrop-blur-xl soft-panel',
          dragActive
            ? (dragReject
              ? 'border-red-200/90'
              : 'border-sky-200/90')
            : 'border-slate-200/85',
          'focus-within:border-sky-300 focus-within:ring-4 focus-within:ring-sky-100/70',
        ].join(' ')}>
        {/* 附件按钮 */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={inputLocked}
          className="ml-1.5 flex h-10 w-10 items-center justify-center rounded-2xl text-slate-300 hover:bg-slate-50 hover:text-sky-600 soft-pop shrink-0 self-center disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-300"
          title={disabledReason || '上传文件（CSV/Excel/GeoJSON）'}
        >
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
          </svg>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,.json,.geojson"
          className="hidden"
          onChange={(e) => { void attachFile(e.target.files?.[0] || null) }}
        />

        {/* 文本输入 */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={disabledReason || '描述你想要的地图效果...'}
          disabled={inputLocked}
          rows={1}
          className="flex-1 resize-none bg-transparent border-0 text-[13.5px] text-slate-700 placeholder:text-slate-300 py-3 pr-2 focus:outline-none min-h-[44px] max-h-[120px] leading-[1.45] disabled:text-slate-400 disabled:cursor-not-allowed"
          style={{ overflow: 'hidden' }}
        />

        {/* 发送按钮 */}
        <button
          onClick={handleSend}
          disabled={!text.trim() || inputLocked}
          className={[
            'p-2 mr-1.5 shrink-0 rounded-xl soft-pop text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-sm hover:shadow-md hover:shadow-blue-500/20 active:scale-95',
            disabledReason ? 'disabled:opacity-40 disabled:scale-100' : 'disabled:opacity-0 disabled:scale-90',
          ].join(' ')}
          title={disabledReason || '发送'}
        >
          {loading ? (
            <div className="w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
          )}
        </button>
        </div>
      </div>

      {/* 底部提示（仅在有上传状态时显示） */}
      <div className="mt-1.5 px-1 flex items-center gap-2">
        {(uploadHint || dragReject) && (
          canPreviewCurrentFile && uploadHint && !dragReject ? (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="min-w-0 flex-1 truncate text-left text-[11px] text-blue-500 underline decoration-blue-300 underline-offset-2 hover:text-blue-600 soft-pop"
              title="点击预览当前 JSON 文件"
            >
              {uploadHint}
            </button>
          ) : (
            <div className={`min-w-0 flex-1 text-[11px] truncate ${dragReject ? 'text-red-500' : 'text-blue-500'}`}>
              {uploadHint}
            </div>
          )
        )}
      </div>

      <JsonPreviewModal
        open={previewOpen}
        title={file?.name || 'JSON 文件'}
        size={file?.size}
        jsonText={filePreviewText}
        loading={filePreviewLoading}
        error={filePreviewError}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  )
}
