import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PROJECT_SOURCE_REFRESH_CHANNEL,
  PROJECT_SOURCE_REGISTER_CHANNEL
} from '../../shared/github/project-source-ipc-contract'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  verify: vi.fn(() => true)
}))
vi.mock('electron', () => ({
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
  const sender = Object.assign(new EventEmitter(), { session: {} })
  const window = Object.assign(new EventEmitter(), { webContents: sender })
  const register = vi.fn(async () => 'registered' as const)
  const doRefresh = vi.fn(async () => 'refreshed' as const)
  const options = {
    window: window as never,
    expectedDocumentUrl: 'file:///app/renderer/index.html',
    currentAppProfile: () => 'personal' as const,
    isEnabled: () => enabled,
    register,
    ...(refresh ? { refresh: doRefresh } : {})
  }
  const dispose = registerProjectSourceOperationOwner(options)
  cleanups.push(dispose)
  const event = { sender, senderFrame: {} }
  return { sender, window, event, options, register, doRefresh, dispose }
}
async function invoke(channel: string, event: unknown, ...args: unknown[]): Promise<unknown> {
  return mocks.handlers.get(channel)!(event, ...args)
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
  mocks.verify.mockReset().mockReturnValue(true)
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

  it('allows only one operation at a time for a given owner', async () => {
    const f = fixture()
    let finish!: (value: 'registered') => void
    f.register.mockImplementationOnce(
      () => new Promise<'registered'>((resolve) => { finish = resolve })
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
        () => new Promise<'registered'>((resolve) => { finish = resolve })
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
      () => new Promise<'registered'>((resolve) => { finish = resolve })
    )
    const pending = invoke(PROJECT_SOURCE_REGISTER_CHANNEL, f.event)
    f.window.emit('closed')
    finish('registered')
    expect(await pending).toEqual({ status: 'stale' })
    expect(f.sender.eventNames()).toHaveLength(0)
  })
})
