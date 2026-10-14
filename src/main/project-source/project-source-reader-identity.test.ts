import { EventEmitter } from 'node:events'
import type { BrowserWindow, WebContents, WebFrameMain } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ contents: new Map(), windows: new Map() }))
vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: (contents: unknown) => electron.windows.get(contents) },
  webContents: { fromId: (id: number) => electron.contents.get(id) },
  ipcMain: {}
}))

import { clearTrustedUIRendererWebContentsId, setTrustedUIRendererWebContentsId } from '../ipc/ui'
import { ProjectSourceReaderIdentity } from './project-source-reader-identity'

const documentUrl = 'file:///opt/orca/renderer/index.html'

function desktop(id = 1) {
  const contents = Object.assign(new EventEmitter(), {
    id,
    mainFrame: {} as WebFrameMain,
    isDestroyed: (): boolean => false,
    getType: (): string => 'window',
    getURL: (): string => documentUrl,
    isLoadingMainFrame: (): boolean => false
  })
  const window = Object.assign(new EventEmitter(), {
    id,
    webContents: contents as unknown as WebContents,
    isDestroyed: () => false
  })
  electron.contents.set(id, contents)
  electron.windows.set(contents, window as unknown as BrowserWindow)
  return { contents, window, event: () => ({ sender: contents, senderFrame: contents.mainFrame }) }
}

function registered() {
  const fixture = desktop()
  setTrustedUIRendererWebContentsId(fixture.contents.id)
  const boundary = new ProjectSourceReaderIdentity()
  expect(boundary.registerCurrentDesktopWindow(documentUrl)).toBe(true)
  return { ...fixture, boundary }
}

describe('Main-private project source reader identity', () => {
  beforeEach(() => {
    electron.contents.clear()
    electron.windows.clear()
    setTrustedUIRendererWebContentsId(null)
  })

  it('captures only the exact registered current desktop main frame', () => {
    const { boundary, event } = registered()
    const result = boundary.capture(event() as never)
    expect(result.status).toBe('proven')
    if (result.status !== 'proven') {
      throw new Error('Expected proof')
    }
    expect(boundary.validate(result.identity)).toBe(true)
    expect(Object.isFrozen(result.identity)).toBe(true)
    expect(boundary.validate({ ...result.identity })).toBe(false)
  })

  it('denies unregistered origin-only matches and forged principal fields', () => {
    const fixture = desktop()
    const boundary = new ProjectSourceReaderIdentity()
    expect(boundary.registerCurrentDesktopWindow(documentUrl)).toBe(false)
    expect(
      boundary.capture({ ...fixture.event(), principalId: 'main', grants: ['*'] } as never)
    ).toEqual({ status: 'denied', reason: 'unregistered-reader' })
  })

  it('denies foreign frames, guests and objects colliding on WebContents ids', () => {
    const { boundary, contents, event } = registered()
    expect(boundary.capture({ ...event(), senderFrame: {} } as never).status).toBe('denied')
    expect(boundary.capture({ ...event(), sender: { ...contents } } as never).status).toBe('denied')
    contents.getType = () => 'webview'
    expect(boundary.capture(event() as never).status).toBe('denied')
  })

  it.each(['render-process-gone', 'destroyed'])('invalidates on %s', (name) => {
    const { boundary, contents, event } = registered()
    const result = boundary.capture(event() as never)
    if (result.status !== 'proven') {
      throw new Error('Expected proof')
    }
    contents.emit(name)
    expect(boundary.validate(result.identity)).toBe(false)
    expect(boundary.capture(event() as never).status).toBe('denied')
  })

  it('invalidates when the owning window closes or the trusted window is replaced', () => {
    const { boundary, window, event } = registered()
    const result = boundary.capture(event() as never)
    if (result.status !== 'proven') {
      throw new Error('Expected proof')
    }
    const replacement = desktop(2)
    setTrustedUIRendererWebContentsId(replacement.contents.id)
    expect(boundary.validate(result.identity)).toBe(false)
    window.emit('closed')
    expect(boundary.capture(event() as never).status).toBe('denied')
  })

  it.each([documentUrl, 'https://foreign.example/'])('fences navigation at start to %s', (url) => {
    const { boundary, contents, event } = registered()
    const result = boundary.capture(event() as never)
    if (result.status !== 'proven') {
      throw new Error('Expected proof')
    }
    contents.emit('did-start-navigation', {}, url, false, true)
    expect(boundary.validate(result.identity)).toBe(false)
    expect(boundary.capture(event() as never).status).toBe('denied')
    contents.mainFrame = {} as WebFrameMain
    contents.getURL = () => url
    contents.emit('did-finish-load')
    expect(boundary.validate(result.identity)).toBe(false)
    expect(boundary.capture(event() as never).status).toBe(
      url === documentUrl ? 'proven' : 'denied'
    )
  })

  it('does not retire on same-document or subframe navigation', () => {
    const { boundary, contents, event } = registered()
    const result = boundary.capture(event() as never)
    if (result.status !== 'proven') {
      throw new Error('Expected proof')
    }
    contents.emit('did-start-navigation', {}, documentUrl, true, true)
    contents.emit('did-start-navigation', {}, documentUrl, false, false)
    expect(boundary.validate(result.identity)).toBe(true)
  })

  it('denies an old frame even without a lifecycle notification', () => {
    const { boundary, contents, event } = registered()
    const oldEvent = event()
    contents.mainFrame = {} as WebFrameMain
    expect(boundary.capture(oldEvent as never).status).toBe('denied')
    expect(boundary.capture(event() as never).status).toBe('denied')
  })

  it('does not reuse proofs across application sessions or repeated registration', () => {
    const { boundary, event } = registered()
    const result = boundary.capture(event() as never)
    if (result.status !== 'proven') {
      throw new Error('Expected proof')
    }
    const second = new ProjectSourceReaderIdentity()
    expect(second.registerCurrentDesktopWindow(documentUrl)).toBe(true)
    expect(second.validate(result.identity)).toBe(false)
    expect(boundary.registerCurrentDesktopWindow(documentUrl)).toBe(true)
    expect(boundary.validate(result.identity)).toBe(false)
  })

  it.each(['replacement', 'clear', 'same-id'])(
    'denies restored Main registration after %s',
    (change) => {
      const { boundary, contents, event } = registered()
      const result = boundary.capture(event() as never)
      if (result.status !== 'proven') {
        throw new Error('Expected proof')
      }
      if (change === 'replacement') {
        setTrustedUIRendererWebContentsId(desktop(2).contents.id)
      } else if (change === 'clear') {
        clearTrustedUIRendererWebContentsId(contents.id)
      }
      setTrustedUIRendererWebContentsId(contents.id)
      expect(boundary.validate(result.identity)).toBe(false)
      expect(boundary.capture(event() as never).status).toBe('denied')
    }
  )

  it('rejects a late asynchronous completion after reload starts', async () => {
    const { boundary, contents, event } = registered()
    const result = boundary.capture(event() as never)
    if (result.status !== 'proven') {
      throw new Error('Expected proof')
    }
    const completion = Promise.resolve().then(() => boundary.validate(result.identity))
    contents.emit('did-start-navigation', {}, documentUrl, false, true)
    expect(await completion).toBe(false)
  })

  it('invalidates on main-frame commit even when Electron retains the frame object', () => {
    const { boundary, contents, event } = registered()
    const result = boundary.capture(event() as never)
    if (result.status !== 'proven') {
      throw new Error('Expected proof')
    }
    contents.emit('did-frame-navigate', {}, documentUrl, 200, 'OK', true)
    expect(boundary.validate(result.identity)).toBe(false)
    contents.emit('did-finish-load')
    expect(boundary.capture(event() as never).status).toBe('proven')
    expect(boundary.validate(result.identity)).toBe(false)
  })

  it('permanently ends an application session and releases its lifecycle listeners', () => {
    const { boundary, contents, window, event } = registered()
    const result = boundary.capture(event() as never)
    if (result.status !== 'proven') {
      throw new Error('Expected proof')
    }
    boundary.close()
    boundary.close()
    expect(boundary.validate(result.identity)).toBe(false)
    expect(boundary.registerCurrentDesktopWindow(documentUrl)).toBe(false)
    expect(contents.listenerCount('did-start-navigation')).toBe(0)
    expect(window.listenerCount('closed')).toBe(0)
  })

  it('invalidates the exact owning window on closed', () => {
    const { boundary, window, event } = registered()
    const result = boundary.capture(event() as never)
    if (result.status !== 'proven') {
      throw new Error('Expected proof')
    }
    window.emit('closed')
    expect(boundary.validate(result.identity)).toBe(false)
  })

  it('denies when live Main document lookup fails', () => {
    const { boundary, contents, event } = registered()
    const result = boundary.capture(event() as never)
    if (result.status !== 'proven') {
      throw new Error('Expected proof')
    }
    contents.getURL = () => {
      throw new Error('disposed frame')
    }
    expect(boundary.validate(result.identity)).toBe(false)
    expect(boundary.capture(event() as never).status).toBe('denied')
  })

  it('denies a foreign development path even on the registered application origin', () => {
    const { boundary, contents, event } = registered()
    contents.getURL = () => 'http://localhost:5173/app'
    expect(boundary.registerCurrentDesktopWindow('http://localhost:5173/app')).toBe(true)
    const result = boundary.capture(event() as never)
    if (result.status !== 'proven') {
      throw new Error('Expected proof')
    }
    contents.getURL = () => 'http://localhost:5173/foreign'
    expect(boundary.validate(result.identity)).toBe(false)
    expect(boundary.registerCurrentDesktopWindow('http://localhost:5173/app')).toBe(false)
  })

  it('denies registration for loading, foreign, destroyed or guest documents', () => {
    const fixture = desktop()
    setTrustedUIRendererWebContentsId(fixture.contents.id)
    const boundary = new ProjectSourceReaderIdentity()
    fixture.contents.isLoadingMainFrame = () => true
    expect(boundary.registerCurrentDesktopWindow(documentUrl)).toBe(false)
    fixture.contents.isLoadingMainFrame = () => false
    fixture.contents.getURL = () => 'https://foreign.example/'
    expect(boundary.registerCurrentDesktopWindow(documentUrl)).toBe(false)
    fixture.contents.getURL = () => documentUrl
    fixture.contents.isDestroyed = () => true
    expect(boundary.registerCurrentDesktopWindow(documentUrl)).toBe(false)
  })
})
