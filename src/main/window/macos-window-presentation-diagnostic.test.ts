import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMacosWindowPresentationSnapshot,
  installMacosWindowPresentationDiagnostic
} from './macos-window-presentation-diagnostic'

function createWindowDouble() {
  const windowHandlers = new Map<string, (() => void)[]>()
  const webContentsHandlers = new Map<string, (() => void)[]>()
  const addHandler =
    (handlers: Map<string, (() => void)[]>) =>
    (event: string, handler: () => void): void => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
    }

  const window = {
    webContents: {
      on: vi.fn(addHandler(webContentsHandlers))
    },
    on: vi.fn(addHandler(windowHandlers)),
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    isFocused: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isMaximized: vi.fn(() => true),
    isFullScreen: vi.fn(() => false),
    isContentProtected: vi.fn(() => true),
    getOpacity: vi.fn(() => 0.82),
    isFocusable: vi.fn(() => true),
    isEnabled: vi.fn(() => true),
    isAlwaysOnTop: vi.fn(() => false),
    isVisibleOnAllWorkspaces: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 1, y: 2, width: 1200, height: 800 })),
    getContentBounds: vi.fn(() => ({ x: 1, y: 30, width: 1200, height: 770 })),
    getBackgroundColor: vi.fn(() => '#ffffff'),
    setContentProtection: vi.fn()
  }

  return {
    fireWebContents: (event: string) => {
      for (const handler of webContentsHandlers.get(event) ?? []) {
        handler()
      }
    },
    fireWindow: (event: string) => {
      for (const handler of windowHandlers.get(event) ?? []) {
        handler()
      }
    },
    window
  }
}

describe('macOS window presentation diagnostic', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not force content protection off when the diagnostic env is unset', () => {
    const { window } = createWindowDouble()

    installMacosWindowPresentationDiagnostic(window as never, {
      env: {},
      platform: 'darwin'
    })

    expect(window.setContentProtection).not.toHaveBeenCalled()
  })

  it('forces content protection off once when enabled on macOS', () => {
    const { window } = createWindowDouble()

    installMacosWindowPresentationDiagnostic(window as never, {
      env: { ORCA_DIAG_FORCE_CONTENT_PROTECTION_OFF: '1' },
      platform: 'darwin'
    })

    expect(window.setContentProtection).toHaveBeenCalledExactlyOnceWith(false)
  })

  it.each(['win32', 'linux'] as const)(
    'does not force content protection off on %s',
    (platform) => {
      const { window } = createWindowDouble()

      installMacosWindowPresentationDiagnostic(window as never, {
        env: { ORCA_DIAG_FORCE_CONTENT_PROTECTION_OFF: '1' },
        platform
      })

      expect(window.setContentProtection).not.toHaveBeenCalled()
    }
  )

  it('logs native window state fields in the compact diagnostic snapshot', () => {
    const { window } = createWindowDouble()

    installMacosWindowPresentationDiagnostic(window as never, {
      env: {},
      platform: 'darwin'
    })

    const line = vi.mocked(console.log).mock.calls[0]?.[0] as string
    const payload = JSON.parse(line.replace('[issue37-native-window] ', ''))
    expect(payload).toMatchObject({
      stage: 'created',
      isContentProtected: true,
      opacity: 0.82,
      isVisible: true,
      isFocused: false,
      isMinimized: false,
      bounds: { x: 1, y: 2, width: 1200, height: 800 },
      contentBounds: { x: 1, y: 30, width: 1200, height: 770 }
    })
  })

  it('does not throw when optional BrowserWindow methods are absent', () => {
    const snapshot = createMacosWindowPresentationSnapshot({} as never, 'created')

    expect(snapshot).toEqual({ stage: 'created' })
  })

  it('logs lifecycle stages and reports a later false-to-true content protection transition', () => {
    const { fireWebContents, fireWindow, window } = createWindowDouble()
    window.isContentProtected.mockReturnValueOnce(false).mockReturnValueOnce(true)

    installMacosWindowPresentationDiagnostic(window as never, {
      env: { ORCA_DIAG_FORCE_CONTENT_PROTECTION_OFF: '1' },
      platform: 'darwin'
    })
    fireWebContents('did-finish-load')
    fireWindow('ready-to-show')
    fireWindow('show')
    fireWindow('focus')

    const payloads = vi
      .mocked(console.log)
      .mock.calls.map(([line]) => JSON.parse(String(line).replace('[issue37-native-window] ', '')))
    expect(payloads.map((payload) => payload.stage)).toEqual([
      'created',
      'content-protection-forced-off',
      'did-finish-load',
      'ready-to-show',
      'show',
      'focus'
    ])
    expect(payloads[1]).toMatchObject({ contentProtectionTransition: 'false-to-true' })
  })
})
