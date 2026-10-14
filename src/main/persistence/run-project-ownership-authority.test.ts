import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'orca-test',
    getVersion: () => '0.0.0-test',
    isPackaged: false,
    on: () => {},
    whenReady: () => Promise.resolve()
  },
  safeStorage: { isEncryptionAvailable: () => false },
  ipcMain: { on: () => {}, handle: () => {} },
  BrowserWindow: { getAllWindows: () => [] }
}))

const { Store } = await import('./loading-store/store')
const stores: InstanceType<typeof Store>[] = []
const directories: string[] = []

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.freezeWrites()
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})

function createStore(): InstanceType<typeof Store> {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-run-ownership-')))
  directories.push(directory)
  const store = new Store({ dataFile: join(directory, 'orca-data.json') })
  stores.push(store)
  return store
}

function repo(directory: string): Repo {
  return {
    id: 'repo',
    path: join(directory, 'checkout'),
    displayName: 'checkout',
    badgeColor: 'blue',
    kind: 'git',
    executionHostId: 'local',
    upstream: { owner: 'acme', repo: 'project-a' },
    addedAt: 1
  }
}

describe('Run creation catalog ownership evidence', () => {
  it('can return to identical setup ownership after Project A → B → A', () => {
    const store = createStore()
    store.addRepo(repo(tmpdir()))
    const original = structuredClone(store.getProjectHostSetups()[0])

    store.updateRepo('repo', { upstream: { owner: 'acme', repo: 'project-b' } }, 'local')
    expect(store.getProjectHostSetups()[0].projectId).toBe('github:acme/project-b')
    store.updateRepo('repo', { upstream: { owner: 'acme', repo: 'project-a' } }, 'local')

    // A snapshot equality check cannot detect intervening ownership changes.
    expect(store.getProjectHostSetups()[0]).toEqual(original)
  })

  it('keeps setup identity across host changes and allows path changes without an ownership epoch', () => {
    const store = createStore()
    const originalRepo = repo(tmpdir())
    store.addRepo(originalRepo)
    const original = structuredClone(store.getProjectHostSetups()[0])
    store.updateRepo('repo', { executionHostId: 'ssh:other' }, 'local')
    expect(store.getProjectHostSetups()[0]).toMatchObject({
      id: original.id,
      projectId: original.projectId,
      hostId: 'ssh:other'
    })
    store.updateRepo('repo', { executionHostId: 'local' }, 'ssh:other')
    expect(store.getProjectHostSetups()[0]).toEqual(original)

    const independent = store.createProjectHostSetup({
      projectId: original.projectId,
      hostId: 'ssh:independent',
      path: originalRepo.path
    })!
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    const changedPath = join(tmpdir(), 'other-checkout')
    const changed = store.updateProjectHostSetup({
      setupId: independent.setup.id,
      updates: { path: changedPath }
    })!
    expect(changed.setup).toMatchObject({ path: changedPath, updatedAt: 1234 })
    const restored = store.updateProjectHostSetup({
      setupId: independent.setup.id,
      updates: { path: originalRepo.path }
    })!
    expect(restored.setup).toMatchObject({
      path: originalRepo.path,
      updatedAt: 1234
    })
  })

  it('accepts host-qualified workspace ownership metadata without terminal launch provenance', () => {
    const store = createStore()
    const worktreeId = `repo::${join(tmpdir(), 'workspace')}`
    const original = store.setWorktreeMetaForHost(worktreeId, 'local', {
      instanceId: 'checkout-instance',
      projectId: 'project-a',
      projectHostSetupId: 'setup-a'
    })
    const captured = structuredClone(original)
    store.setWorktreeMetaForHost(worktreeId, 'local', {
      projectId: 'project-b',
      projectHostSetupId: 'setup-b'
    })
    expect(store.getWorktreeMetaForHost(worktreeId, 'local')).toMatchObject({
      instanceId: 'checkout-instance',
      projectId: 'project-b'
    })
    store.setWorktreeMetaForHost(worktreeId, 'local', {
      projectId: 'project-a',
      projectHostSetupId: 'setup-a'
    })
    expect(store.getWorktreeMetaForHost(worktreeId, 'local')).toEqual(captured)
    expect(store.getProjects()).toEqual([])
    expect(store.getProjectHostSetups()).toEqual([])
  })

  it('creates a folder workspace through a sidebar group without any Project ownership record', () => {
    const store = createStore()
    const group = store.createProjectGroup({
      name: 'Folder group',
      parentPath: tmpdir(),
      createdFrom: 'manual'
    })
    const folder = store.createFolderWorkspace({ projectGroupId: group.id })

    expect(folder.projectGroupId).toBe(group.id)
    expect(store.getFolderWorkspace(folder.id)).toEqual(folder)
    expect(store.getProjects()).toEqual([])
    expect(store.getProjectHostSetups()).toEqual([])
    expect(store.getRepos()).toEqual([])
  })
})
