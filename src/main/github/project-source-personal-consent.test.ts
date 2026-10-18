import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
  isPackaged: true
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mocks.isPackaged
    }
  },
  dialog: { showMessageBox: mocks.showMessageBox }
}))

import { createPersonalPrConsent } from './project-source-personal-consent'
import type { TrustedSelectedPrBinding } from './project-source-grant-registry'

const binding: TrustedSelectedPrBinding = {
  projectId: 'project-a',
  workspaceKind: 'worktree',
  workspaceId: 'workspace-a',
  hostSetupId: 'native-host',
  executionHostId: 'main-native',
  repository: {
    host: 'github.com',
    id: 123,
    nodeId: 'R_real',
    owner: 'Acme',
    name: 'service'
  },
  prNumber: 123
}

function setup() {
  const window = {
    isDestroyed: vi.fn(() => false),
    webContents: { isDestroyed: vi.fn(() => false) }
  }
  const current = vi.fn(() => true)
  return {
    confirm: createPersonalPrConsent(window as never, current),
    window,
    current
  }
}

describe('#152 B3 Main-only native Personal consent', () => {
  beforeEach(() => {
    mocks.isPackaged = true
    mocks.showMessageBox.mockReset()
    mocks.showMessageBox.mockResolvedValue({ response: 0 })
  })

  it('defaults to Cancel, never treats selection alone as permission', async () => {
    const s = setup()
    expect(await s.confirm(binding)).toBe(false)
    expect(mocks.showMessageBox).toHaveBeenCalledOnce()
    expect(mocks.showMessageBox.mock.calls[0][1]).toMatchObject({
      buttons: ['Cancel', 'Allow read'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
  })

  it('shows exact selected Project/repository/PR and accepts only explicit Allow', async () => {
    mocks.showMessageBox.mockResolvedValue({ response: 1 })
    const s = setup()
    expect(await s.confirm(binding)).toBe(true)
    const detail = mocks.showMessageBox.mock.calls[0][1].detail
    expect(detail).toContain('Project: project-a')
    expect(detail).toContain('Repository: Acme/service')
    expect(detail).toContain('Pull request: #123')
    expect(detail).not.toContain('token')
  })

  it('never opens a consent dialog in dev, Corporate, or a dead window', async () => {
    const s = setup()
    mocks.isPackaged = false
    expect(await s.confirm(binding)).toBe(false)
    mocks.isPackaged = true
    s.window.isDestroyed.mockReturnValue(true)
    expect(await s.confirm(binding)).toBe(false)
    expect(mocks.showMessageBox).not.toHaveBeenCalled()
  })

  it('denies untrusted host, destroyed WebContents, and stale Main approval', async () => {
    const s = setup()
    const corporate = {
      ...binding,
      repository: { ...binding.repository, host: 'enterprise.example.com' as 'github.com' }
    }
    expect(await s.confirm(corporate)).toBe(false)
    s.window.webContents.isDestroyed.mockReturnValue(true)
    expect(await s.confirm(binding)).toBe(false)
    s.window.webContents.isDestroyed.mockReturnValue(false)
    s.current.mockReturnValue(false)
    expect(await s.confirm(binding)).toBe(false)
    expect(mocks.showMessageBox).not.toHaveBeenCalled()
  })

  it('rejects a stale approval after the native dialog returns', async () => {
    const s = setup()
    mocks.showMessageBox.mockImplementation(async () => {
      s.current.mockReturnValue(false)
      return { response: 1 }
    })
    expect(await s.confirm(binding)).toBe(false)
  })

  it('rejects a window closed during the modal dialog', async () => {
    const s = setup()
    mocks.showMessageBox.mockImplementation(async () => {
      s.window.isDestroyed.mockReturnValue(true)
      return { response: 1 }
    })
    expect(await s.confirm(binding)).toBe(false)
  })
})
