import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSourceWindowDocumentOptions } from './project-source-window-document'

const mocks = vi.hoisted(() => ({ fromWebContents: vi.fn(), isPackaged: true }))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mocks.isPackaged
    }
  },
  BrowserWindow: { fromWebContents: mocks.fromWebContents }
}))

import { verifyProjectSourceWindowDocument } from './project-source-window-document'

const DOCUMENT = 'file:///DevCrew/resources/app.asar/out/renderer/index.html'

function setup() {
  const session = {}
  const frame = {
    url: DOCUMENT,
    processId: 12,
    routingId: 34,
    isDestroyed: vi.fn(() => false)
  }
  const sender = {
    id: 56,
    mainFrame: frame,
    session,
    isDestroyed: vi.fn(() => false),
    isLoadingMainFrame: vi.fn(() => false)
  }
  const window = { id: 78, webContents: sender, isDestroyed: vi.fn(() => false) }
  mocks.fromWebContents.mockReturnValue(window)
  const options: ProjectSourceWindowDocumentOptions = {
    approvedWindow: window as never,
    approvedSession: session as never,
    currentAppProfile: () => 'personal',
    expectedDocumentUrl: DOCUMENT
  }
  return {
    options,
    frame,
    sender,
    window,
    verify: () => verifyProjectSourceWindowDocument(options, sender as never, frame as never)
  }
}

describe('Main-owned source window/document verification without credentials', () => {
  beforeEach(() => {
    mocks.isPackaged = true
    mocks.fromWebContents.mockReset()
  })

  it('accepts the exact packaged personal window, session and main frame', () => {
    expect(setup().verify()).toBe(true)
  })

  it('ignores only a hash navigation within the pinned document', () => {
    const a = setup()
    a.frame.url += '#project-map'
    expect(a.verify()).toBe(true)
  })

  it.each(['corporate', 'development'] as const)('rejects %s profiles', (profile) => {
    const a = setup()
    a.options = { ...a.options, currentAppProfile: () => profile }
    expect(verifyProjectSourceWindowDocument(a.options, a.sender as never, a.frame as never)).toBe(
      false
    )
  })

  it('rejects unpackaged applications', () => {
    const a = setup()
    mocks.isPackaged = false
    expect(a.verify()).toBe(false)
  })

  it.each([
    'missing window',
    'different window',
    'destroyed window',
    'different window sender',
    'destroyed sender',
    'loading sender',
    'different session',
    'different frame',
    'destroyed frame',
    'different document',
    'query document',
    'negative process',
    'unsafe process',
    'negative routing',
    'unsafe routing',
    'negative window',
    'negative sender'
  ])('rejects %s', (change) => {
    const a = setup()
    switch (change) {
      case 'missing window':
        mocks.fromWebContents.mockReturnValue(null)
        break
      case 'different window':
        mocks.fromWebContents.mockReturnValue({ ...a.window })
        break
      case 'destroyed window':
        a.window.isDestroyed.mockReturnValue(true)
        break
      case 'different window sender':
        a.window.webContents = {} as never
        break
      case 'destroyed sender':
        a.sender.isDestroyed.mockReturnValue(true)
        break
      case 'loading sender':
        a.sender.isLoadingMainFrame.mockReturnValue(true)
        break
      case 'different session':
        a.sender.session = {}
        break
      case 'different frame':
        a.sender.mainFrame = { ...a.frame }
        break
      case 'destroyed frame':
        a.frame.isDestroyed.mockReturnValue(true)
        break
      case 'different document':
        a.frame.url = 'https://github.com/'
        break
      case 'query document':
        a.frame.url += '?replacement'
        break
      case 'negative process':
        a.frame.processId = -1
        break
      case 'unsafe process':
        a.frame.processId = Number.MAX_SAFE_INTEGER + 1
        break
      case 'negative routing':
        a.frame.routingId = -1
        break
      case 'unsafe routing':
        a.frame.routingId = Number.NaN
        break
      case 'negative window':
        a.window.id = -1
        break
      case 'negative sender':
        a.sender.id = -1
        break
    }
    expect(a.verify()).toBe(false)
  })

  it.each([undefined, null])('rejects a missing sender or frame: %s', (missing) => {
    const a = setup()
    expect(verifyProjectSourceWindowDocument(a.options, missing as never, a.frame as never)).toBe(
      false
    )
    expect(verifyProjectSourceWindowDocument(a.options, a.sender as never, missing as never)).toBe(
      false
    )
  })

  it.each(['', ' file:///bad', 'file:///bad\n'])('rejects an invalid pinned URL: %j', (url) => {
    const a = setup()
    expect(
      verifyProjectSourceWindowDocument(
        { ...a.options, expectedDocumentUrl: url },
        a.sender as never,
        a.frame as never
      )
    ).toBe(false)
  })

  it('fails closed when Electron inspection throws', () => {
    const a = setup()
    a.sender.isDestroyed.mockImplementation(() => {
      throw new Error('retired')
    })
    expect(a.verify()).toBe(false)
  })
})
