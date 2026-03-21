import type { ReactNode } from 'react'

interface ViewportModeControlsProps {
  pageFilled: boolean
  fullscreenActive: boolean
  onTogglePageFill: () => void
  onToggleFullscreen: () => void
  className?: string
}

function PageFillIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  )
}

function ExitPageFillIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </svg>
  )
}

function EnterFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 3 3 3 3 9" />
      <line x1="3" y1="3" x2="10" y2="10" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <polyline points="21 15 21 21 15 21" />
      <line x1="21" y1="21" x2="14" y2="14" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}

function ExitFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 9 21 9 21 3" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <polyline points="9 9 3 9 3 3" />
      <line x1="10" y1="10" x2="3" y2="3" />
      <polyline points="15 15 21 15 21 21" />
      <line x1="14" y1="14" x2="21" y2="21" />
      <polyline points="9 15 3 15 3 21" />
      <line x1="10" y1="14" x2="3" y2="21" />
    </svg>
  )
}

function ControlButton(props: {
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      onClick={props.onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200/80 bg-white/96 text-slate-600 shadow-lg shadow-slate-900/10 backdrop-blur-md transition hover:-translate-y-0.5 hover:text-slate-900 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
    >
      <span className="pointer-events-none h-5 w-5">
        {props.children}
      </span>
    </button>
  )
}

export function ViewportModeControls(props: ViewportModeControlsProps) {
  return (
    <div className={props.className || ''}>
      <div className="flex flex-col gap-2 rounded-2xl border border-white/60 bg-white/55 p-2 shadow-xl shadow-slate-900/10 backdrop-blur-xl">
        <ControlButton
          title={props.pageFilled ? '退出网页全屏' : '网页全屏'}
          onClick={props.onTogglePageFill}
        >
          {props.pageFilled ? <ExitPageFillIcon /> : <PageFillIcon />}
        </ControlButton>

        <ControlButton
          title={props.fullscreenActive ? '退出全屏' : '全屏'}
          onClick={props.onToggleFullscreen}
        >
          {props.fullscreenActive ? <ExitFullscreenIcon /> : <EnterFullscreenIcon />}
        </ControlButton>
      </div>
    </div>
  )
}
