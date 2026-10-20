import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore, makeRepo, testState } from '../persistence-test-harness'
import type { Store } from '../persistence'
import { MainProjectSourceCatalog } from './project-source-main-catalog'
import { MainRegisteredSelectedPrRepository } from './project-source-main-repository-registration'
import type { MainVerifiedRepositoryIdentity } from './project-source-main-repository-registration'
import { MainSelectedPrGrantRegistry } from './project-source-grant-registry'

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
  const input = makeRepo({
    kind: 'git',
    path: join(testState.dir, 'repo'),
    upstream: { owner: 'owner', repo: 'repo' },
    symlinkPaths: ['original'],
    gitRemoteIdentity: {
      canonicalKey: 'github.com/owner/repo',
      remoteName: 'origin',
      remoteUrl: 'https://github.com/owner/repo.git'
    }
  })
  store.addRepo(input)
  const project = store.getProjects()[0]!
  const setup = store.getProjectHostSetups()[0]!
  const workspaceId = `${input.id}::${join(input.path, 'w')}`
  const meta = {
    instanceId: 'instance-1',
    projectId: project.id,
    hostId: 'local' as const,
    projectHostSetupId: setup.id,
    priorWorktreeIds: ['old']
  }
  const result = store.setWorktreeMetaForHost(workspaceId, 'local', meta)
  const catalog = new MainProjectSourceCatalog(store)
  catalogs.push(catalog)
  const selection = {
    projectId: project.id,
    repoId: input.id,
    hostSetupId: setup.id,
    workspaceKind: 'worktree' as const,
    workspaceId,
    prNumber: 42
  }
  return { store, input, project, setup, workspaceId, meta, result, catalog, selection }
}
beforeEach(() => {
  testState.dir = mkdtempSync(join(tmpdir(), 'devcrew-ownership-'))
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

describe('actual Store source-record ownership', () => {
  it.each(['project', 'setup', 'repo input', 'repo list', 'repo single'] as const)(
    'detaches %s and its nested values from canonical records',
    (kind) => {
      const f = fixture()
      const before = f.catalog.readCatalog()
      if (kind === 'project') {
        f.project.sourceRepoIds.length = 0
        f.project.providerIdentity!.owner = 'other'
      } else if (kind === 'setup') {
        f.setup.executionHostId = 'ssh:other'
      } else if (kind === 'repo input') {
        f.input.path = '/other'
        f.input.symlinkPaths!.push('other')
      } else {
        const repo = kind === 'repo list' ? f.store.getRepos()[0]! : f.store.getRepo(f.input.id)!
        repo.path = '/other'
        repo.symlinkPaths!.push('other')
      }
      expect(f.catalog.readCatalog()).toEqual(before)
      expect(f.catalog.selectCurrent(f.selection)).toBe(true)
    }
  )
  it.each(['legacy', 'host', 'strict', 'all', 'host all', 'write result'] as const)(
    'detaches %s Worktree metadata including nested arrays',
    (kind) => {
      const f = fixture()
      const before = f.store.getUnambiguousWorktreeMetaForHost(f.workspaceId, 'local')!
      const expected = structuredClone(before)
      const records = {
        legacy: () => f.store.getWorktreeMeta(f.workspaceId)!,
        host: () => f.store.getWorktreeMetaForHost(f.workspaceId, 'local')!,
        strict: () => before,
        all: () => f.store.getAllWorktreeMeta()[f.workspaceId]!,
        'host all': () => f.store.getAllWorktreeMetaForHost('local')[f.workspaceId]!,
        'write result': () => f.result
      }
      const leaked = records[kind]()
      leaked.instanceId = 'other-instance'
      leaked.priorWorktreeIds!.push('other')
      expect(f.store.getUnambiguousWorktreeMetaForHost(f.workspaceId, 'local')).toEqual(expected)
      expect(f.catalog.selectCurrent(f.selection)).toBe(true)
    }
  )
  it('copies admitted metadata and legacy setter results without sharing nested values', () => {
    const f = fixture()
    const patch = { priorWorktreeIds: ['owned'] }
    const result = f.store.setWorktreeMeta(f.workspaceId, patch)
    patch.priorWorktreeIds.push('input mutation')
    result.priorWorktreeIds!.push('result mutation')
    expect(f.store.getWorktreeMeta(f.workspaceId)?.priorWorktreeIds).toEqual(['owned'])
    f.meta.priorWorktreeIds.push('retained host input')
    expect(f.store.getWorktreeMeta(f.workspaceId)?.priorWorktreeIds).toEqual(['owned'])
  })
  it('owns host metadata inputs before any subsequent write', () => {
    const f = fixture()
    f.meta.priorWorktreeIds.push('retained input mutation')
    expect(f.store.getWorktreeMetaForHost(f.workspaceId, 'local')?.priorWorktreeIds).toEqual([
      'old'
    ])
  })
  it('detaches unhosted legacy inputs, setter results, getters and maps', () => {
    const f = fixture()
    const id = `${f.input.id}::${join(f.input.path, 'legacy')}`
    const input = { priorWorktreeIds: ['old'] }
    const result = f.store.setWorktreeMeta(id, input)
    input.priorWorktreeIds.push('input')
    result.priorWorktreeIds!.push('result')
    f.store.getWorktreeMeta(id)!.priorWorktreeIds!.push('getter')
    f.store.getAllWorktreeMeta()[id]!.priorWorktreeIds!.push('map')
    expect(f.store.getWorktreeMeta(id)?.priorWorktreeIds).toEqual(['old'])
  })
  it('detaches updateRepo inputs and results from later writes', () => {
    const f = fixture()
    const patch = { symlinkPaths: ['update'] }
    const result = f.store.updateRepo(f.input.id, patch)!
    patch.symlinkPaths.push('input mutation')
    result.symlinkPaths!.push('result mutation')
    expect(f.store.getRepo(f.input.id)?.symlinkPaths).toEqual(['update'])
  })
  it('detaches the alternate Repo result returned when moving a project group', () => {
    const f = fixture()
    const result = f.store.moveProjectToGroup(f.input.id, null)!
    result.symlinkPaths!.push('mutated group result')
    expect(f.store.getRepo(f.input.id)?.symlinkPaths).toEqual(['original'])
  })
  it('detaches updateProject results including sourceRepoIds', () => {
    const f = fixture()
    const result = f.store.updateProject(f.project.id, {
      localWindowsRuntimePreference: { kind: 'windows-host' }
    })!
    result.sourceRepoIds.length = 0
    expect(f.store.getProjects()[0]?.sourceRepoIds).toEqual([f.input.id])
  })
  it('owns nested Project runtime-preference inputs and results', () => {
    const f = fixture()
    const input = { localWindowsRuntimePreference: { kind: 'wsl' as const, distro: 'Ubuntu' } }
    const result = f.store.updateProject(f.project.id, input)!
    input.localWindowsRuntimePreference.distro = 'Other'
    if (result.localWindowsRuntimePreference?.kind === 'wsl') {
      result.localWindowsRuntimePreference.distro = 'Mutated'
    }
    expect(f.store.getProjects()[0]?.localWindowsRuntimePreference).toEqual({
      kind: 'wsl',
      distro: 'Ubuntu'
    })
  })
  it.each(['create', 'update', 'delete'] as const)('detaches %s HostSetup results', (operation) => {
    const f = fixture()
    const created = f.store.createProjectHostSetup({
      projectId: f.project.id,
      hostId: 'ssh:other',
      path: '/other',
      setupState: 'not-set-up'
    })!
    const result =
      operation === 'create'
        ? created
        : operation === 'update'
          ? f.store.updateProjectHostSetup({
              setupId: created.setup.id,
              updates: { displayName: 'updated' }
            })!
          : f.store.deleteProjectHostSetup({ setupId: created.setup.id })!
    const before = f.catalog.readCatalog()
    result.project.sourceRepoIds.length = 0
    result.setup.hostId = 'local'
    expect(f.catalog.readCatalog()).toEqual(before)
  })
  it('detaches repo-backed HostSetup update results', () => {
    const f = fixture()
    const result = f.store.updateProjectHostSetup({ setupId: f.setup.id, updates: {} })!
    const before = f.catalog.readCatalog()
    result.project.sourceRepoIds.length = 0
    result.setup.executionHostId = 'ssh:other'
    result.repo!.symlinkPaths!.push('other')
    expect(f.catalog.readCatalog()).toEqual(before)
  })
  it('does not expose canonical source records through metadata scan expectations', () => {
    const f = fixture()
    const scan = f.store.captureNativeLocalWorktreeMetadataScanExpectation(f.input)
    const before = f.catalog.readCatalog()
    scan.repo.expectedRepo!.path = '/other'
    scan.routing.expectedProject!.sourceRepoIds.length = 0
    const row = scan.metadata[0]!
    row.expectedLegacy.expectedMeta!.instanceId = 'other-instance'
    row.expectedAliases[0]!.expectedIdentityRows[0]!.expectedMeta!.projectId = 'other-project'
    expect(f.catalog.readCatalog()).toEqual(before)
    expect(f.catalog.selectCurrent(f.selection)).toBe(true)
  })
  it('cannot mutate canonical metadata through the legacy all-rows map', () => {
    const f = fixture()
    delete f.store.getAllWorktreeMeta()[f.workspaceId]
    expect(f.store.getWorktreeMeta(f.workspaceId)?.instanceId).toBe('instance-1')
  })
  it.each(['cloned', 'mutated', 'foreign', 'forged row'] as const)(
    'refuses %s metadata scan deletion proof',
    (kind) => {
      const f = fixture()
      const original = f.store.captureNativeLocalWorktreeMetadataScanExpectation(f.input)
      const scan = kind === 'cloned' ? structuredClone(original) : original
      let missing = scan.metadata
      if (kind === 'mutated') {
        scan.metadata[0]!.expectedLegacy.expectedMeta!.instanceId = 'forged'
      }
      if (kind === 'forged row') {
        missing = structuredClone(scan.metadata)
      }
      if (kind === 'foreign') {
        const other = createStore()
        stores.push(other)
        expect(other.pruneSessionlessMissingLocalWorktreeMetadataForRepo(scan, missing)).toEqual([])
      } else {
        expect(f.store.pruneSessionlessMissingLocalWorktreeMetadataForRepo(scan, missing)).toEqual(
          []
        )
      }
      expect(f.store.getWorktreeMeta(f.workspaceId)?.instanceId).toBe('instance-1')
    }
  )
  it('returns detached probe candidates while retaining original identity checks for valid pruning', () => {
    const f = fixture()
    const scan = f.store.captureNativeLocalWorktreeMetadataScanExpectation(f.input)
    const candidates = f.store.selectProbeableLocalWorktreeMetadataCandidates(scan)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toBe(scan.metadata[0])
    expect(f.store.pruneSessionlessMissingLocalWorktreeMetadataForRepo(scan, candidates)).toEqual([
      f.workspaceId
    ])
    expect(f.store.getWorktreeMeta(f.workspaceId)).toBeUndefined()
    expect(f.store.getUnambiguousWorktreeMetaForHost(f.workspaceId, 'local')).toBeUndefined()
  })
  it('refuses a stale scan after a supported same-ID instance replacement', () => {
    const f = fixture()
    const scan = f.store.captureNativeLocalWorktreeMetadataScanExpectation(f.input)
    f.store.setWorktreeMetaForHost(f.workspaceId, 'local', { instanceId: 'replacement' })
    expect(
      f.store.pruneSessionlessMissingLocalWorktreeMetadataForRepo(scan, scan.metadata)
    ).toEqual([])
    expect(f.store.getWorktreeMeta(f.workspaceId)?.instanceId).toBe('replacement')
  })
  it('isolates retained records during pending registration and still revokes supported ABA writes', async () => {
    const f = fixture()
    expect(f.catalog.selectCurrent(f.selection)).toBe(true)
    const gate = Promise.withResolvers<MainVerifiedRepositoryIdentity | null>()
    const verify = vi.fn((_repo: unknown, _signal: AbortSignal) => gate.promise)
    const request = new MainRegisteredSelectedPrRepository({
      readCatalog: () => f.catalog.readCatalog(),
      readSelection: () => f.catalog.readSelection(),
      readPrincipal: () => ({ principalId: 'offline', credentialGeneration: 1 }),
      isCurrentWorktree: (selection) => f.catalog.isCurrentWorktree(selection),
      verifyRepository: verify
    })
    f.catalog.subscribe(() => request.retireAll())
    const pending = request.registerSelected()
    expect(verify).toHaveBeenCalledOnce()
    const selected = f.catalog.readSelection()
    f.setup.executionHostId = 'ssh:other'
    expect(f.store.getProjectHostSetups()[0]?.executionHostId).not.toBe('ssh:other')
    f.setup.executionHostId = 'local'
    expect(f.catalog.readSelection()).toEqual(selected)
    f.store.updateRepo(f.input.id, { displayName: 'B' })
    f.store.updateRepo(f.input.id, { displayName: 'test' })
    expect(verify.mock.calls[0]![1].aborted).toBe(true)
    gate.resolve({
      host: 'github.com',
      id: 42,
      nodeId: 'R_FIXTURE',
      nameWithOwner: 'owner/repo',
      principalId: 'offline',
      credentialGeneration: 1
    })
    expect(await pending).toBe('stale')
    expect(request.currentBinding()).toBeNull()
  })
  it('aborts a granted pending read synchronously on actual Store mutation, without debounce', async () => {
    const f = fixture()
    expect(f.catalog.selectCurrent(f.selection)).toBe(true)
    const registry = new MainSelectedPrGrantRegistry(async () => true)
    f.catalog.subscribe(() => registry.retireAll())
    const document = {
      profile: 'personal-packaged' as const,
      executionRealm: 'native' as const,
      installationId: 'offline-test',
      windowId: 1,
      webContentsId: 2,
      frameProcessId: 3,
      frameRoutingId: 4,
      documentId: 'doc',
      sessionPartition: 'session',
      principalId: 'offline',
      credentialGeneration: 1
    }
    expect(
      registry.select(document, {
        ...f.selection,
        executionHostId: 'local',
        repository: {
          host: 'github.com',
          id: 42,
          nodeId: 'R_FIXTURE',
          owner: 'owner',
          name: 'repo'
        }
      })
    ).toBe(true)
    expect(await registry.requestGrant(() => document)).toBe(true)
    const gate = Promise.withResolvers<string>()
    const load = vi.fn((_binding: unknown, _signal: AbortSignal) => gate.promise)
    const deliver = vi.fn()
    const pending = registry.run(() => document, load, deliver)
    f.store.setWorktreeMetaForHost(f.workspaceId, 'local', { instanceId: 'new-instance' })
    expect(load.mock.calls[0]![1].aborted).toBe(true)
    gate.resolve('old project payload')
    expect(await pending).toEqual({ status: 'revoked' })
    expect(deliver).not.toHaveBeenCalled()
    expect(f.catalog.readSelection()).toBeNull()
  })
})
