import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ProjectSourceWindowDocument from './project-source-window-document'
import {
  PROJECT_SOURCE_REFRESH_CHANNEL,
  PROJECT_SOURCE_REGISTER_CHANNEL
} from '../../shared/github/project-source-ipc-contract'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  windows: new Map<unknown, unknown>(),
  verify: vi.fn(() => true)
}))
vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: { fromWebContents: (sender: unknown) => mocks.windows.get(sender) },
  ipcMain: {
    handle: (name: string, fn: (...args: unknown[]) => Promise<unknown>): void => {
      if (mocks.handlers.has(name)) {
        throw new Error('Handler registered twice')
      }
      mocks.handlers.set(name, fn)
    }
  }
}))
vi.mock('./project-source-window-document', () => ({
  verifyProjectSourceWindowDocument: mocks.verify
}))
import {
  ensureProjectSourceOperationResponders,
  registerProjectSourceOperationOwner
} from './project-source-operation-ipc'

const cleanups: (() => void)[] = []
function fixture(enabled = true, refresh = true) {
  const profile = { current: 'personal' as 'personal' | 'corporate' | 'development' }
  const frame = {
    processId: 1,
    routingId: 1,
    url: 'file:///app/renderer/index.html',
    isDestroyed: () => false
  }
  const sender = Object.assign(new EventEmitter(), {
    id: 1,
    session: {},
    mainFrame: frame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false
  })
  const window = Object.assign(new EventEmitter(), {
    id: 1,
    webContents: sender,
    isDestroyed: () => false
  })
  mocks.windows.set(sender, window)
  const register = vi.fn(async () => 'registered' as const)
  const doRefresh = vi.fn(async () => 'refreshed' as const)
  const options = {
    window: window as never,
    expectedDocumentUrl: 'file:///app/renderer/index.html',
    currentAppProfile: () => profile.current,
    isEnabled: () => enabled,
    register,
    ...(refresh ? { refresh: doRefresh } : {})
  }
  const dispose = registerProjectSourceOperationOwner(options)
  cleanups.push(dispose)
  const event = { sender, senderFrame: frame }
  return { sender, window, frame, profile, event, options, register, doRefresh, dispose }
}
async function invoke(channel: string, event: unknown, ...args: unknown[]): Promise<unknown> {
  return mocks.handlers.get(channel)!(event, ...args)
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
  mocks.verify.mockReset().mockReturnValue(true)
  mocks.windows.clear()
})

describe('G2-B5a payload-free Main source intent IPC', () => {
  it('installs deny-by-default responders once even without a window', async () => {
    ensureProjectSourceOperationResponders()
    ensureProjectSourceOperationResponders()
    expect(mocks.handlers.size).toBe(2)
    expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, { sender: {} })).toEqual({
      status: 'denied'
    })
  })

  it('refuses forged sender and all renderer-supplied selectors, SHA and grants', async () => {
    const f = fixture()
    expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, { sender: {} })).toEqual({
      status: 'denied'
    })
    for (const value of [null, { projectId: 'p' }, 'abcdef', { grantRevision: 99 }]) {
      expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event, value)).toEqual({
        status: 'denied'
      })
      expect(await invoke(PROJECT_SOURCE_REFRESH_CHANNEL, f.event, value)).toEqual({
        status: 'denied'
      })
    }
    expect(f.register).not.toHaveBeenCalled()
    expect(f.doRefresh).not.toHaveBeenCalled()
  })

  it('denies invalid document/session/frame/profile before reaching Coordinator', async () => {
    const f = fixture()
    mocks.verify.mockReturnValue(false)
    expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)).toEqual({
      status: 'denied'
    })
    expect(f.register).not.toHaveBeenCalled()
  })

  it('does not call any operation when default-disabled', async () => {
    const f = fixture(false)
    expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)).toEqual({
      status: 'disabled'
    })
    expect(await invoke(PROJECT_SOURCE_REFRESH_CHANNEL, f.event)).toEqual({
      status: 'disabled'
    })
    expect(f.register).not.toHaveBeenCalled()
    expect(f.doRefresh).not.toHaveBeenCalled()
  })

  it('requires an explicit Main refresh provider and only passes the original event', async () => {
    const f = fixture(true, false)
    expect(await invoke(PROJECT_SOURCE_REFRESH_CHANNEL, f.event)).toEqual({
      status: 'unavailable'
    })
    expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)).toEqual({
      status: 'registered'
    })
    expect(f.register).toHaveBeenCalledExactlyOnceWith(f.event)
  })

  it('accepts only allowlisted statuses and returns no API result or raw error', async () => {
    const f = fixture()
    f.register.mockResolvedValueOnce('registered')
    expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)).toEqual({
      status: 'registered'
    })
    const malicious = { status: 'registered', token: 'SECRET' }
    f.register.mockResolvedValueOnce(malicious as never)
    expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)).toEqual({
      status: 'unavailable'
    })
    f.doRefresh.mockRejectedValueOnce(new Error('Authorization SECRET'))
    expect(await invoke(PROJECT_SOURCE_REFRESH_CHANNEL, f.event)).toEqual({
      status: 'unavailable'
    })
    expect(await invoke(PROJECT_SOURCE_REFRESH_CHANNEL, f.event)).toEqual({
      status: 'refreshed'
    })
  })

  it('retains the operation permit during reentrant readiness callbacks', async () => {
    const f = fixture()
    let nested: Promise<unknown> | undefined
    f.options.isEnabled = () => {
      nested = invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)
      return true
    }
    expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)).toEqual({
      status: 'registered'
    })
    expect(await nested).toEqual({ status: 'busy' })
    expect(f.register).toHaveBeenCalledOnce()
  })

  it('suppresses completed operations when source enablement changes in flight', async () => {
    const f = fixture()
    let enabled = true
    f.options.isEnabled = () => enabled
    f.register.mockImplementationOnce(async () => {
      enabled = false
      return 'registered'
    })
    expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)).toEqual({
      status: 'stale'
    })
  })

  it('allows only one operation at a time for a given owner', async () => {
    const f = fixture()
    let finish!: (value: 'registered') => void
    f.register.mockImplementationOnce(
      () =>
        new Promise<'registered'>((resolve) => {
          finish = resolve
        })
    )
    const pending = invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)
    expect(await invoke(PROJECT_SOURCE_REFRESH_CHANNEL, f.event)).toEqual({
      status: 'busy'
    })
    finish('registered')
    expect(await pending).toEqual({ status: 'registered' })
  })

  it.each(['did-start-navigation', 'will-navigate', 'did-navigate', 'render-process-gone'])(
    'discards a late result after %s',
    async (name) => {
      const f = fixture()
      let finish!: (value: 'registered') => void
      f.register.mockImplementationOnce(
        () =>
          new Promise<'registered'>((resolve) => {
            finish = resolve
          })
      )
      const pending = invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)
      f.sender.emit(name)
      finish('registered')
      expect(await pending).toEqual({ status: 'stale' })
    }
  )

  it('refuses two owners for one WebContents and retires on destruction', async () => {
    const f = fixture()
    expect(() => registerProjectSourceOperationOwner(f.options)).toThrow()
    f.sender.emit('destroyed')
    expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)).toEqual({
      status: 'denied'
    })
    expect(f.register).not.toHaveBeenCalled()
  })

  it('does not deliver a late result after window close/disposal', async () => {
    const f = fixture()
    let finish!: (value: 'registered') => void
    f.register.mockImplementationOnce(
      () =>
        new Promise<'registered'>((resolve) => {
          finish = resolve
        })
    )
    const pending = invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)
    f.window.emit('closed')
    finish('registered')
    expect(await pending).toEqual({ status: 'stale' })
    expect(f.sender.eventNames()).toHaveLength(0)
  })

  it('keeps pending permits and operation callbacks isolated between windows', async () => {
    const first = fixture()
    const second = fixture()
    let finish!: (value: 'registered') => void
    first.register.mockImplementationOnce(
      () =>
        new Promise<'registered'>((resolve) => {
          finish = resolve
        })
    )
    const pending = invoke(PROJECT_SOURCE_REGISTER_CHANNEL, first.event)
    expect(await invoke(PROJECT_SOURCE_REFRESH_CHANNEL, first.event)).toEqual({ status: 'busy' })
    expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, second.event)).toEqual({
      status: 'registered'
    })
    expect(await invoke(PROJECT_SOURCE_REFRESH_CHANNEL, second.event)).toEqual({
      status: 'refreshed'
    })
    first.dispose()
    expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, first.event)).toEqual({ status: 'denied' })
    expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, second.event)).toEqual({
      status: 'registered'
    })
    finish('registered')
    expect(await pending).toEqual({ status: 'stale' })
    expect(first.register).toHaveBeenCalledExactlyOnceWith(first.event)
    expect(first.doRefresh).not.toHaveBeenCalled()
    expect(second.register.mock.calls).toEqual([[second.event], [second.event]])
    expect(second.doRefresh).toHaveBeenCalledExactlyOnceWith(second.event)
  })

  it('holds the owner permit before the initial document verifier can reenter IPC', async () => {
    const f = fixture()
    let nested: Promise<unknown> | undefined
    mocks.verify.mockImplementationOnce(() => {
      nested = invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)
      return true
    })
    expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)).toEqual({ status: 'registered' })
    expect(await nested).toEqual({ status: 'busy' })
    expect(f.register).toHaveBeenCalledOnce()
  })

  it.each(['navigation', 'disposal'] as const)(
    'rejects initial verifier %s even when the verifier returns true',
    async (change) => {
      const f = fixture()
      mocks.verify.mockImplementationOnce(() => {
        if (change === 'navigation') {
          f.sender.emit('did-start-navigation')
        } else {
          f.dispose()
        }
        return true
      })
      expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)).toEqual({ status: 'stale' })
      expect(f.register).not.toHaveBeenCalled()
    }
  )

  it.each(['navigation', 'disposal'] as const)(
    'suppresses a result when final enablement causes %s and still returns true',
    async (change) => {
      const f = fixture()
      let enabledCalls = 0
      f.options.isEnabled = () => {
        enabledCalls += 1
        if (enabledCalls === 2) {
          if (change === 'navigation') {
            f.sender.emit('did-start-navigation')
          } else {
            f.dispose()
          }
        }
        return true
      }
      expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)).toEqual({ status: 'stale' })
      expect(f.register).toHaveBeenCalledOnce()
    }
  )

  it.each(['navigation', 'disposal'] as const)(
    'suppresses a result when final document verification causes %s and returns true',
    async (change) => {
      const f = fixture()
      mocks.verify
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockImplementationOnce(() => {
          if (change === 'navigation') {
            f.sender.emit('did-start-navigation')
          } else {
            f.dispose()
          }
          return true
        })
      expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)).toEqual({ status: 'stale' })
      expect(f.register).toHaveBeenCalledOnce()
    }
  )

  it.each(['destroyed', 'closed'] as const)(
    'does not let a retired owner result or cleanup affect its replacement after %s',
    async (name) => {
      const f = fixture()
      let finishOld!: (value: 'registered') => void
      f.register.mockImplementationOnce(
        () =>
          new Promise<'registered'>((resolve) => {
            finishOld = resolve
          })
      )
      const oldPending = invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)
      ;(name === 'closed' ? f.window : f.sender).emit(name)
      const replacementRegister = vi.fn(async () => 'registered' as const)
      const replacementDispose = registerProjectSourceOperationOwner({
        ...f.options,
        register: replacementRegister
      })
      cleanups.push(replacementDispose)
      let finishNew!: (value: 'registered') => void
      replacementRegister.mockImplementationOnce(
        () =>
          new Promise<'registered'>((resolve) => {
            finishNew = resolve
          })
      )
      const newPending = invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)
      f.dispose()
      finishOld('registered')
      expect(await oldPending).toEqual({ status: 'stale' })
      expect(await invoke(PROJECT_SOURCE_REFRESH_CHANNEL, f.event)).toEqual({ status: 'busy' })
      finishNew('registered')
      expect(await newPending).toEqual({ status: 'registered' })
      expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)).toEqual({
        status: 'registered'
      })
      expect(f.register).toHaveBeenCalledOnce()
      expect(replacementRegister).toHaveBeenCalledTimes(2)
    }
  )

  it('keeps the same two IPC handlers through window registration and disposal', () => {
    ensureProjectSourceOperationResponders()
    const originalHandlers = new Map(mocks.handlers)
    const first = fixture()
    const second = fixture()
    first.dispose()
    second.dispose()
    const replacement = registerProjectSourceOperationOwner(first.options)
    cleanups.push(replacement)
    ensureProjectSourceOperationResponders()
    expect(mocks.handlers.size).toBe(2)
    for (const [channel, handler] of originalHandlers) {
      expect(mocks.handlers.get(channel)).toBe(handler)
    }
  })

  it.each(['dispose', 'destroyed', 'closed'] as const)(
    'removes only owned listeners on %s and tolerates repeated cleanup',
    (name) => {
      const f = fixture()
      const senderListener = vi.fn()
      const windowListener = vi.fn()
      f.sender.on('did-navigate', senderListener)
      f.window.on('closed', windowListener)
      expect(f.sender.listenerCount('did-navigate')).toBe(2)
      expect(f.window.listenerCount('closed')).toBe(2)
      if (name === 'dispose') {
        f.dispose()
      } else {
        ;(name === 'closed' ? f.window : f.sender).emit(name)
      }
      f.dispose()
      expect(f.sender.eventNames()).toEqual(['did-navigate'])
      expect(f.sender.listeners('did-navigate')).toEqual([senderListener])
      expect(f.window.eventNames()).toEqual(['closed'])
      expect(f.window.listeners('closed')).toEqual([windowListener])
    }
  )

  it.each(['profile', 'document', 'session'] as const)(
    'rechecks real %s authority after an operation completes',
    async (authority) => {
      const actual = await vi.importActual<typeof ProjectSourceWindowDocument>(
        './project-source-window-document'
      )
      mocks.verify.mockImplementation(actual.verifyProjectSourceWindowDocument as never)
      const f = fixture()
      let finish!: (value: 'registered') => void
      f.register.mockImplementationOnce(
        () =>
          new Promise<'registered'>((resolve) => {
            finish = resolve
          })
      )
      const pending = invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)
      expect(f.register).toHaveBeenCalledExactlyOnceWith(f.event)
      if (authority === 'profile') {
        f.profile.current = 'corporate'
      } else if (authority === 'document') {
        f.frame.url = 'file:///app/renderer/other.html'
      } else {
        f.sender.session = {}
      }
      finish('registered')
      expect(await pending).toEqual({ status: 'stale' })
      expect(await invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)).toEqual({ status: 'denied' })
      expect(f.register).toHaveBeenCalledOnce()
    }
  )
})
