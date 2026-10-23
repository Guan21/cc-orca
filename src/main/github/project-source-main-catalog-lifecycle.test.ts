import { describe, expect, it, vi } from 'vitest'
import type { Project, ProjectHostSetup } from '../../shared/project-types'
import type { Repo } from '../../shared/repo-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { MainProjectSourceCatalog } from './project-source-main-catalog'

function fixture() {
  const project: Project = {
    id: 'p',
    displayName: 'same label',
    badgeColor: 'blue',
    sourceRepoIds: ['r'],
    createdAt: 1,
    updatedAt: 1,
    providerIdentity: { provider: 'github', owner: 'owner', repo: 'repo' }
  }
  const repo: Repo = {
    id: 'r',
    path: '/repo',
    displayName: 'same label',
    badgeColor: 'blue',
    kind: 'git',
    addedAt: 1
  }
  const setup: ProjectHostSetup = {
    id: 's',
    projectId: 'p',
    repoId: 'r',
    path: '/repo',
    hostId: 'local',
    displayName: 'same label',
    setupState: 'ready',
    setupMethod: 'cloned',
    createdAt: 1,
    updatedAt: 1
  }
  const meta = {
    instanceId: 'incarnation-1',
    projectId: 'p',
    projectHostSetupId: 's',
    hostId: 'local'
  } as WorktreeMeta
  const mutations = new Set<() => void>()
  const store = {
    getSettings: () => ({ localWindowsRuntimeDefault: { kind: 'windows-host' as const } }),
    getProjects: () => [project],
    getProjectHostSetups: () => [setup],
    getRepos: () => [repo],
    getWorktreeMeta: () => meta,
    getUnambiguousWorktreeMetaForHost: vi.fn(() => meta),
    subscribeMutations: (listener: () => void) => {
      mutations.add(listener)
      return () => {
        mutations.delete(listener)
      }
    }
  }
  const catalog = new MainProjectSourceCatalog(store)
  const selection = {
    projectId: 'p',
    repoId: 'r',
    hostSetupId: 's',
    workspaceKind: 'worktree' as const,
    workspaceId: 'r::/repo/w',
    prNumber: 42
  }
  const mutate = () => {
    const listeners = [...mutations]
    for (const listener of listeners) {
      listener()
    }
  }
  return { catalog, store, mutations, mutate, selection, project, repo, setup, meta }
}

describe('Task A native catalog lifecycle and real workspace identity', () => {
  it('bounds nested retirement and still visits independent listeners', () => {
    const f = fixture()
    const nested = vi.fn(() => f.catalog.invalidate())
    const independent = vi.fn()
    f.catalog.subscribe(nested)
    f.catalog.subscribe(independent)
    f.catalog.invalidate()
    expect(nested).toHaveBeenCalledOnce()
    expect(independent).toHaveBeenCalledOnce()
    expect(f.catalog.readSelection()).toBeNull()
    f.catalog.dispose()
  })

  it('cannot publish a replacement selection from inside a retirement listener', () => {
    const f = fixture()
    expect(f.catalog.selectCurrent(f.selection)).toBe(true)
    let attempted = false
    let accepted: boolean | undefined
    f.catalog.subscribe(() => {
      if (!attempted) {
        attempted = true
        accepted = f.catalog.selectCurrent({ ...f.selection, prNumber: 99 })
      }
    })
    const observed: unknown[] = []
    f.catalog.subscribe(() => observed.push(f.catalog.readSelection()))
    f.catalog.invalidate()
    expect(accepted).toBe(false)
    expect(observed.every((value) => value === null)).toBe(true)
    expect(f.catalog.readSelection()).toBeNull()
    f.catalog.dispose()
  })

  it('denies a Store that cannot synchronously publish mutation invalidation', () => {
    const f = fixture()
    Reflect.deleteProperty(f.store, 'subscribeMutations')
    const unobserved = new MainProjectSourceCatalog(f.store)
    expect(unobserved.selectCurrent(f.selection)).toBe(false)
    expect(() => unobserved.readCatalog()).toThrow('Main project catalog unavailable')
  })

  it('denies a malformed subscription instead of assuming revocation is installed', () => {
    const f = fixture()
    f.store.subscribeMutations = () => undefined as never
    const unobserved = new MainProjectSourceCatalog(f.store)
    expect(unobserved.selectCurrent(f.selection)).toBe(false)
  })
  it('validates local host-qualified instance metadata, not the legacy locator row', () => {
    const f = fixture()
    expect(f.catalog.selectCurrent(f.selection)).toBe(true)
    expect(f.store.getUnambiguousWorktreeMetaForHost).toHaveBeenCalledWith('r::/repo/w', 'local')
  })

  it('denies missing host-qualified metadata even when the legacy row looks valid', () => {
    const f = fixture()
    f.store.getUnambiguousWorktreeMetaForHost.mockReturnValue(undefined as never)
    expect(f.catalog.selectCurrent(f.selection)).toBe(false)
  })

  it('rejects another host instead of falling back to the local legacy row', () => {
    const f = fixture()
    f.store.getUnambiguousWorktreeMetaForHost.mockReturnValue({ ...f.meta, hostId: 'ssh:remote' })
    expect(f.catalog.selectCurrent(f.selection)).toBe(false)
  })

  it.each([
    'r',
    'r::/repo',
    'r::/repo::workspace:11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111'
  ])('denies folder candidate %s without an authoritative Project mapping', (workspaceId) => {
    const f = fixture()
    expect(f.catalog.selectCurrent({ ...f.selection, workspaceKind: 'folder', workspaceId })).toBe(
      false
    )
  })

  it('subscribes to the real Store mutation boundary and unsubscribes on disposal', () => {
    const f = fixture()
    expect(f.mutations.size).toBe(1)
    f.catalog.dispose()
    expect(f.mutations.size).toBe(0)
    expect(f.catalog.selectCurrent(f.selection)).toBe(false)
  })

  it('cannot recover selection across two synchronous Store changes A→B→A', () => {
    const f = fixture()
    expect(f.catalog.selectCurrent(f.selection)).toBe(true)
    f.project.sourceRepoIds = []
    f.mutate()
    f.project.sourceRepoIds = ['r']
    f.mutate()
    expect(f.catalog.readSelection()).toBeNull()
    expect(f.catalog.selectCurrent(f.selection)).toBe(true)
    expect(f.catalog.readSelection()!.selectionRevision).toBeGreaterThan(1)
  })

  it('rejects a selection if metadata migration invalidates while resolving it', () => {
    const f = fixture()
    f.store.getUnambiguousWorktreeMetaForHost.mockImplementationOnce(() => {
      f.mutate()
      return f.meta
    })
    expect(f.catalog.selectCurrent(f.selection)).toBe(false)
    expect(f.catalog.readSelection()).toBeNull()
  })

  it('does not return an old selection when a metadata read triggers revocation', () => {
    const f = fixture()
    expect(f.catalog.selectCurrent(f.selection)).toBe(true)
    f.store.getUnambiguousWorktreeMetaForHost.mockImplementationOnce(() => {
      f.mutate()
      return f.meta
    })
    expect(f.catalog.readSelection()).toBeNull()
  })

  it.each(['instanceId', 'projectId', 'projectHostSetupId', 'hostId'] as const)(
    'retires selection when native metadata %s changes',
    (key) => {
      const f = fixture()
      expect(f.catalog.selectCurrent(f.selection)).toBe(true)
      f.store.getUnambiguousWorktreeMetaForHost.mockReturnValue({ ...f.meta, [key]: 'changed' })
      expect(f.catalog.readSelection()).toBeNull()
      f.store.getUnambiguousWorktreeMetaForHost.mockReturnValue(f.meta)
      expect(f.catalog.readSelection()).toBeNull()
    }
  )
})
