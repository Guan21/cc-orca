import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createStore,
  makeRepo,
  readDataFile,
  testState,
  writeDataFile
} from '../persistence-test-harness'
import type { Store } from '../persistence'
import type { PersistedState } from '../../shared/persisted-state-types'
import { canonicalWorktreeIdentity } from '../../shared/worktree/identity'
import { composeWorktreeHostIdentity } from '../../shared/worktree/host-qualified-identity'
import { MainProjectSourceCatalog } from './project-source-main-catalog'
import {
  MainRegisteredSelectedPrRepository,
  type MainVerifiedRepositoryIdentity
} from './project-source-main-repository-registration'

vi.mock('electron', () => ({
  app: { getPath: () => testState.dir },
  safeStorage: { isEncryptionAvailable: () => false }
}))
vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({ getCohortAtEmit: vi.fn() }))

const stores: Store[] = []
const catalogs: MainProjectSourceCatalog[] = []

function fixture() {
  const store = createStore()
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
  store.addRepo(repo)
  const project = store.getProjects()[0]!
  const setup = store.getProjectHostSetups()[0]!
  const workspaceId = `${repo.id}::${repo.path}/w`
  store.setWorktreeMetaForHost(workspaceId, 'local', {
    instanceId: 'instance-1',
    projectId: project.id,
    hostId: 'local',
    projectHostSetupId: setup.id
  })
  const catalog = new MainProjectSourceCatalog(store)
  catalogs.push(catalog)
  const selected = {
    projectId: project.id,
    repoId: repo.id,
    hostSetupId: setup.id,
    workspaceKind: 'worktree' as const,
    workspaceId,
    prNumber: 42
  }
  return { store, project, setup, repo, catalog, selected }
}

describe('Task A actual Main Store boundary (no gh/credential provider)', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'devcrew-catalog-'))
  })
  afterEach(() => {
    for (const catalog of catalogs.splice(0)) {
      catalog.dispose()
    }
    for (const store of stores.splice(0)) {
      store.freezeWrites()
    }
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('reads actual Store records, but never derives a selection or grant from their presence', () => {
    const f = fixture()
    expect(f.catalog.readCatalog().projects).toEqual(f.store.getProjects())
    expect(f.catalog.readSelection()).toBeNull()
    expect(f.catalog.selectCurrent(f.selected)).toBe(true)
    expect(f.catalog.readSelection()?.workspaceId).toBe(f.selected.workspaceId)
  })

  it('retires old selection before a debounced Store A→B→A becomes invisible', () => {
    const f = fixture()
    expect(f.catalog.selectCurrent(f.selected)).toBe(true)
    f.store.updateRepo(f.repo.id, { displayName: 'B' })
    f.store.updateRepo(f.repo.id, { displayName: f.repo.displayName })
    expect(f.catalog.readSelection()).toBeNull()
    expect(f.catalog.selectCurrent(f.selected)).toBe(true)
  })

  it('does not revive registration scope after same-ID Project deletion and recreation', () => {
    const f = fixture()
    expect(f.catalog.selectCurrent(f.selected)).toBe(true)
    f.store.removeProject(f.repo.id)
    expect(f.store.getProjects().some((project) => project.id === f.project.id)).toBe(false)
    f.store.addRepo(f.repo)
    expect(f.catalog.readSelection()).toBeNull()
  })

  it('retires selection when Repository identity rebinds the actual HostSetup', () => {
    const f = fixture()
    expect(f.catalog.selectCurrent(f.selected)).toBe(true)
    f.store.updateRepo(f.repo.id, { upstream: { owner: 'other-owner', repo: 'repo' } })
    expect(f.store.getProjectHostSetups()[0]?.projectId).not.toBe(f.project.id)
    expect(f.catalog.readSelection()).toBeNull()
  })

  it('retires on Worktree instance replacement and remote host metadata writes', () => {
    const f = fixture()
    expect(f.catalog.selectCurrent(f.selected)).toBe(true)
    f.store.setWorktreeMetaForHost(f.selected.workspaceId, 'local', { instanceId: 'instance-2' })
    expect(f.catalog.readSelection()).toBeNull()
    expect(f.catalog.selectCurrent(f.selected)).toBe(true)
    f.store.setWorktreeMetaForHost(f.selected.workspaceId, 'ssh:remote', {
      instanceId: 'remote-instance',
      hostId: 'ssh:remote'
    })
    expect(f.catalog.readSelection()).toBeNull()
  })

  it('starts a replacement catalog empty and cannot restore the old selection', () => {
    const f = fixture()
    expect(f.catalog.selectCurrent(f.selected)).toBe(true)
    f.store.flushOrThrow()
    f.store.freezeWrites()
    f.catalog.dispose()
    const restartedStore = createStore()
    stores.push(restartedStore)
    const replacement = new MainProjectSourceCatalog(restartedStore)
    catalogs.push(replacement)
    expect(replacement.readCatalog().projects).not.toHaveLength(0)
    expect(replacement.readSelection()).toBeNull()
    expect(f.catalog.selectCurrent(f.selected)).toBe(false)
  })

  it('denies competing actual Store incarnations instead of trusting the listing winner', () => {
    const f = fixture()
    f.store.flushOrThrow()
    f.store.freezeWrites()
    const state = readDataFile() as PersistedState
    const alias = composeWorktreeHostIdentity('local', f.selected.workspaceId)
    const original = state.worktreeIdentityAliases![alias]![0]!
    const competing = canonicalWorktreeIdentity({
      worktreeId: f.selected.workspaceId,
      executionHostId: 'local',
      instanceId: 'competing'
    })
    state.worktreeMetaByIdentity![competing] = {
      ...state.worktreeMetaByIdentity![original]!,
      instanceId: 'competing',
      lastActivityAt: 999_999
    }
    state.worktreeIdentityAliases![alias] = [original, competing]
    writeDataFile(state)
    const reopened = createStore()
    stores.push(reopened)
    expect(reopened.getWorktreeMetaForHost(f.selected.workspaceId, 'local')?.instanceId).toBe(
      'competing'
    )
    expect(
      reopened.getUnambiguousWorktreeMetaForHost(f.selected.workspaceId, 'local')
    ).toBeUndefined()
    const catalog = new MainProjectSourceCatalog(reopened)
    catalogs.push(catalog)
    expect(catalog.selectCurrent(f.selected)).toBe(false)
  })

  it('aborts pending registration on a real Store mutation and discards its delayed answer', async () => {
    const f = fixture()
    expect(f.catalog.selectCurrent(f.selected)).toBe(true)
    const gate = Promise.withResolvers<MainVerifiedRepositoryIdentity | null>()
    const verify = vi.fn((_repo: unknown, _signal: AbortSignal) => gate.promise)
    const registration = new MainRegisteredSelectedPrRepository({
      readCatalog: () => f.catalog.readCatalog(),
      readSelection: () => f.catalog.readSelection(),
      readPrincipal: () => ({ principalId: 'fake-offline-principal', credentialGeneration: 1 }),
      isCurrentWorktree: (selected) => f.catalog.isCurrentWorktree(selected),
      verifyRepository: verify
    })
    f.catalog.subscribe(() => registration.retireAll())
    const result = registration.registerSelected()
    expect(verify).toHaveBeenCalledOnce()
    f.store.updateRepo(f.repo.id, { displayName: 'changed' })
    expect(verify.mock.calls[0][1].aborted).toBe(true)
    gate.resolve({
      host: 'github.com',
      id: 42,
      nodeId: 'R_OFFLINE_FIXTURE',
      nameWithOwner: 'owner/repo',
      principalId: 'fake-offline-principal',
      credentialGeneration: 1
    })
    expect(await result).toBe('stale')
    expect(registration.currentBinding()).toBeNull()
  })
})
