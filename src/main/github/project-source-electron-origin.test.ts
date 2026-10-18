import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fromWebContents: vi.fn(),
  isPackaged: true
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mocks.isPackaged
    }
  },
  BrowserWindow: { fromWebContents: mocks.fromWebContents }
}))

import { PersonalProjectSourceElectronOrigin } from './project-source-electron-origin'
import type { VerifiedPersonalGhPrincipal } from './project-source-electron-origin'

const RENDERER = 'file:///DevCrew/resources/app.asar/out/renderer/index.html'

function setup() {
  const session = { label: 'allowed-Session' }
  const frame = {
    url: RENDERER,
    processId: 222,
    routingId: 333,
    isDestroyed: vi.fn(() => false)
  }
  const sender = Object.assign(new EventEmitter(), {
    id: 17,
    mainFrame: frame,
    session,
    isDestroyed: vi.fn(() => false),
    isLoadingMainFrame: vi.fn(() => false)
  })
  const window = {
    id: 11,
    webContents: sender,
    isDestroyed: vi.fn(() => false)
  }
  mocks.fromWebContents.mockReturnValue(window)
  let activeProfile: 'personal' | 'corporate' | 'development' = 'personal'
  let principal: VerifiedPersonalGhPrincipal | null = {
    principalId: 'gh-actor-1',
    credentialGeneration: 8
  }
  const revoke = vi.fn()
  const origin = new PersonalProjectSourceElectronOrigin({
    approvedSession: session as never,
    currentAppProfile: () => activeProfile,
    expectedDocumentUrl: RENDERER,
    currentPrincipal: () => principal,
    revokeWebContents: revoke
  })
  const event = { sender, senderFrame: frame }
  return {
    origin,
    session,
    frame,
    sender,
    window,
    event,
    revoke,
    setProfile: (next: 'personal' | 'corporate' | 'development') => {
      activeProfile = next
    },
    setPrincipal: (next: VerifiedPersonalGhPrincipal | null) => {
      principal = next
    }
  }
}

describe('#152 B3 real Electron Main event identity (offline)', () => {
  beforeEach(() => {
    mocks.isPackaged = true
    mocks.fromWebContents.mockReset()
  })

  it('issues Main-owned document/session identity for a packaged, pinned local renderer', () => {
    const a = setup()
    const first = a.origin.attest(a.event as never)
    const second = a.origin.attest(a.event as never)
    expect(first).toMatchObject({
      profile: 'personal-packaged',
      executionRealm: 'native',
      windowId: 11,
      webContentsId: 17,
      frameProcessId: 222,
      frameRoutingId: 333,
      principalId: 'gh-actor-1',
      credentialGeneration: 8
    })
    expect(second).toEqual(first)
    expect(first?.documentId).toBeTruthy()
    expect(first?.sessionPartition).toBeTruthy()
    expect(a.revoke).not.toHaveBeenCalled()
  })

  it('denies a development build and a different Electron Session object', () => {
    const a = setup()
    mocks.isPackaged = false
    expect(a.origin.attest(a.event as never)).toBeNull()
    mocks.isPackaged = true
    a.setProfile('corporate')
    expect(a.origin.attest(a.event as never)).toBeNull()
    a.setProfile('personal')
    a.sender.session = { label: 'different-instance' }
    expect(a.origin.attest(a.event as never)).toBeNull()
  })

  it('denies foreign main frame, remote web origin, or stale app document', () => {
    const a = setup()
    expect(a.origin.attest({ ...a.event, senderFrame: {} } as never)).toBeNull()
    a.frame.url = 'https://attacker.example/'
    expect(a.origin.attest(a.event as never)).toBeNull()
    a.frame.url = `${RENDERER}?unreviewed-input=1`
    expect(a.origin.attest(a.event as never)).toBeNull()
  })

  it('denies detached window, destroyed sender, main-frame loading and destroyed frame', () => {
    const a = setup()
    mocks.fromWebContents.mockReturnValue({ ...a.window, webContents: {} })
    expect(a.origin.attest(a.event as never)).toBeNull()
    mocks.fromWebContents.mockReturnValue(a.window)
    a.sender.isLoadingMainFrame.mockReturnValue(true)
    expect(a.origin.attest(a.event as never)).toBeNull()
    a.sender.isLoadingMainFrame.mockReturnValue(false)
    a.frame.isDestroyed.mockReturnValue(true)
    expect(a.origin.attest(a.event as never)).toBeNull()
    a.frame.isDestroyed.mockReturnValue(false)
    a.sender.isDestroyed.mockReturnValue(true)
    expect(a.origin.attest(a.event as never)).toBeNull()
  })

  it('denies unresolved principal and invalid credential generation', () => {
    const a = setup()
    a.setPrincipal(null)
    expect(a.origin.attest(a.event as never)).toBeNull()
    a.setPrincipal({ principalId: 'actor', credentialGeneration: -1 })
    expect(a.origin.attest(a.event as never)).toBeNull()
    a.setPrincipal({ principalId: 'actor', credentialGeneration: 1 })
    expect(a.origin.attest(a.event as never)?.credentialGeneration).toBe(1)
  })

  it('revokes document before navigation and mints a new identity after it', () => {
    const a = setup()
    const initial = a.origin.attest(a.event as never)
    a.sender.emit('did-start-navigation')
    expect(a.revoke).toHaveBeenCalledExactlyOnceWith(17)
    const second = a.origin.attest(a.event as never)
    expect(second?.documentId).not.toBe(initial?.documentId)
    expect(second?.sessionPartition).toBe(initial?.sessionPartition)
  })

  it('revokes on render process gone, navigation and destroyed lifecycle', () => {
    const a = setup()
    a.origin.attest(a.event as never)
    a.sender.emit('render-process-gone')
    expect(a.revoke).toHaveBeenCalledTimes(1)
    a.origin.attest(a.event as never)
    a.sender.emit('will-navigate')
    expect(a.revoke).toHaveBeenCalledTimes(2)
    a.sender.emit('destroyed')
    expect(a.revoke).toHaveBeenCalledTimes(3)
  })

  it('does not multiply lifecycle listeners with repeated attestations', () => {
    const a = setup()
    a.origin.attest(a.event as never)
    a.origin.attest(a.event as never)
    a.origin.attest(a.event as never)
    expect(a.sender.listenerCount('did-start-navigation')).toBe(1)
    expect(a.sender.listenerCount('will-navigate')).toBe(1)
    a.origin.retire(a.sender as never)
    expect(a.revoke).toHaveBeenCalledExactlyOnceWith(17)
  })

  it('reflects current principal/credential generation instead of freezing an old identity', () => {
    const a = setup()
    const before = a.origin.attest(a.event as never)
    a.setPrincipal({ principalId: 'new-principal', credentialGeneration: 9 })
    const after = a.origin.attest(a.event as never)
    expect(before?.principalId).toBe('gh-actor-1')
    expect(after?.principalId).toBe('new-principal')
    expect(after?.credentialGeneration).toBe(9)
  })
})
