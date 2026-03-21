type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null
  mozFullScreenElement?: Element | null
  msFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  mozCancelFullScreen?: () => Promise<void> | void
  msExitFullscreen?: () => Promise<void> | void
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
  mozRequestFullScreen?: () => Promise<void> | void
  msRequestFullscreen?: () => Promise<void> | void
}

export function hasActiveFullscreen(doc: Document = document): boolean {
  const fullscreenDoc = doc as FullscreenDoc
  return Boolean(
    fullscreenDoc.fullscreenElement
    || fullscreenDoc.webkitFullscreenElement
    || fullscreenDoc.mozFullScreenElement
    || fullscreenDoc.msFullscreenElement,
  )
}

export async function requestElementFullscreen(element: HTMLElement | null): Promise<void> {
  if (!element) return
  const target = element as FullscreenElement
  if (typeof target.requestFullscreen === 'function') {
    await target.requestFullscreen()
    return
  }
  if (typeof target.webkitRequestFullscreen === 'function') {
    await target.webkitRequestFullscreen()
    return
  }
  if (typeof target.mozRequestFullScreen === 'function') {
    await target.mozRequestFullScreen()
    return
  }
  if (typeof target.msRequestFullscreen === 'function') {
    await target.msRequestFullscreen()
  }
}

export async function exitDocumentFullscreen(doc: Document = document): Promise<void> {
  const fullscreenDoc = doc as FullscreenDoc
  if (typeof fullscreenDoc.exitFullscreen === 'function') {
    await fullscreenDoc.exitFullscreen()
    return
  }
  if (typeof fullscreenDoc.webkitExitFullscreen === 'function') {
    await fullscreenDoc.webkitExitFullscreen()
    return
  }
  if (typeof fullscreenDoc.mozCancelFullScreen === 'function') {
    await fullscreenDoc.mozCancelFullScreen()
    return
  }
  if (typeof fullscreenDoc.msExitFullscreen === 'function') {
    await fullscreenDoc.msExitFullscreen()
  }
}
