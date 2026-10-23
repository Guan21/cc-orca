import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore, makeRepo, testState } from '../persistence-test-harness'
import type { Store } from '../persistence'
import { MainProjectSourceCatalog } from './project-source-main-catalog'
import { setup } from './__fixtures__/selected-pr-source-composition'
import { deferred, head, ready } from './__fixtures__/selected-pr-head-provider'

vi.mock('electron', () => ({
  app: { getPath: () => testState.dir },
  safeStorage: { isEncryptionAvailable: () => false }
}))
vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({ getCohortAtEmit: vi.fn() }))

let store: Store
beforeEach(() => {
  testState.dir = mkdtempSync(join(tmpdir(), 'devcrew-publication-'))
  store = createStore()
})

describe('real Store to catalog to offline composition invalidation', () => {
  it.each(['head', 'projection'] as const)(
    'cancels pending %s before publication and rejects late ABA completion',
    async (phase) => {
      const { repo } = fixture()
      const f = await setup()
      const observed: string[] = []
      const catalog = new MainProjectSourceCatalog(store)
      const unsubscribe = catalog.subscribe(() => {
        observed.push(store.getRepo(repo.id)!.displayName)
        f.composition.invalidate()
      })
      const pending = deferred<unknown>()
      const entered = deferred<boolean>()
      if (phase === 'head') {
        f.readEvidence.mockImplementation(async () => {
          entered.resolve(true)
          return (await pending.promise) as ReturnType<typeof head>
        })
      } else {
        f.readProjection.mockImplementation(async () => {
          entered.resolve(true)
          return pending.promise
        })
      }
      try {
        const operation = f.run()
        await entered.promise
        const original = f.getCurrent()
        store.updateRepo(repo.id, { displayName: 'B' })
        store.updateRepo(repo.id, { displayName: 'A' })
        expect(observed).toEqual(['A', 'B', 'B', 'A'])
        expect(f.authority.retireAll).toHaveBeenCalled()
        expect((await operation).status).not.toBe('delivered')
        if (phase === 'projection') {
          expect(f.readProjection.mock.calls[0][2].aborted).toBe(true)
        }
        pending.resolve(phase === 'head' ? head(original) : ready())
        await Promise.resolve()
        expect(f.send).not.toHaveBeenCalled()
        expect(await f.run()).toEqual({ status: 'denied' })
      } finally {
        pending.resolve(ready())
        unsubscribe()
        catalog.dispose()
        f.composition.dispose()
        f.provider.dispose()
      }
    }
  )

  it('rejects a completed fact packet when the real Store mutates at final delivery', async () => {
    const { repo } = fixture()
    const f = await setup()
    const observed: string[] = []
    const catalog = new MainProjectSourceCatalog(store, () => {
      observed.push(store.getRepo(repo.id)!.displayName)
      f.composition.invalidate()
    })
    f.beforeDeliver(() => store.updateRepo(repo.id, { displayName: 'B' }))
    try {
      expect((await f.run()).status).not.toBe('delivered')
      expect(f.readProjection).toHaveBeenCalledOnce()
      expect(observed).toEqual(['A', 'B'])
      expect(store.getRepo(repo.id)!.displayName).toBe('B')
      expect(f.send).not.toHaveBeenCalled()
    } finally {
      catalog.dispose()
      f.composition.dispose()
      f.provider.dispose()
    }
  })
})
afterEach(() => {
  store.freezeWrites()
  rmSync(testState.dir, { recursive: true, force: true })
})

function fixture() {
  const repo = makeRepo({ kind: 'git', path: join(testState.dir, 'repo'), displayName: 'A' })
  store.addRepo(repo)
  const project = store.getProjects()[0]!
  store.updateProject(project.id, { localWindowsRuntimePreference: { kind: 'windows-host' } })
  const workspaceId = `${repo.id}::${join(repo.path, 'w')}`
  store.setWorktreeMetaForHost(workspaceId, 'local', { instanceId: 'A' })
  return { repo, project, workspaceId }
}

describe('real Store before-publication boundary', () => {
  it.each(['repo', 'project', 'metadata'] as const)(
    'retires every %s A to B to A transition while old data is still visible',
    (domain) => {
      const f = fixture()
      const read = () =>
        domain === 'repo'
          ? store.getRepo(f.repo.id)!.displayName
          : domain === 'project'
            ? (store.getProjects()[0]!.localWindowsRuntimePreference?.kind ?? 'windows-host')
            : store.getWorktreeMetaForHost(f.workspaceId, 'local')!.instanceId
      const write = (value: string) => {
        if (domain === 'repo') {
          store.updateRepo(f.repo.id, { displayName: value })
        } else if (domain === 'project') {
          store.updateProject(f.project.id, {
            localWindowsRuntimePreference:
              value === 'B' ? { kind: 'wsl', distro: 'Ubuntu' } : { kind: 'windows-host' }
          })
        } else {
          store.setWorktreeMetaForHost(f.workspaceId, 'local', { instanceId: value })
        }
      }
      const initial = read()!
      const before: string[] = []
      store.subscribeBeforeMutations(() => {
        expect(store.isMutationInProgress()).toBe(true)
        before.push(read()!)
      })
      write('B')
      write(initial)
      expect(before).toEqual([initial, domain === 'project' ? 'wsl' : 'B'])
      expect(read()).toBe(initial)
      expect(store.isMutationInProgress()).toBe(false)
    }
  )

  it('visits all invalidators, aborts publication on failure and releases the guard', () => {
    const { repo } = fixture()
    const retired = vi.fn()
    const remove = store.subscribeBeforeMutations(() => {
      throw new Error('retirement failed')
    })
    store.subscribeBeforeMutations(retired)
    expect(() => store.updateRepo(repo.id, { displayName: 'B' })).toThrow('retirement failed')
    expect(retired).toHaveBeenCalledOnce()
    expect(store.getRepo(repo.id)!.displayName).toBe('A')
    expect(store.isMutationInProgress()).toBe(false)
    remove()
    store.updateRepo(repo.id, { displayName: 'C' })
    expect(store.getRepo(repo.id)!.displayName).toBe('C')
  })

  it('rejects nested mutation before either write and still retires later listeners', () => {
    const { repo, project } = fixture()
    const retired = vi.fn()
    const original = store.getProjects()[0]!.localWindowsRuntimePreference?.kind ?? 'windows-host'
    store.subscribeBeforeMutations(() =>
      store.updateProject(project.id, {
        localWindowsRuntimePreference: { kind: 'wsl', distro: 'nested' }
      })
    )
    store.subscribeBeforeMutations(retired)
    expect(() => store.updateRepo(repo.id, { displayName: 'B' })).toThrow(
      'Store mutation in progress'
    )
    expect(retired).toHaveBeenCalledOnce()
    expect(store.getRepo(repo.id)!.displayName).toBe('A')
    expect(store.getProjects()[0]!.localWindowsRuntimePreference?.kind ?? 'windows-host').toBe(
      original
    )
    expect(store.isMutationInProgress()).toBe(false)
  })

  it('keeps the guard active through after-mutation callbacks', () => {
    const { repo } = fixture()
    const observations: boolean[] = []
    store.subscribeMutations(() => {
      observations.push(store.isMutationInProgress())
      expect(() => store.updateRepo(repo.id, { displayName: 'nested' })).toThrow(
        'Store mutation in progress'
      )
    })
    store.updateRepo(repo.id, { displayName: 'B' })
    expect(observations).toEqual([true])
    expect(store.getRepo(repo.id)!.displayName).toBe('B')
    expect(store.isMutationInProgress()).toBe(false)
  })

  it('invalidates the captured listener set even when subscriptions change reentrantly', () => {
    const { repo } = fixture()
    const later = vi.fn()
    const removed = vi.fn()
    let remove = () => {}
    store.subscribeBeforeMutations(() => {
      remove()
      store.subscribeBeforeMutations(later)
    })
    remove = store.subscribeBeforeMutations(removed)
    store.updateRepo(repo.id, { displayName: 'B' })
    expect(removed).toHaveBeenCalledOnce()
    expect(later).not.toHaveBeenCalled()
    store.updateRepo(repo.id, { displayName: 'A' })
    expect(later).toHaveBeenCalledOnce()
  })
})
