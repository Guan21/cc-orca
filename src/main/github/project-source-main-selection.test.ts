import { describe, expect, it, vi } from 'vitest'
import { MainProjectSourceCatalog } from './project-source-main-catalog'
import {
  MainProjectSourceSelection,
  type MainProjectSelectionSnapshot
} from './project-source-main-selection'
import type { Project, ProjectHostSetup } from '../../shared/project-types'
import type { Repo } from '../../shared/repo-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'

function fixture() {
  const project: Project = {
    id: 'p',
    displayName: 'P',
    badgeColor: 'blue',
    sourceRepoIds: ['r'],
    createdAt: 1,
    updatedAt: 1
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
  let mutation: () => void = () => {}
  let listener: (snapshot: MainProjectSelectionSnapshot) => void = () => {}
  const candidate = {
    projectId: 'p',
    repoId: 'r',
    hostSetupId: 's',
    workspaceKind: 'worktree' as const,
    workspaceId: 'r::/repo/w',
    prNumber: 1
  }
  const store = {
    getProjects: () => [project],
    getRepos: () => [repo],
    getProjectHostSetups: () => [setup],
    getUnambiguousWorktreeMetaForHost: () =>
      ({
        instanceId: 'i',
        projectId: 'p',
        projectHostSetupId: 's',
        hostId: 'local'
      }) as WorktreeMeta,
    subscribeMutations: (callback: () => void) => {
      mutation = callback
      return () => {}
    }
  }
  const catalog = new MainProjectSourceCatalog(store)
  const unsubscribe = vi.fn()
  const source = {
    subscribeChanges: (callback: typeof listener): (() => void) => {
      listener = callback
      return unsubscribe
    },
    readCurrent: (): MainProjectSelectionSnapshot => ({ revision: 1, candidate })
  }
  return {
    catalog,
    candidate,
    source,
    store,
    repo,
    project,
    setup,
    unsubscribe,
    emit: (revision: number, next = candidate) => listener({ revision, candidate: next }),
    mutate: () => mutation()
  }
}

describe('MainProjectSourceSelection', () => {
  it('has no production selection producer by default and clears pre-existing selection', () => {
    const f = fixture()
    f.catalog.selectCurrent(f.candidate)
    const owner = new MainProjectSourceSelection(f.catalog)
    expect(owner.readCurrent()).toEqual({ status: 'unavailable', selection: null })
    expect(f.catalog.readSelection()).toBeNull()
  })

  it('publishes only catalog validated Main selection and clones source candidates', () => {
    const f = fixture()
    const owner = new MainProjectSourceSelection(f.catalog, f.source)
    expect(owner.readCurrent()).toMatchObject({ status: 'selected', selection: f.candidate })
    f.candidate.prNumber = 90
    expect(owner.readCurrent().selection?.prNumber).toBe(1)
    expect(Object.isFrozen(owner.readCurrent().selection)).toBe(true)
  })

  it('advances revision across A to B to A, PR changes and worktree switches', () => {
    const f = fixture()
    const owner = new MainProjectSourceSelection(f.catalog, f.source)
    const first = owner.readCurrent().selection!.selectionRevision
    f.emit(2, { ...f.candidate, prNumber: 2 })
    f.emit(3, { ...f.candidate, workspaceId: 'r::/repo/other' })
    f.emit(4)
    expect(owner.readCurrent().selection!.selectionRevision).toBeGreaterThan(first)
  })

  it.each(['projectId', 'repoId', 'hostSetupId', 'workspaceId'] as const)(
    'denies forged %s and clears the previous selection',
    (field) => {
      const f = fixture()
      const owner = new MainProjectSourceSelection(f.catalog, f.source)
      f.emit(2, { ...f.candidate, [field]: 'forged' })
      expect(owner.readCurrent().status).toBe('denied')
      expect(f.catalog.readSelection()).toBeNull()
    }
  )

  it.each(['ssh:host', 'runtime:host', 'wsl:distro'] as const)('denies %s hosts', (host) => {
    const f = fixture()
    // Malformed WSL identities must also fail closed at runtime.
    f.repo.executionHostId = host as Repo['executionHostId']
    expect(new MainProjectSourceSelection(f.catalog, f.source).readCurrent().status).toBe('denied')
  })

  it('denies folder candidates without synthesizing mappings', () => {
    const f = fixture()
    f.source.readCurrent = () => ({
      revision: 1,
      candidate: { ...f.candidate, workspaceKind: 'folder' }
    })
    expect(new MainProjectSourceSelection(f.catalog, f.source).readCurrent().status).toBe('denied')
  })

  it('clears immediately on mutation and requires a higher source revision', () => {
    const f = fixture()
    const owner = new MainProjectSourceSelection(f.catalog, f.source)
    f.mutate()
    expect(owner.readCurrent().selection).toBeNull()
    f.emit(1)
    expect(owner.readCurrent().selection).toBeNull()
    f.emit(2)
    expect(owner.readCurrent().status).toBe('selected')
  })

  it.each([0, -1, Number.NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'permanently disables malformed producer revision %s',
    (revision) => {
      const f = fixture()
      const owner = new MainProjectSourceSelection(f.catalog, f.source)
      f.emit(revision)
      f.emit(20)
      expect(owner.readCurrent().status).toBe('unavailable')
      expect(f.unsubscribe).toHaveBeenCalledOnce()
    }
  )

  it('revokes on out-of-order events without retaining the newer grant', () => {
    const f = fixture()
    const owner = new MainProjectSourceSelection(f.catalog, f.source)
    f.emit(3)
    f.emit(2)
    expect(owner.readCurrent().status).toBe('denied')
    expect(f.catalog.readSelection()).toBeNull()
    f.emit(4)
    expect(owner.readCurrent().status).toBe('selected')
  })

  it('does not let initial reads overwrite an event emitted during the read', () => {
    const f = fixture()
    f.source.readCurrent = () => {
      f.emit(2, { ...f.candidate, prNumber: 2 })
      return { revision: 1, candidate: f.candidate }
    }
    const owner = new MainProjectSourceSelection(f.catalog, f.source)
    expect(owner.readCurrent().selection?.prNumber).toBe(2)
  })

  it('does not let initial reads overwrite an event emitted during subscription', () => {
    const f = fixture()
    const subscribe = f.source.subscribeChanges
    f.source.subscribeChanges = (listener) => {
      const cleanup = subscribe(listener)
      f.emit(2)
      return cleanup
    }
    expect(new MainProjectSourceSelection(f.catalog, f.source).readCurrent().status).toBe(
      'selected'
    )
  })

  it('denies a store mutation during catalog validation', () => {
    const f = fixture()
    let mutated = false
    f.store.getProjects = () => {
      if (!mutated) {
        mutated = true
        f.mutate()
      }
      return [f.project]
    }
    expect(new MainProjectSourceSelection(f.catalog, f.source).readCurrent().status).toBe('denied')
    expect(f.catalog.readSelection()).toBeNull()
  })

  it('is permanently unavailable if source setup throws', () => {
    const f = fixture()
    f.source.readCurrent = () => {
      throw new Error('private source detail')
    }
    const owner = new MainProjectSourceSelection(f.catalog, f.source)
    f.emit(2)
    expect(owner.readCurrent().status).toBe('unavailable')
    expect(f.unsubscribe).toHaveBeenCalledOnce()
  })

  it('disposes idempotently, clears selection and ignores late events', () => {
    const f = fixture()
    const owner = new MainProjectSourceSelection(f.catalog, f.source)
    owner.dispose()
    owner.dispose()
    f.emit(2)
    expect(owner.readCurrent().status).toBe('unavailable')
    expect(f.catalog.readSelection()).toBeNull()
    expect(f.unsubscribe).toHaveBeenCalledOnce()
  })

  it('clears an explicit deselection and never restores on restart', () => {
    const f = fixture()
    const owner = new MainProjectSourceSelection(f.catalog, f.source)
    f.source.readCurrent = () => ({ revision: 2, candidate: null })
    owner.dispose()
    const next = new MainProjectSourceSelection(f.catalog, f.source)
    expect(next.readCurrent()).toEqual({ status: 'denied', selection: null })
  })

  it('remains unavailable after malformed source subscription', () => {
    const f = fixture()
    f.source.subscribeChanges = () => undefined as unknown as () => void
    expect(new MainProjectSourceSelection(f.catalog, f.source).readCurrent().status).toBe(
      'unavailable'
    )
  })

  it('revokes permanently on reentrant source events during catalog validation', () => {
    const f = fixture()
    const owner = new MainProjectSourceSelection(f.catalog, f.source)
    f.store.getProjects = () => {
      f.emit(3)
      return [f.project]
    }
    f.emit(2)
    expect(owner.readCurrent().status).toBe('unavailable')
    expect(f.catalog.readSelection()).toBeNull()
  })

  it('cleans up all listeners even when the producer unsubscribe throws', () => {
    const f = fixture()
    const owner = new MainProjectSourceSelection(f.catalog, f.source)
    f.unsubscribe.mockImplementation(() => {
      throw new Error('private cleanup detail')
    })
    expect(() => owner.dispose()).not.toThrow()
    f.mutate()
    expect(owner.readCurrent().status).toBe('unavailable')
  })

  it('does not adopt selection written outside its producer', () => {
    const f = fixture()
    const owner = new MainProjectSourceSelection(f.catalog, f.source)
    f.catalog.selectCurrent({ ...f.candidate, prNumber: 9 })
    expect(owner.readCurrent().status).toBe('denied')
    expect(f.catalog.readSelection()).toBeNull()
  })

  it.each(['project', 'binding', 'setup', 'instance', 'ambiguous'] as const)(
    'revokes synchronously on %s changes and refuses stale producer replay',
    (change) => {
      const f = fixture()
      const owner = new MainProjectSourceSelection(f.catalog, f.source)
      if (change === 'project') {
        f.project.updatedAt += 1
      }
      if (change === 'binding') {
        f.project.sourceRepoIds = []
      }
      if (change === 'setup') {
        f.setup.updatedAt += 1
      }
      if (change === 'instance') {
        f.store.getUnambiguousWorktreeMetaForHost = () =>
          ({
            instanceId: 'replacement',
            projectId: 'p',
            projectHostSetupId: 's',
            hostId: 'local'
          }) as WorktreeMeta
      }
      if (change === 'ambiguous') {
        f.store.getUnambiguousWorktreeMetaForHost = () => undefined as unknown as WorktreeMeta
      }
      f.mutate()
      f.emit(1)
      expect(owner.readCurrent().status).toBe('denied')
      expect(f.catalog.readSelection()).toBeNull()
    }
  )
})
