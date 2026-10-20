import { describe, expect, it, vi } from 'vitest'
import type { Project, ProjectHostSetup } from '../../shared/project-types'
import type { Repo } from '../../shared/repo-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { MainProjectSourceCatalog } from './project-source-main-catalog'

function fixture() {
  const project: Project = {
    id: 'p',
    displayName: 'P',
    badgeColor: 'blue',
    sourceRepoIds: ['r'],
    createdAt: 1,
    updatedAt: 1,
    providerIdentity: { provider: 'github', owner: 'owner', repo: 'repo' }
  }
  const repo: Repo = {
    id: 'r',
    displayName: 'R',
    badgeColor: 'blue',
    path: '/repo',
    kind: 'git',
    addedAt: 1
  }
  const setup: ProjectHostSetup = {
    id: 's',
    projectId: 'p',
    repoId: 'r',
    hostId: 'local',
    path: '/repo',
    displayName: 'S',
    setupState: 'ready',
    setupMethod: 'cloned',
    createdAt: 1,
    updatedAt: 1
  }
  let projects = [project]
  let repos = [repo]
  let meta: WorktreeMeta | undefined
  const store = {
    getProjects: () => projects,
    getProjectHostSetups: () => [setup],
    getRepos: () => repos,
    getWorktreeMeta: () => meta
  }
  const retire = vi.fn()
  const catalog = new MainProjectSourceCatalog(store, retire)
  const selected = {
    projectId: 'p',
    repoId: 'r',
    hostSetupId: 's',
    workspaceKind: 'folder' as const,
    workspaceId: 'r',
    prNumber: 3
  }
  return {
    project,
    repo,
    setup,
    catalog,
    store,
    retire,
    selected,
    setProjects: (value: Project[]) => {
      projects = value
    },
    setRepos: (value: Repo[]) => {
      repos = value
    },
    setMeta: (value: WorktreeMeta) => {
      meta = value
    }
  }
}

describe('MainProjectSourceCatalog', () => {
  it('reads actual Store records and starts without any selection', () => {
    const f = fixture()
    expect(f.catalog.readSelection()).toBeNull()
    expect(f.catalog.readCatalog().projects).toEqual([f.project])
    expect(f.catalog.selectCurrent(f.selected)).toBe(true)
    expect(f.catalog.readSelection()).toMatchObject(f.selected)
  })

  it('advances Main revision on every selection and invalidates on ABA', () => {
    const f = fixture()
    f.catalog.selectCurrent(f.selected)
    const first = f.catalog.readSelection()!.selectionRevision
    f.catalog.selectCurrent({ ...f.selected, prNumber: 4 })
    f.catalog.selectCurrent(f.selected)
    expect(f.catalog.readSelection()!.selectionRevision).toBeGreaterThan(first)
    expect(f.retire).toHaveBeenCalledTimes(3)
  })

  it.each(['projectId', 'repoId', 'hostSetupId', 'workspaceId'] as const)(
    'rejects forged %s without retaining the old selection',
    (field) => {
      const f = fixture()
      f.catalog.selectCurrent(f.selected)
      expect(f.catalog.selectCurrent({ ...f.selected, [field]: 'forged' })).toBe(false)
      expect(f.catalog.readSelection()).toBeNull()
    }
  )

  it('rejects ambiguous Store repository IDs', () => {
    const f = fixture()
    f.setRepos([f.repo, { ...f.repo, executionHostId: 'ssh:remote' }])
    expect(f.catalog.selectCurrent(f.selected)).toBe(false)
  })

  it.each(['ssh:remote', 'runtime:remote'] as const)('rejects %s execution hosts', (host) => {
    const f = fixture()
    f.repo.executionHostId = host
    expect(f.catalog.selectCurrent(f.selected)).toBe(false)
  })

  it('retires selection permanently after deletion and recreation', () => {
    const f = fixture()
    f.catalog.selectCurrent(f.selected)
    f.setProjects([])
    expect(f.catalog.readSelection()).toBeNull()
    f.setProjects([f.project])
    expect(f.catalog.readSelection()).toBeNull()
  })

  it('detects rebinding and cannot recover when the old binding returns', () => {
    const f = fixture()
    f.catalog.selectCurrent(f.selected)
    f.setup.path = '/new'
    expect(f.catalog.readSelection()).toBeNull()
    f.setup.path = '/repo'
    expect(f.catalog.readSelection()).toBeNull()
  })

  it('requires worktree instance, explicit Project/setup/host and repo ownership', () => {
    const f = fixture()
    const worktree = {
      ...f.selected,
      workspaceKind: 'worktree' as const,
      workspaceId: 'r::/repo/w'
    }
    expect(f.catalog.selectCurrent(worktree)).toBe(false)
    f.setMeta({
      instanceId: 'i',
      projectId: 'p',
      projectHostSetupId: 's',
      hostId: 'local'
    } as WorktreeMeta)
    expect(f.catalog.selectCurrent(worktree)).toBe(true)
    expect(f.catalog.isCurrentWorktree(f.catalog.readSelection()!)).toBe(true)
    f.setMeta({
      instanceId: 'new',
      projectId: 'p',
      projectHostSetupId: 's',
      hostId: 'local'
    } as WorktreeMeta)
    expect(f.catalog.readSelection()).toBeNull()
  })

  it('fails closed on Store failure and does not expose Store exceptions', () => {
    const f = fixture()
    f.catalog.selectCurrent(f.selected)
    f.store.getProjects = () => {
      throw new Error('sensitive Store error')
    }
    expect(f.catalog.readSelection()).toBeNull()
    expect(() => f.catalog.readCatalog()).toThrow('Main project catalog unavailable')
  })

  it('returns detached catalog snapshots', () => {
    const f = fixture()
    const snapshot = f.catalog.readCatalog()
    snapshot.projects[0]!.sourceRepoIds.push('evil')
    expect(f.project.sourceRepoIds).toEqual(['r'])
  })

  it('attempts every revocation listener and permanently denies after a listener failure', () => {
    const f = fixture()
    f.catalog.selectCurrent(f.selected)
    const later = vi.fn()
    f.catalog.subscribe(() => {
      throw new Error('sensitive listener failure')
    })
    f.catalog.subscribe(later)
    expect(() => f.catalog.invalidate()).not.toThrow()
    expect(later).toHaveBeenCalledOnce()
    expect(f.catalog.readSelection()).toBeNull()
    expect(f.catalog.selectCurrent(f.selected)).toBe(false)
  })

  it('snapshots listeners so removal cannot skip a pending revocation', () => {
    const f = fixture()
    const later = vi.fn()
    let unsubscribe = () => {}
    f.catalog.subscribe(() => {
      unsubscribe()
    })
    unsubscribe = f.catalog.subscribe(later)
    f.catalog.invalidate()
    expect(later).toHaveBeenCalledOnce()
  })

  it('explicit lifecycle invalidation and disposal never restore selection', () => {
    const f = fixture()
    f.catalog.selectCurrent(f.selected)
    f.catalog.invalidate()
    expect(f.catalog.readSelection()).toBeNull()
    f.catalog.selectCurrent(f.selected)
    f.catalog.dispose()
    expect(f.catalog.selectCurrent(f.selected)).toBe(false)
    expect(f.catalog.readSelection()).toBeNull()
  })
})
