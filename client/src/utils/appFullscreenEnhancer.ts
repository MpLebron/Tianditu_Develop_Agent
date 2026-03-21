const FULLSCREEN_STYLE_ID = 'codex-app-fullscreen-style'
const FULLSCREEN_BUTTON_ID = 'codex-app-fullscreen-button'
const FULLSCREEN_FLAG = 'codexFullscreenEnhanced'

interface AppFullscreenEnhancerOptions {
  showButton?: boolean
}

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null
  mozFullScreenElement?: Element | null
  msFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  mozCancelFullScreen?: () => Promise<void> | void
  msExitFullscreen?: () => Promise<void> | void
}

type FullscreenEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
  mozRequestFullScreen?: () => Promise<void> | void
  msRequestFullscreen?: () => Promise<void> | void
}

function getVisibleRect(el: Element | null): DOMRect | null {
  if (!(el instanceof HTMLElement)) return null
  const rect = el.getBoundingClientRect()
  if (!rect || rect.width < 120 || rect.height < 120) return null
  return rect
}

function pickMapHost(doc: Document): HTMLElement | null {
  const selectors = [
    '#map',
    '#map-container',
    '.map-container',
    '.map',
    '[id="map"]',
    '[id*="map"]',
    '[class*="map-container"]',
    '[class*="map-view"]',
  ]

  let best: HTMLElement | null = null
  let bestArea = 0

  for (const selector of selectors) {
    const nodes = Array.from(doc.querySelectorAll(selector))
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue
      const rect = getVisibleRect(node)
      if (!rect) continue
      const area = rect.width * rect.height
      if (area > bestArea) {
        best = node
        bestArea = area
      }
    }
  }

  if (best) return best

  const canvases = Array.from(doc.querySelectorAll('canvas'))
  for (const canvas of canvases) {
    const parent = canvas.parentElement
    if (!parent) continue
    const rect = getVisibleRect(parent)
    if (!rect) continue
    const area = rect.width * rect.height
    if (area > bestArea) {
      best = parent
      bestArea = area
    }
  }

  return best
}

function getEnterIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 3 3 3 3 9"></polyline>
      <line x1="3" y1="3" x2="10" y2="10"></line>
      <polyline points="15 3 21 3 21 9"></polyline>
      <line x1="21" y1="3" x2="14" y2="10"></line>
      <polyline points="21 15 21 21 15 21"></polyline>
      <line x1="21" y1="21" x2="14" y2="14"></line>
      <polyline points="9 21 3 21 3 15"></polyline>
      <line x1="3" y1="21" x2="10" y2="14"></line>
    </svg>
  `
}

function getExitIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 3 21 3 21 9"></polyline>
      <line x1="14" y1="10" x2="21" y2="3"></line>
      <polyline points="9 3 3 3 3 9"></polyline>
      <line x1="10" y1="10" x2="3" y2="3"></line>
      <polyline points="15 21 21 21 21 15"></polyline>
      <line x1="14" y1="14" x2="21" y2="21"></line>
      <polyline points="9 21 3 21 3 15"></polyline>
      <line x1="10" y1="14" x2="3" y2="21"></line>
    </svg>
  `
}

function isFullscreen(doc: FullscreenDoc) {
  return Boolean(
    doc.fullscreenElement
    || doc.webkitFullscreenElement
    || doc.mozFullScreenElement
    || doc.msFullscreenElement,
  )
}

function ensureStyle(doc: Document) {
  if (doc.getElementById(FULLSCREEN_STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = FULLSCREEN_STYLE_ID
  style.textContent = `
    .tmapgl-ctrl-fullscreen,
    .mapboxgl-ctrl-fullscreen,
    .maplibregl-ctrl-fullscreen {
      display: none !important;
    }

    #${FULLSCREEN_BUTTON_ID} {
      position: fixed;
      z-index: 2147483000;
      width: 48px;
      height: 48px;
      border: 1px solid rgba(15, 23, 42, 0.12);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.96);
      color: #334155;
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      backdrop-filter: blur(10px);
      transition: transform 0.18s ease, box-shadow 0.18s ease, color 0.18s ease;
    }

    #${FULLSCREEN_BUTTON_ID}:hover {
      color: #0f172a;
      transform: translateY(-1px);
      box-shadow: 0 14px 34px rgba(15, 23, 42, 0.2);
    }

    #${FULLSCREEN_BUTTON_ID}:focus-visible {
      outline: 2px solid rgba(37, 99, 235, 0.42);
      outline-offset: 2px;
    }

    #${FULLSCREEN_BUTTON_ID} svg {
      width: 22px;
      height: 22px;
      pointer-events: none;
    }
  `
  ;(doc.head || doc.documentElement).appendChild(style)
}

function ensureButton(doc: Document, onToggle: () => void) {
  let button = doc.getElementById(FULLSCREEN_BUTTON_ID) as HTMLButtonElement | null
  if (button) return button

  button = doc.createElement('button')
  button.id = FULLSCREEN_BUTTON_ID
  button.type = 'button'
  button.innerHTML = getEnterIcon()
  button.setAttribute('aria-label', '全屏显示')
  button.title = '全屏显示'
  button.addEventListener('click', onToggle)
  ;(doc.body || doc.documentElement).appendChild(button)
  return button
}

function hideEmptyFullscreenGroups(doc: Document) {
  const selectors = [
    '.tmapgl-ctrl-group',
    '.mapboxgl-ctrl-group',
    '.maplibregl-ctrl-group',
  ]
  for (const selector of selectors) {
    const groups = Array.from(doc.querySelectorAll(selector))
    for (const group of groups) {
      if (!(group instanceof HTMLElement)) continue
      const visibleChildren = Array.from(group.children).filter((child) => {
        if (!(child instanceof HTMLElement)) return false
        const style = child.style.display || ''
        if (style === 'none') return false
        return child.offsetWidth > 0 || child.offsetHeight > 0
      })
      if (!visibleChildren.length) {
        group.style.display = 'none'
      } else if (group.style.display === 'none') {
        group.style.display = ''
      }
    }
  }
}

export function installAppFullscreenEnhancer(
  targetDoc: Document | null | undefined,
  options: AppFullscreenEnhancerOptions = {},
): () => void {
  const doc = targetDoc as FullscreenDoc | null | undefined
  if (!doc?.documentElement || !doc.defaultView) return () => {}
  const root = doc.documentElement as FullscreenEl
  if ((root as HTMLElement).dataset[FULLSCREEN_FLAG] === '1') return () => {}
  ;(root as HTMLElement).dataset[FULLSCREEN_FLAG] = '1'
  const showButton = options.showButton !== false

  ensureStyle(doc)

  const requestFullscreen = async () => {
    if (typeof root.requestFullscreen === 'function') {
      await root.requestFullscreen()
      return
    }
    if (typeof root.webkitRequestFullscreen === 'function') {
      await root.webkitRequestFullscreen()
      return
    }
    if (typeof root.mozRequestFullScreen === 'function') {
      await root.mozRequestFullScreen()
      return
    }
    if (typeof root.msRequestFullscreen === 'function') {
      await root.msRequestFullscreen()
    }
  }

  const exitFullscreen = async () => {
    if (typeof doc.exitFullscreen === 'function') {
      await doc.exitFullscreen()
      return
    }
    if (typeof doc.webkitExitFullscreen === 'function') {
      await doc.webkitExitFullscreen()
      return
    }
    if (typeof doc.mozCancelFullScreen === 'function') {
      await doc.mozCancelFullScreen()
      return
    }
    if (typeof doc.msExitFullscreen === 'function') {
      await doc.msExitFullscreen()
    }
  }

  const toggleFullscreen = () => {
    void (isFullscreen(doc) ? exitFullscreen() : requestFullscreen())
  }

  const button = showButton ? ensureButton(doc, toggleFullscreen) : null

  const positionButton = () => {
    if (!button) return
    const mapHost = pickMapHost(doc)
    if (mapHost) {
      const rect = mapHost.getBoundingClientRect()
      const maxTop = Math.max(12, (win.innerHeight || 0) - 60)
      const maxLeft = Math.max(12, (win.innerWidth || 0) - 60)
      const top = Math.min(Math.max(12, Math.round(rect.top) + 16), maxTop)
      const left = Math.min(Math.max(12, Math.round(rect.right) - 64), maxLeft)
      button.style.top = `${top}px`
      button.style.left = `${left}px`
      button.style.right = 'auto'
    } else {
      button.style.top = '16px'
      button.style.right = '16px'
      button.style.left = 'auto'
    }
  }

  const updateButtonState = () => {
    hideEmptyFullscreenGroups(doc)
    if (!button) return
    const active = isFullscreen(doc)
    button.innerHTML = active ? getExitIcon() : getEnterIcon()
    button.setAttribute('aria-label', active ? '退出全屏' : '全屏显示')
    button.title = active ? '退出全屏' : '全屏显示'
    positionButton()
  }

  const win = doc.defaultView
  const eventNames = [
    'fullscreenchange',
    'webkitfullscreenchange',
    'mozfullscreenchange',
    'MSFullscreenChange',
  ]
  for (const name of eventNames) {
    doc.addEventListener(name, updateButtonState)
  }
  win.addEventListener('resize', updateButtonState)
  if (button) {
    win.addEventListener('scroll', positionButton, { passive: true })
  }

  const observer = new MutationObserver(() => {
    hideEmptyFullscreenGroups(doc)
    positionButton()
  })

  if (doc.body) {
    observer.observe(doc.body, { subtree: true, childList: true, attributes: true })
  }

  hideEmptyFullscreenGroups(doc)
  if (button) {
    positionButton()
  }
  updateButtonState()

  return () => {
    for (const name of eventNames) {
      doc.removeEventListener(name, updateButtonState)
    }
    win.removeEventListener('resize', updateButtonState)
    if (button) {
      win.removeEventListener('scroll', positionButton)
    }
    observer.disconnect()
    button?.remove()
    doc.getElementById(FULLSCREEN_STYLE_ID)?.remove()
    delete (root as HTMLElement).dataset[FULLSCREEN_FLAG]
  }
}
