import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MainProjectSourceIntegration } from './project-source-main-integration'

const mocks = vi.hoisted(() => ({
  options: [] as ConstructorParameters<typeof MainProjectSourceIntegration>[0][],
  revoke: vi.fn(),
  construct: vi.fn(),
  dispose: vi.fn()
}))
vi.mock('./project-source-main-integration', () => ({
  MainProjectSourceIntegration: class {
    constructor(options: ConstructorParameters<typeof MainProjectSourceIntegration>[0]) {
      mocks.options.push(options)
      mocks.construct()
    }
    revoke = mocks.revoke
    dispose = mocks.dispose
  }
}))
import { MainProjectSourceBootstrap } from './project-source-main-bootstrap'

function fixture(profile: 'personal' | 'corporate' | 'development' = 'personal') {
  let identity: string | null = 'profile-1'
  const listeners = new Set<() => void>()
  const catalog = {
    invalidate: vi.fn(),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    })
  }
  const bootstrap = new MainProjectSourceBootstrap({
    catalog: catalog as never,
    expectedDocumentUrl: 'file:///app/renderer/index.html',
    currentAppProfile: () => profile,
    currentProfileIdentity: () => identity
  })
  const sender = Object.assign(new EventEmitter(), {
    session: {},
    isDestroyed: (): boolean => false
  })
  const window = Object.assign(new EventEmitter(), {
    webContents: sender,
    isDestroyed: (): boolean => false
  })
  return {
    bootstrap,
    catalog,
    window,
    sender,
    listeners,
    changeProfile: () => {
      identity = 'profile-2'
    }
  }
}

beforeEach(() => {
  mocks.options.length = 0
  vi.clearAllMocks()
})
describe('default-disabled Main project-source bootstrap', () => {
  it('pins the explicit window session and never installs a principal or runner attestations', () => {
    const f = fixture()
    expect(f.bootstrap.attachMainWindow(f.window as never)).toBe(true)
    const options = mocks.options[0]
    expect(options.enabled).toBe(false)
    expect(options.approvedWebContents).toBe(f.sender)
    expect(options.origin.approvedSession).toBe(f.sender.session)
    expect(options.origin.expectedDocumentUrl).toBe('file:///app/renderer/index.html')
    expect(options.credential.current()).toBeNull()
    expect(options.runner.confinement).toBeUndefined()
    expect(options.runner.executable.path).toBe('')
    f.bootstrap.dispose()
  })
  it.each(['corporate', 'development'] as const)('does not attach %s windows', (profile) => {
    const f = fixture(profile)
    expect(f.bootstrap.attachMainWindow(f.window as never)).toBe(false)
    expect(mocks.options).toHaveLength(0)
    f.bootstrap.dispose()
  })
  it('refuses duplicate ownership and retires an old window before replacement', () => {
    const f = fixture()
    expect(f.bootstrap.attachMainWindow(f.window as never)).toBe(true)
    expect(f.bootstrap.attachMainWindow(f.window as never)).toBe(false)
    const replacement = fixture()
    expect(replacement.bootstrap.attachMainWindow(f.window as never)).toBe(false)
    expect(f.bootstrap.attachMainWindow(replacement.window as never)).toBe(true)
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
    expect(f.sender.eventNames()).toHaveLength(0)
    expect(f.window.eventNames()).toHaveLength(0)
    f.bootstrap.dispose()
    replacement.bootstrap.dispose()
  })
  it('does not overwrite ownership acquired during synchronous replacement revocation', () => {
    const first = fixture()
    const second = fixture()
    let acquired: boolean | undefined
    first.bootstrap.attachMainWindow(first.window as never)
    first.catalog.invalidate.mockImplementationOnce(() => {
      acquired = second.bootstrap.attachMainWindow(second.window as never)
    })
    expect(first.bootstrap.attachMainWindow(second.window as never)).toBe(false)
    expect(acquired).toBe(true)
    expect(mocks.options).toHaveLength(2)
    first.bootstrap.dispose()
    expect(second.window.listenerCount('closed')).toBe(1)
    expect(second.sender.listenerCount('destroyed')).toBe(1)
    second.bootstrap.dispose()
    expect(second.window.eventNames()).toHaveLength(0)
    expect(second.sender.eventNames()).toHaveLength(0)
  })
  it('denies reentrant attachment by the same bootstrap during replacement', () => {
    const first = fixture()
    const replacement = fixture()
    let reentered: boolean | undefined
    first.bootstrap.attachMainWindow(first.window as never)
    first.catalog.invalidate.mockImplementationOnce(() => {
      reentered = first.bootstrap.attachMainWindow(replacement.window as never)
    })
    expect(first.bootstrap.attachMainWindow(replacement.window as never)).toBe(true)
    expect(reentered).toBe(false)
    expect(mocks.options).toHaveLength(2)
    first.bootstrap.dispose()
    replacement.bootstrap.dispose()
    expect(replacement.window.eventNames()).toHaveLength(0)
    expect(replacement.sender.eventNames()).toHaveLength(0)
  })
  it('does not adopt a coordinator if bootstrap retires during coordinator construction', () => {
    const f = fixture()
    mocks.construct.mockImplementationOnce(() => f.bootstrap.dispose())
    expect(f.bootstrap.attachMainWindow(f.window as never)).toBe(false)
    expect(mocks.dispose).toHaveBeenCalledOnce()
    expect(f.window.eventNames()).toHaveLength(0)
    expect(f.sender.eventNames()).toHaveLength(0)
    expect(f.listeners.size).toBe(0)
  })
  it.each([
    'did-start-navigation',
    'will-navigate',
    'will-frame-navigate',
    'did-frame-navigate',
    'frame-created',
    'did-navigate',
    'render-process-gone'
  ])('synchronously revokes on %s', (event) => {
    const f = fixture()
    f.bootstrap.attachMainWindow(f.window as never)
    f.sender.emit(event)
    expect(mocks.revoke).toHaveBeenCalledTimes(1)
    expect(f.catalog.invalidate).toHaveBeenCalledTimes(1)
    f.bootstrap.dispose()
  })
  it.each(['closed', 'destroyed'])('disposes on %s without listener leaks', (event) => {
    const f = fixture()
    f.bootstrap.attachMainWindow(f.window as never)
    ;(event === 'closed' ? f.window : f.sender).emit(event)
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
    expect(f.window.eventNames()).toHaveLength(0)
    expect(f.sender.eventNames()).toHaveLength(0)
    f.bootstrap.dispose()
    expect(f.listeners.size).toBe(0)
  })
  it('revokes on catalog mutation and permanently disposes on profile mismatch', () => {
    const f = fixture()
    f.bootstrap.attachMainWindow(f.window as never)
    for (const listener of f.listeners) {
      listener()
    }
    expect(mocks.revoke).toHaveBeenCalledTimes(1)
    f.changeProfile()
    for (const listener of f.listeners) {
      listener()
    }
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
    expect(f.bootstrap.attachMainWindow(f.window as never)).toBe(false)
    expect(f.listeners.size).toBe(0)
  })
  it('fails closed if lifecycle subscription fails and cleans partial listeners', () => {
    const f = fixture()
    f.sender.on = vi.fn(() => {
      throw new Error('unavailable')
    })
    expect(f.bootstrap.attachMainWindow(f.window as never)).toBe(false)
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
    expect(f.window.eventNames()).toHaveLength(0)
    f.bootstrap.dispose()
  })
  it('continues cleanup when coordinator disposal fails', () => {
    const f = fixture()
    f.bootstrap.attachMainWindow(f.window as never)
    mocks.dispose.mockImplementationOnce(() => {
      throw new Error('broken subscriber')
    })
    expect(() => f.bootstrap.dispose()).not.toThrow()
    expect(f.listeners.size).toBe(0)
    expect(f.sender.eventNames()).toHaveLength(0)
    expect(f.window.eventNames()).toHaveLength(0)
    expect(f.catalog.invalidate).toHaveBeenCalledTimes(1)
    expect(mocks.options[0].credential.current()).toBeNull()
  })
  it('does not restore an old bootstrap after disposal or profile A-B-A', () => {
    const f = fixture()
    f.bootstrap.attachMainWindow(f.window as never)
    f.bootstrap.dispose()
    expect(f.bootstrap.attachMainWindow(f.window as never)).toBe(false)
    const restarted = fixture()
    expect(restarted.bootstrap.attachMainWindow(f.window as never)).toBe(true)
    expect(mocks.options[0].credential).not.toBe(mocks.options[1].credential)
    restarted.bootstrap.dispose()
  })
  it('rejects an unavailable profile or catalog subscription', () => {
    const f = fixture()
    const options = {
      catalog: f.catalog as never,
      expectedDocumentUrl: 'file:///app/index.html',
      currentAppProfile: () => 'personal' as const,
      currentProfileIdentity: (): string | null => {
        throw new Error('unavailable')
      }
    }
    const unavailable = new MainProjectSourceBootstrap(options)
    expect(unavailable.attachMainWindow(f.window as never)).toBe(false)
    f.catalog.subscribe.mockImplementationOnce(() => {
      throw new Error('unavailable')
    })
    const brokenCatalog = new MainProjectSourceBootstrap({
      ...options,
      currentProfileIdentity: () => 'p'
    })
    expect(brokenCatalog.attachMainWindow(f.window as never)).toBe(false)
    f.bootstrap.dispose()
  })
  it('rejects destroyed windows, destroyed contents and missing sessions', () => {
    const f = fixture()
    f.window.isDestroyed = () => true
    expect(f.bootstrap.attachMainWindow(f.window as never)).toBe(false)
    f.window.isDestroyed = () => false
    f.sender.isDestroyed = () => true
    expect(f.bootstrap.attachMainWindow(f.window as never)).toBe(false)
    f.sender.isDestroyed = () => false
    f.sender.session = null as never
    expect(f.bootstrap.attachMainWindow(f.window as never)).toBe(false)
    expect(mocks.options).toHaveLength(0)
    f.bootstrap.dispose()
  })
})
