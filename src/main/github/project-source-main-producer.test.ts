import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MainProjectSourceCatalog } from './project-source-main-catalog'
import { MainProjectSourceSelection } from './project-source-main-selection'
import { MainProjectSelectionProducer } from './project-source-main-producer'
import { MainProjectSourceBootstrap } from './project-source-main-bootstrap'
import type { MainProjectSourceIntegration } from './project-source-main-integration'

const electron = vi.hoisted(() => ({
  window: null as unknown,
  dialog: vi.fn(),
  popup: vi.fn(),
  template: [] as Electron.MenuItemConstructorOptions[],
  ipc: { on: vi.fn() }
}))
vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: {
    fromWebContents: (sender: unknown) =>
      (electron.window as { webContents: unknown })?.webContents === sender ? electron.window : null
  },
  dialog: { showMessageBox: electron.dialog },
  ipcMain: electron.ipc,
  Menu: {
    buildFromTemplate: (template: Electron.MenuItemConstructorOptions[]) => {
      electron.template = template
      return { popup: electron.popup }
    }
  }
}))

function fixture() {
  const mutations = new Set<() => void>()
  const project = {
    id: 'p',
    displayName: 'Project',
    sourceRepoIds: ['r'],
    providerIdentity: {
      provider: 'github',
      owner: 'owner',
      repo: 'repo'
    }
  }
  const repo = {
    id: 'r',
    displayName: 'Repo',
    path: '/repo',
    kind: 'git',
    gitRemoteIdentity: { canonicalKey: 'github.com/owner/repo' }
  }
  const setup = {
    id: 's',
    projectId: 'p',
    repoId: 'r',
    hostId: 'local',
    path: '/repo',
    setupState: 'ready'
  }
  const meta = {
    projectId: 'p',
    projectHostSetupId: 's',
    hostId: 'local',
    instanceId: 'i',
    linkedPR: 3
  }
  const store = {
    getSettings: () => ({ localWindowsRuntimeDefault: { kind: 'windows-host' as const } }),
    getProjects: () => [project],
    getRepos: () => [repo],
    getProjectHostSetups: () => [setup],
    getAllWorktreeMetaForHost: () => ({ 'r::/repo/w': meta }),
    getUnambiguousWorktreeMetaForHost: (id: string) => (id === 'r::/repo/w' ? meta : undefined),
    subscribeMutations: (listener: () => void) => {
      mutations.add(listener)
      return () => mutations.delete(listener)
    }
  }
  const catalog = new MainProjectSourceCatalog(store as never)
  const frame = {
    processId: 1,
    routingId: 2,
    url: 'file:///app/index.html',
    isDestroyed: () => false
  }
  const contents = Object.assign(new EventEmitter(), {
    id: 5,
    session: {},
    mainFrame: frame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false
  })
  const window = Object.assign(new EventEmitter(), {
    id: 4,
    webContents: contents,
    isDestroyed: () => false
  })
  electron.window = window
  let profile = 'profile-1'
  const producer = new MainProjectSelectionProducer({
    catalog,
    expectedDocumentUrl: frame.url,
    currentAppProfile: () => 'personal',
    currentProfileIdentity: () => profile
  })
  producer.attachMainWindow(window as never)
  const consumer = new MainProjectSourceSelection(catalog, producer)
  const candidate = {
    projectId: 'p',
    repoId: 'r',
    hostSetupId: 's',
    workspaceKind: 'worktree' as const,
    workspaceId: 'r::/repo/w',
    prNumber: 3
  }
  return {
    producer,
    consumer,
    catalog,
    candidate,
    contents,
    frame,
    window,
    project,
    repo,
    setup,
    meta,
    changeProfile: () => {
      profile = 'profile-2'
    },
    mutate: () => {
      for (const listener of mutations) {
        listener()
      }
    },
    choose: () => producer.confirmCandidate(window as never, candidate),
    dispose: () => {
      producer.dispose()
      consumer.dispose()
      catalog.dispose()
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  electron.dialog.mockResolvedValue({ response: 1 })
})

describe('production Main selection producer', () => {
  it('wires the real bootstrap, producer, consumer and coordinator without granting API access', async () => {
    const f = fixture()
    const bootstrap = new MainProjectSourceBootstrap({
      catalog: f.catalog,
      producer: f.producer,
      expectedDocumentUrl: f.frame.url,
      currentAppProfile: () => 'personal',
      currentProfileIdentity: () => 'profile-1'
    })
    expect(bootstrap.attachMainWindow(f.window as never)).toBe(true)
    bootstrap.openSelectionPicker(f.window as never)
    expect(electron.popup).toHaveBeenCalled()
    expect(await f.choose()).toBe(true)
    expect(f.consumer.readCurrent().status).toBe('selected')
    const integration = (bootstrap as unknown as { integration: MainProjectSourceIntegration })
      .integration
    expect(await integration.register({ sender: f.contents, senderFrame: f.frame } as never)).toBe(
      'denied'
    )
    expect(
      await integration.refresh(
        { sender: f.contents, senderFrame: f.frame } as never,
        'a'.repeat(40),
        vi.fn()
      )
    ).toMatchObject({ status: 'denied' })
    f.contents.emit('did-start-navigation')
    expect(f.producer.readCurrent().candidate).toBeNull()
    bootstrap.dispose()
    f.dispose()
  })
  it('starts empty and only native Accept publishes a catalog-validated revision', async () => {
    const f = fixture()
    expect(f.producer.readCurrent().candidate).toBeNull()
    const revision = f.producer.readCurrent().revision
    expect(await f.choose()).toBe(true)
    expect(electron.dialog).toHaveBeenCalledWith(
      f.window,
      expect.objectContaining({ defaultId: 0, cancelId: 0 })
    )
    const options = electron.dialog.mock.calls[0][1]
    for (const text of ['Project', 'owner/repo', '/repo/w', '3', 'registration']) {
      expect(options.detail).toContain(text)
    }
    expect(f.producer.readCurrent().revision).toBeGreaterThan(revision)
    expect(f.consumer.readCurrent().status).toBe('selected')
    expect(f.catalog.readSelection()).toMatchObject(f.candidate)
    f.dispose()
  })
  it('opens the real native picker and fences duplicate menu callbacks', async () => {
    const f = fixture()
    f.producer.openPicker(f.window as never)
    expect(electron.popup).toHaveBeenCalledWith({ window: f.window })
    const pick = electron.template.find(
      (item) => item.type !== 'separator' && item.enabled !== false && item.label?.includes('PR #3')
    )!
    await pick.click!(null as never, f.window as never, {} as never)
    await pick.click!(null as never, f.window as never, {} as never)
    expect(electron.dialog).toHaveBeenCalledTimes(1)
    expect(f.catalog.readSelection()).toMatchObject(f.candidate)
    f.dispose()
  })
  it('Cancel clears any old selection', async () => {
    const f = fixture()
    await f.choose()
    electron.dialog.mockResolvedValueOnce({ response: 0 })
    expect(await f.choose()).toBe(false)
    expect(f.catalog.readSelection()).toBeNull()
    f.dispose()
  })
  it.each(['projectId', 'repoId', 'hostSetupId', 'workspaceId'] as const)(
    'denies forged %s before confirmation',
    async (field) => {
      const f = fixture()
      expect(
        await f.producer.confirmCandidate(f.window as never, { ...f.candidate, [field]: 'forged' })
      ).toBe(false)
      expect(electron.dialog).not.toHaveBeenCalled()
      f.dispose()
    }
  )
  it('fences A to B to A and PR switches with increasing revisions', async () => {
    const f = fixture()
    await f.choose()
    const a = f.producer.readCurrent().revision
    f.meta.linkedPR = 4
    f.mutate()
    expect(f.catalog.readSelection()).toBeNull()
    expect(
      await f.producer.confirmCandidate(f.window as never, { ...f.candidate, prNumber: 4 })
    ).toBe(true)
    const b = f.producer.readCurrent().revision
    f.meta.linkedPR = 3
    f.mutate()
    await f.choose()
    expect(b).toBeGreaterThan(a)
    expect(f.producer.readCurrent().revision).toBeGreaterThan(b)
    f.dispose()
  })
  it.each(['mutation', 'navigation', 'destroy', 'profile', 'session', 'frame', 'clear', 'dispose'])(
    'discards late native Accept after %s',
    async (change) => {
      const f = fixture()
      let finish!: (result: { response: number }) => void
      electron.dialog.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      const pending = f.choose()
      if (change === 'mutation') {
        f.mutate()
      }
      if (change === 'navigation') {
        f.contents.emit('did-start-navigation')
      }
      if (change === 'destroy') {
        f.window.emit('closed')
      }
      if (change === 'profile') {
        f.changeProfile()
      }
      if (change === 'session') {
        f.contents.session = {}
      }
      if (change === 'frame') {
        f.contents.mainFrame = { ...f.frame }
      }
      if (change === 'clear') {
        f.producer.clear()
      }
      if (change === 'dispose') {
        f.producer.dispose()
      }
      finish({ response: 1 })
      expect(await pending).toBe(false)
      expect(f.catalog.readSelection()).toBeNull()
      f.dispose()
    }
  )
  it('concurrent intent aborts the old dialog and only the latest may publish', async () => {
    const f = fixture()
    const finishes: ((result: { response: number }) => void)[] = []
    electron.dialog.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishes.push(resolve)
        })
    )
    const first = f.choose()
    const second = f.choose()
    finishes[0]({ response: 1 })
    finishes[1]({ response: 1 })
    expect(await first).toBe(false)
    expect(await second).toBe(true)
    f.dispose()
  })
  it('mutation synchronously clears the producer and consumer before returning', async () => {
    const f = fixture()
    await f.choose()
    f.mutate()
    expect(f.producer.readCurrent().candidate).toBeNull()
    expect(f.consumer.readCurrent().selection).toBeNull()
    f.dispose()
  })
  it('new owners never restore an old snapshot after restart', async () => {
    const first = fixture()
    await first.choose()
    const old = first.producer.readCurrent()
    first.dispose()
    const next = fixture()
    expect(old.candidate).not.toBeNull()
    expect(next.producer.readCurrent().candidate).toBeNull()
    expect(next.consumer.readCurrent().selection).toBeNull()
    next.dispose()
  })
  it('cleans listeners and rejects disposed selection', async () => {
    const f = fixture()
    const listener = vi.fn()
    const off = f.producer.subscribeChanges(listener)
    off()
    f.producer.clear()
    expect(listener).not.toHaveBeenCalled()
    f.producer.dispose()
    expect(f.contents.eventNames()).toEqual([])
    expect(f.window.eventNames()).toEqual([])
    expect(await f.choose()).toBe(false)
    f.dispose()
  })
  it('fails closed on reentrant publication', async () => {
    const f = fixture()
    f.producer.subscribeChanges((snapshot) => {
      if (snapshot.candidate) {
        f.producer.clear()
      }
    })
    expect(await f.choose()).toBe(false)
    expect(f.catalog.readSelection()).toBeNull()
    f.dispose()
  })
  it('retires permanently on revision exhaustion', async () => {
    const f = fixture()
    ;(f.producer as unknown as { revision: number }).revision = Number.MAX_SAFE_INTEGER
    f.producer.clear()
    expect(await f.choose()).toBe(false)
    expect(f.catalog.readSelection()).toBeNull()
    f.dispose()
  })
})
