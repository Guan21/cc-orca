import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { MainProjectSourceLifecycleBridge } from './project-source-production-lifecycle'
import { SOURCE_LIFECYCLE_DOMAINS } from './project-source-composition-contract'

function fixture(retire = vi.fn()) {
  const contents = new EventEmitter()
  const window = Object.assign(new EventEmitter(), { webContents: contents })
  let revoke = (): void => {}
  const unsubscribe = vi.fn()
  const credential = {
    subscribeRevocation: (listener: () => void) => {
      revoke = listener
      return unsubscribe
    }
  }
  const catalog = { invalidate: vi.fn() }
  const bridge = new MainProjectSourceLifecycleBridge({
    window: window as never,
    credential,
    catalog,
    retire
  })
  return { bridge, contents, window, catalog, retire, revoke: () => revoke(), unsubscribe }
}

describe('deny-only production Main lifecycle bridge', () => {
  it('keeps all incomplete production domains unavailable and composition disabled', () => {
    const f = fixture()
    expect(f.bridge.readiness()).toEqual({
      composition: 'disabled',
      unavailableDomains: SOURCE_LIFECYCLE_DOMAINS
    })
    expect(f.bridge.lifecycle).toEqual({})
    expect(Object.isFrozen(f.bridge.lifecycle)).toBe(true)
    f.bridge.dispose()
  })

  it.each([
    'will-frame-navigate',
    'will-navigate',
    'did-start-navigation',
    'did-frame-navigate',
    'did-navigate',
    'frame-created',
    'render-process-gone'
  ])('synchronously retires on genuine WebContents %s observations', (event) => {
    const f = fixture()
    let published = false
    f.retire.mockImplementation(() => expect(published).toBe(false))
    f.contents.emit(event)
    published = true
    expect(f.retire).toHaveBeenCalledOnce()
    f.bridge.dispose()
    expect(f.contents.eventNames()).toEqual([])
    expect(f.window.eventNames()).toEqual([])
    expect(f.unsubscribe).toHaveBeenCalledOnce()
  })

  it('retires even a canceled close and explicit credential revocation', () => {
    const f = fixture()
    f.window.emit('close', { preventDefault: vi.fn() })
    f.revoke()
    expect(f.retire).toHaveBeenCalledTimes(2)
    f.bridge.dispose()
  })

  it('does not recurse or revive after disposal or callback failure', () => {
    const f = fixture()
    f.retire.mockImplementation(() => f.bridge.invalidate())
    f.bridge.invalidate()
    expect(f.retire).toHaveBeenCalledOnce()
    f.retire.mockImplementation(() => {
      throw new Error('private failure')
    })
    expect(() => f.bridge.invalidate()).not.toThrow()
    expect(f.bridge.readiness().composition).toBe('disposed')
    f.bridge.invalidate()
    f.revoke()
    expect(f.retire).toHaveBeenCalledTimes(2)
    expect(f.contents.eventNames()).toEqual([])
    f.bridge.dispose()
  })

  it('removes partial listeners and rejects failed installation', () => {
    const window = Object.assign(new EventEmitter(), { webContents: new EventEmitter() })
    const original = window.webContents.on.bind(window.webContents)
    vi.spyOn(window.webContents, 'on').mockImplementation((event, listener) => {
      original(event, listener)
      throw new Error('failed after attaching')
    })
    const retire = vi.fn()
    const unsubscribe = vi.fn()
    expect(
      () =>
        new MainProjectSourceLifecycleBridge({
          window: window as never,
          credential: { subscribeRevocation: () => unsubscribe },
          catalog: { invalidate: vi.fn() },
          retire
        })
    ).toThrow('SOURCE_UNAVAILABLE')
    expect(window.eventNames()).toEqual([])
    expect(window.webContents.eventNames()).toEqual([])
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('rejects revocation during subscription installation', () => {
    const window = Object.assign(new EventEmitter(), { webContents: new EventEmitter() })
    const unsubscribe = vi.fn()
    expect(
      () =>
        new MainProjectSourceLifecycleBridge({
          window: window as never,
          credential: {
            subscribeRevocation: (listener) => {
              listener()
              return unsubscribe
            }
          },
          catalog: { invalidate: vi.fn() },
          retire: vi.fn()
        })
    ).toThrow('SOURCE_UNAVAILABLE')
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(window.eventNames()).toEqual([])
  })

  it('attempts every cleanup even when a credential unsubscribe throws', () => {
    const f = fixture()
    f.unsubscribe.mockImplementation(() => {
      throw new Error('cleanup failed')
    })
    expect(() => f.bridge.dispose()).not.toThrow()
    expect(f.contents.eventNames()).toEqual([])
    expect(f.window.eventNames()).toEqual([])
    f.bridge.dispose()
    expect(f.unsubscribe).toHaveBeenCalledOnce()
  })

  it('cleans subscriptions returned after an inline retirement failure', () => {
    const window = Object.assign(new EventEmitter(), { webContents: new EventEmitter() })
    const unsubscribe = vi.fn()
    expect(
      () =>
        new MainProjectSourceLifecycleBridge({
          window: window as never,
          credential: {
            subscribeRevocation: (listener) => {
              listener()
              return unsubscribe
            }
          },
          catalog: { invalidate: vi.fn() },
          retire: () => {
            throw new Error('retirement failed')
          }
        })
    ).toThrow('SOURCE_UNAVAILABLE')
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(window.eventNames()).toEqual([])
    expect(window.webContents.eventNames()).toEqual([])
  })

  it('still invalidates catalog selection when independent retirement fails', () => {
    const f = fixture()
    f.retire.mockImplementation(() => {
      throw new Error('retirement failed')
    })
    f.contents.emit('will-frame-navigate')
    expect(f.catalog.invalidate).toHaveBeenCalledOnce()
    expect(f.bridge.readiness().composition).toBe('disposed')
    expect(f.contents.eventNames()).toEqual([])
  })
})
