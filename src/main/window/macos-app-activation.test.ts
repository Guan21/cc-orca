import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMacAppActivationHandler } from './macos-app-activation'

type FakeWindowOptions = {
  destroyed?: boolean
  minimized?: boolean
  visible?: boolean
}

function makeWindow(options: FakeWindowOptions | boolean = {}): BrowserWindow & {
  focus: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  showInactive: ReturnType<typeof vi.fn>
} {
  const normalized = typeof options === 'boolean' ? { destroyed: options } : options
  return {
    isDestroyed: vi.fn(() => normalized.destroyed ?? false),
    isMinimized: vi.fn(() => normalized.minimized ?? false),
    isVisible: vi.fn(() => normalized.visible ?? true),
    focus: vi.fn(),
    restore: vi.fn(),
    show: vi.fn(),
    showInactive: vi.fn()
  } as unknown as BrowserWindow & {
    focus: ReturnType<typeof vi.fn>
    restore: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    showInactive: ReturnType<typeof vi.fn>
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('ORCA_BACKGROUND_LAUNCH', undefined)
  vi.stubEnv('ORCA_E2E_HEADLESS', undefined)
  vi.stubEnv('ORCA_E2E_HEADFUL', undefined)
  vi.stubEnv('ORCA_E2E_FOREGROUND', undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('createMacAppActivationHandler', () => {
  it('leaves an existing visible window to native macOS activation', () => {
    const requestActivation = vi.fn()
    const window = makeWindow({ visible: true })
    const handler = createMacAppActivationHandler({
      getWindow: () => window,
      requestActivation
    })

    handler()
    vi.advanceTimersByTime(0)

    expect(requestActivation).not.toHaveBeenCalled()
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })

  it('treats partial existing-window test doubles as visible', () => {
    const requestActivation = vi.fn()
    const handler = createMacAppActivationHandler({
      getWindow: () => ({ isDestroyed: vi.fn(() => false) }) as unknown as BrowserWindow,
      requestActivation
    })

    expect(() => handler()).not.toThrow()
    vi.advanceTimersByTime(0)

    expect(requestActivation).not.toHaveBeenCalled()
  })

  it.each([null, makeWindow(true)])(
    'requests desktop activation for a missing or destroyed window',
    (window) => {
      const requestActivation = vi.fn()
      const handler = createMacAppActivationHandler({
        getWindow: () => window,
        requestActivation
      })

      handler()

      expect(requestActivation).toHaveBeenCalledTimes(1)
    }
  )

  it('recovers an existing hidden window on a deferred turn', () => {
    const requestActivation = vi.fn()
    const window = makeWindow({ visible: false })
    const handler = createMacAppActivationHandler({
      getWindow: () => window,
      requestActivation
    })

    handler()

    expect(requestActivation).not.toHaveBeenCalled()
    expect(window.show).not.toHaveBeenCalled()

    vi.advanceTimersByTime(0)

    expect(window.show).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
    expect(window.restore).not.toHaveBeenCalled()
  })

  it('restores and reveals an existing minimized window on a deferred turn', () => {
    const requestActivation = vi.fn()
    const window = makeWindow({ minimized: true, visible: true })
    const handler = createMacAppActivationHandler({
      getWindow: () => window,
      requestActivation
    })

    handler()
    vi.advanceTimersByTime(0)

    expect(requestActivation).not.toHaveBeenCalled()
    expect(window.restore).toHaveBeenCalledTimes(1)
    expect(window.show).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
  })

  it('does not force a foreground reveal during a background windowless launch', () => {
    vi.stubEnv('ORCA_BACKGROUND_LAUNCH', '1')
    const requestActivation = vi.fn()
    const window = makeWindow({ visible: false })
    const handler = createMacAppActivationHandler({
      getWindow: () => window,
      requestActivation
    })

    handler()
    vi.advanceTimersByTime(0)

    expect(requestActivation).not.toHaveBeenCalled()
    expect(window.show).not.toHaveBeenCalled()
    expect(window.showInactive).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })
})
