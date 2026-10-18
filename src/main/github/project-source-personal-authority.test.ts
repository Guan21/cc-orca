import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fromWebContents: vi.fn(),
  showMessageBox: vi.fn(),
  isPackaged: true
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mocks.isPackaged
    }
  },
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  dialog: { showMessageBox: mocks.showMessageBox }
}))

import { MainPersonalProjectSourceAuthority } from './project-source-personal-authority'
import type { TrustedSelectedPrBinding } from './project-source-grant-registry'

const RENDERER = 'file:///DevCrew/resources/app.asar/out/renderer/index.html'
const BINDING: TrustedSelectedPrBinding = {
  projectId: 'p1',
  workspaceKind: 'folder',
  workspaceId: 'workspace-1',
  hostSetupId: 'local-host',
  executionHostId: 'native',
  repository: {
    host: 'github.com',
    id: 100,
    nodeId: 'R_NODE',
    owner: 'Team',
    name: 'service'
  },
  prNumber: 5
}

function setup() {
  const frame = {
    processId: 2,
    routingId: 3,
    url: RENDERER,
    isDestroyed: () => false
  }
  const session = { label: 'main' }
  const sender = Object.assign(new EventEmitter(), {
    id: 5,
    session,
    mainFrame: frame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false
  })
  const window = {
    id: 6,
    webContents: sender,
    isDestroyed: () => false
  }
  mocks.fromWebContents.mockReturnValue(window)
  const authority = new MainPersonalProjectSourceAuthority({
    approvedSession: session as never,
    expectedDocumentUrl: RENDERER,
    currentPrincipal: () => ({ principalId: 'github-user', credentialGeneration: 1 })
  })
  const event = { sender, senderFrame: frame }
  return { authority, event, sender, frame, window }
}

describe('#152 B3 Main-internal Personal origin+consent composition', () => {
  beforeEach(() => {
    mocks.isPackaged = true
    mocks.fromWebContents.mockReset()
    mocks.showMessageBox.mockReset()
    mocks.showMessageBox.mockResolvedValue({ response: 1 })
  })

  it('does not open confirmation unless Main selects the trusted binding first', async () => {
    const { authority, event } = setup()
    expect(await authority.requestConsent(event as never)).toBe(false)
    expect(mocks.showMessageBox).not.toHaveBeenCalled()
    expect(authority.selectTrusted(event as never, BINDING)).toBe(true)
    expect(await authority.requestConsent(event as never)).toBe(true)
    expect(mocks.showMessageBox).toHaveBeenCalledOnce()
  })

  it('denies absent native identity in development and never displays a dialog', async () => {
    mocks.isPackaged = false
    const { authority, event } = setup()
    expect(authority.selectTrusted(event as never, BINDING)).toBe(false)
    expect(await authority.requestConsent(event as never)).toBe(false)
    expect(mocks.showMessageBox).not.toHaveBeenCalled()
  })

  it('rejects a late user confirmation after a main-controlled PR selection switch', async () => {
    const { authority, event } = setup()
    let finish!: (value: { response: number }) => void
    mocks.showMessageBox.mockImplementation(
      () => new Promise<{ response: number }>((resolve) => {
        finish = resolve
      })
    )
    expect(authority.selectTrusted(event as never, BINDING)).toBe(true)
    const first = authority.requestConsent(event as never)
    expect(authority.selectTrusted(event as never, { ...BINDING, prNumber: 6 })).toBe(true)
    finish({ response: 1 })
    expect(await first).toBe(false)
    expect(mocks.showMessageBox).toHaveBeenCalledOnce()
  })

  it('revokes on navigation and denies old event until Main selects again', async () => {
    const { authority, event, sender } = setup()
    expect(authority.selectTrusted(event as never, BINDING)).toBe(true)
    sender.emit('did-start-navigation')
    expect(await authority.requestConsent(event as never)).toBe(false)
    expect(authority.selectTrusted(event as never, BINDING)).toBe(true)
    expect(await authority.requestConsent(event as never)).toBe(true)
  })

  it('requires new user consent after Main logout or deliberate revoke', async () => {
    const { authority, event } = setup()
    expect(authority.selectTrusted(event as never, BINDING)).toBe(true)
    expect(await authority.requestConsent(event as never)).toBe(true)
    authority.revoke(event as never)
    expect(await authority.requestConsent(event as never)).toBe(false)
    expect(authority.selectTrusted(event as never, BINDING)).toBe(true)
    authority.retireAll()
    expect(await authority.requestConsent(event as never)).toBe(false)
  })
})
