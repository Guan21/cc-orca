import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore, makeRepo, testState } from '../persistence-test-harness'
import type { Store } from '../persistence'
import { MainProjectSourceCatalog } from './project-source-main-catalog'
import { MainProjectSelectionProducer } from './project-source-main-producer'
import { MainProjectSourceSelection } from './project-source-main-selection'

const electron = vi.hoisted(() => ({
  window: null as unknown,
  dialog: vi.fn(),
  popup: vi.fn(),
  template: [] as Electron.MenuItemConstructorOptions[]
}))

vi.mock('electron', () => ({
  app: { isPackaged: true, getPath: () => testState.dir },
  safeStorage: { isEncryptionAvailable: () => false },
  BrowserWindow: {
    fromWebContents: (sender: unknown) =>
      (electron.window as { webContents: unknown })?.webContents === sender ? electron.window : null
  },
  dialog: { showMessageBox: electron.dialog },
  Menu: {
    buildFromTemplate: (template: Electron.MenuItemConstructorOptions[]) => {
      electron.template = template
      return { popup: electron.popup }
    }
  }
}))
vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({ getCohortAtEmit: vi.fn() }))

const stores: Store[] = []
const cleanups: (() => void)[] = []

function fixture(store = createStore()) {
  stores.push(store)
  const repo = makeRepo({
    kind: 'git',
    upstream: { owner: 'owner', repo: 'repo' },
    gitRemoteIdentity: {
      canonicalKey: 'github.com/owner/repo',
      remoteName: 'origin',
      remoteUrl: 'https://github.com/owner/repo.git'
    }
  })
  if (store.getRepos().length === 0) {
    store.addRepo(repo)
    const project = store.getProjects()[0]!
    const setup = store.getProjectHostSetups()[0]!
    store.setWorktreeMetaForHost(`${repo.id}::${repo.path}/w`, 'local', {
      instanceId: 'instance-1',
      projectId: project.id,
      hostId: 'local',
      projectHostSetupId: setup.id,
      linkedPR: 42
    })
  }
  const catalog = new MainProjectSourceCatalog(store)
  const frame = {
    processId: 10,
    routingId: 20,
    url: 'file:///app/index.html',
    isDestroyed: () => false
  }
  const contents = Object.assign(new EventEmitter(), {
    id: 30,
    session: {},
    mainFrame: frame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false
  })
  const window = Object.assign(new EventEmitter(), {
    id: 40,
    webContents: contents,
    isDestroyed: () => false
  })
  electron.window = window
  const producer = new MainProjectSelectionProducer({
    catalog,
    expectedDocumentUrl: frame.url,
    currentAppProfile: () => 'personal',
    currentProfileIdentity: () => 'offline-profile'
  })
  producer.attachMainWindow(window as never)
  const consumer = new MainProjectSourceSelection(catalog, producer)
  const dispose = () => {
    producer.dispose()
    consumer.dispose()
    catalog.dispose()
  }
  cleanups.push(dispose)
  return {
    store,
    repo,
    catalog,
    producer,
    consumer,
    contents,
    window,
    dispose,
    candidate: () => catalog.listSelectionCandidates()[0]!,
    choose: () => producer.confirmCandidate(window as never, catalog.listSelectionCandidates()[0]!)
  }
}

describe('production Main selection with actual persisted Main Store', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'devcrew-producer-store-'))
    vi.clearAllMocks()
    electron.dialog.mockResolvedValue({ response: 1 })
    electron.template = []
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
    for (const store of stores.splice(0)) {
      store.freezeWrites()
    }
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('selects actual Store identity through the Main native picker and separate confirmation', async () => {
    const f = fixture()
    const before = f.producer.readCurrent().revision
    expect(f.catalog.readSelection()).toBeNull()
    f.producer.openPicker(f.window as never)
    expect(electron.popup).toHaveBeenCalledWith({ window: f.window })
    const item = electron.template.find((entry) => entry.label?.includes('PR #42'))!
    expect(item).toBeDefined()
    await item.click!(null as never, f.window as never, {} as never)
    expect(electron.dialog).toHaveBeenCalledWith(
      f.window,
      expect.objectContaining({
        defaultId: 0,
        cancelId: 0,
        detail: expect.stringContaining('owner/repo')
      })
    )
    expect(f.producer.readCurrent().revision).toBeGreaterThan(before)
    expect(f.consumer.readCurrent()).toMatchObject({ status: 'selected', selection: f.candidate() })
    expect(f.catalog.readSelection()).toMatchObject(f.candidate())
  })

  it('synchronously revokes actual Store mutations and repository rebinding', async () => {
    const f = fixture()
    expect(await f.choose()).toBe(true)
    const selectedRevision = f.producer.readCurrent().revision
    f.store.updateRepo(f.repo.id, { displayName: 'changed' })
    expect(f.producer.readCurrent().candidate).toBeNull()
    expect(f.catalog.readSelection()).toBeNull()
    expect(f.consumer.readCurrent().selection).toBeNull()
    expect(f.producer.readCurrent().revision).toBeGreaterThan(selectedRevision)
    expect(await f.choose()).toBe(true)
    f.store.updateRepo(f.repo.id, { upstream: { owner: 'different', repo: 'repo' } })
    expect(f.producer.readCurrent().candidate).toBeNull()
    expect(f.catalog.readSelection()).toBeNull()
  })

  it('requires fresh confirmation after same-name project deletion and reconstruction', async () => {
    const f = fixture()
    const candidate = f.candidate()
    const name = f.store.getProjects()[0]!.displayName
    expect(await f.choose()).toBe(true)
    f.store.removeProject(f.repo.id)
    f.store.addRepo(f.repo)
    expect(f.store.getProjects()[0]!.displayName).toBe(name)
    expect(f.producer.readCurrent().candidate).toBeNull()
    expect(f.catalog.readSelection()).toBeNull()
    const project = f.store.getProjects()[0]!
    const setup = f.store.getProjectHostSetups()[0]!
    f.store.setWorktreeMetaForHost(candidate.workspaceId, 'local', {
      instanceId: 'recreated-instance',
      projectId: project.id,
      projectHostSetupId: setup.id,
      hostId: 'local',
      linkedPR: 42
    })
    expect(f.consumer.readCurrent().selection).toBeNull()
    expect(electron.dialog).toHaveBeenCalledTimes(1)
    expect(await f.choose()).toBe(true)
    expect(electron.dialog).toHaveBeenCalledTimes(2)
  })

  it('retires replaced Worktree instances and PR changes before a new Main selection', async () => {
    const f = fixture()
    expect(await f.choose()).toBe(true)
    const a = f.producer.readCurrent().revision
    f.store.setWorktreeMetaForHost(f.candidate().workspaceId, 'local', { instanceId: 'instance-2' })
    expect(f.producer.readCurrent().candidate).toBeNull()
    expect(await f.choose()).toBe(true)
    const b = f.producer.readCurrent().revision
    const workspace = f.candidate().workspaceId
    f.store.setWorktreeMetaForHost(workspace, 'local', { linkedPR: 43 })
    expect(f.consumer.readCurrent().selection).toBeNull()
    expect(await f.choose()).toBe(true)
    expect(f.catalog.readSelection()?.prNumber).toBe(43)
    f.store.setWorktreeMetaForHost(workspace, 'local', { linkedPR: 42 })
    expect(f.producer.readCurrent().candidate).toBeNull()
    expect(await f.choose()).toBe(true)
    expect(f.catalog.readSelection()?.prNumber).toBe(42)
    expect(b).toBeGreaterThan(a)
    expect(f.producer.readCurrent().revision).toBeGreaterThan(b)
  })

  it('aborts pending native confirmation on actual Store mutation and discards delayed Accept', async () => {
    const f = fixture()
    const gate = Promise.withResolvers<{ response: number }>()
    electron.dialog.mockReturnValueOnce(gate.promise)
    const result = f.choose()
    const options = electron.dialog.mock.calls[0][1]
    f.store.updateRepo(f.repo.id, { displayName: 'pending selection retired' })
    expect(options.signal.aborted).toBe(true)
    gate.resolve({ response: 1 })
    expect(await result).toBe(false)
    expect(f.producer.readCurrent().candidate).toBeNull()
    expect(f.catalog.readSelection()).toBeNull()
  })

  it('retires selection synchronously across global runtime A to B to A', async () => {
    const f = fixture()
    expect(await f.choose()).toBe(true)
    const revision = f.producer.readCurrent().revision
    f.store.updateSettings({ localWindowsRuntimeDefault: { kind: 'wsl', distro: 'Ubuntu' } })
    expect(f.catalog.readSelection()).toBeNull()
    expect(f.producer.readCurrent().candidate).toBeNull()
    f.store.updateSettings({ localWindowsRuntimeDefault: { kind: 'windows-host' } })
    expect(f.consumer.readCurrent().selection).toBeNull()
    expect(f.producer.readCurrent().revision).toBeGreaterThan(revision)
    expect(await f.choose()).toBe(true)
    expect(electron.dialog).toHaveBeenCalledTimes(2)
  })

  it('aborts pending consent when the project runtime changes before returning to native', async () => {
    const f = fixture()
    const gate = Promise.withResolvers<{ response: number }>()
    electron.dialog.mockReturnValueOnce(gate.promise)
    const result = f.choose()
    const projectId = f.store.getProjects()[0]!.id
    f.store.updateProject(projectId, {
      localWindowsRuntimePreference: { kind: 'wsl', distro: 'Ubuntu' }
    })
    expect(electron.dialog.mock.calls[0][1].signal.aborted).toBe(true)
    f.store.updateProject(projectId, { localWindowsRuntimePreference: { kind: 'windows-host' } })
    gate.resolve({ response: 1 })
    expect(await result).toBe(false)
    expect(f.consumer.readCurrent().selection).toBeNull()
  })

  it('cleans native listeners and restarts from persisted Store without restoring selection', async () => {
    const f = fixture()
    expect(await f.choose()).toBe(true)
    f.store.flushOrThrow()
    f.store.freezeWrites()
    f.dispose()
    expect(f.window.listenerCount('closed')).toBe(0)
    for (const event of [
      'destroyed',
      'did-start-navigation',
      'will-navigate',
      'did-navigate',
      'render-process-gone'
    ]) {
      expect(f.contents.listenerCount(event)).toBe(0)
    }
    const restarted = fixture(createStore())
    expect(restarted.catalog.listSelectionCandidates()).not.toHaveLength(0)
    expect(restarted.producer.readCurrent().candidate).toBeNull()
    expect(restarted.consumer.readCurrent().selection).toBeNull()
    expect(restarted.catalog.readSelection()).toBeNull()
    expect(electron.dialog).toHaveBeenCalledTimes(1)
    expect(await restarted.choose()).toBe(true)
  })
})
