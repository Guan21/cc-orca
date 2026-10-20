import type { Store } from '../persistence'
import { splitWorktreeId } from '../../shared/worktree/id'
import type {
  MainRepositoryCatalog,
  MainSelectedRepositoryContext
} from './project-source-main-repository-registration'

type CatalogStore = Pick<
  Store,
  'getProjects' | 'getProjectHostSetups' | 'getRepos' | 'subscribeMutations'
> &
  Partial<Pick<Store, 'getUnambiguousWorktreeMetaForHost'>>
type SelectionCandidate = Omit<MainSelectedRepositoryContext, 'selectionRevision'>

/** Main-only Store adapter. Selection is a selector, never repository/read authorization.
 * Store API mutations retire selection synchronously; direct Main reference mutation
 * still requires explicit invalidation. Renderer session snapshots never restore selection.
 */
export class MainProjectSourceCatalog {
  private selected: MainSelectedRepositoryContext | null = null
  private fingerprint: string | null = null
  private revision = 0
  private disposed = false
  private unsubscribeStore: (() => void) | undefined
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly store: CatalogStore,
    onInvalidate?: () => void
  ) {
    if (onInvalidate) {
      this.listeners.add(onInvalidate)
    }
    try {
      const unsubscribe = store.subscribeMutations(() => this.invalidate())
      if (typeof unsubscribe !== 'function') {
        this.disposed = true
      } else {
        this.unsubscribeStore = unsubscribe
      }
    } catch {
      this.disposed = true
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  invalidate(): void {
    this.selected = null
    this.fingerprint = null
    this.revision += 1
    if (!Number.isSafeInteger(this.revision)) {
      this.disposed = true
    }
    const listeners = [...this.listeners]
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // Failed revocation cannot authorize another operation in this incarnation.
        this.disposed = true
      }
    }
  }

  dispose(): void {
    this.disposed = true
    const unsubscribe = this.unsubscribeStore
    this.unsubscribeStore = undefined
    try {
      unsubscribe?.()
    } catch {
      // Disposal must still notify every dependent authority.
    }
    this.invalidate()
    this.listeners.clear()
  }

  readCatalog(): MainRepositoryCatalog {
    try {
      if (this.disposed) {
        throw new Error('Main project catalog unavailable')
      }
      return structuredClone({
        projects: this.store.getProjects(),
        setups: this.store.getProjectHostSetups(),
        repos: this.store.getRepos()
      })
    } catch {
      throw new Error('Main project catalog unavailable')
    }
  }

  /** Called only by a trusted Main selection owner; renderer identifiers remain untrusted. */
  selectCurrent(candidate: SelectionCandidate): boolean {
    this.invalidate()
    if (this.disposed || !Number.isSafeInteger(this.revision)) {
      return false
    }
    const next = Object.freeze({ ...candidate, selectionRevision: this.revision })
    const revision = this.revision
    const fingerprint = this.resolve(next)
    if (fingerprint === null || this.disposed || revision !== this.revision) {
      return false
    }
    this.selected = next
    this.fingerprint = fingerprint
    return true
  }

  readSelection(): MainSelectedRepositoryContext | null {
    const selected = this.selected
    if (!selected) {
      return null
    }
    if (this.resolve(selected) !== this.fingerprint || this.selected !== selected) {
      this.invalidate()
      return null
    }
    return selected
  }

  isCurrentWorktree(selection: MainSelectedRepositoryContext): boolean {
    const current = this.readSelection()
    return (
      current !== null &&
      current.workspaceKind === 'worktree' &&
      JSON.stringify(current) === JSON.stringify(selection)
    )
  }

  private resolve(selection: MainSelectedRepositoryContext): string | null {
    try {
      const catalog = this.readCatalog()
      const projects = catalog.projects.filter((entry) => entry.id === selection.projectId)
      const repos = catalog.repos.filter((entry) => entry.id === selection.repoId)
      const setups = catalog.setups.filter((entry) => entry.id === selection.hostSetupId)
      if (projects.length !== 1 || repos.length !== 1 || setups.length !== 1) {
        return null
      }
      const project = projects[0]!
      const repo = repos[0]!
      const setup = setups[0]!
      if (
        !Number.isSafeInteger(selection.prNumber) ||
        selection.prNumber < 1 ||
        !project.sourceRepoIds.includes(repo.id) ||
        setup.projectId !== project.id ||
        setup.repoId !== repo.id ||
        setup.path !== repo.path ||
        setup.setupState !== 'ready' ||
        setup.hostId !== 'local' ||
        (setup.executionHostId != null && setup.executionHostId !== 'local') ||
        setup.connectionId != null ||
        repo.connectionId != null ||
        (repo.executionHostId != null && repo.executionHostId !== 'local') ||
        repo.kind !== 'git'
      ) {
        return null
      }
      let instance: string | null = null
      if (selection.workspaceKind === 'worktree') {
        const parsed = splitWorktreeId(selection.workspaceId)
        const meta = this.store.getUnambiguousWorktreeMetaForHost?.(selection.workspaceId, 'local')
        if (
          !parsed?.worktreePath ||
          parsed.repoId !== repo.id ||
          !meta?.instanceId ||
          meta.projectId !== project.id ||
          meta.projectHostSetupId !== setup.id ||
          meta.hostId !== 'local'
        ) {
          return null
        }
        instance = meta.instanceId
      } else {
        return null
      }
      return JSON.stringify([selection, project, setup, repo, instance])
    } catch {
      return null
    }
  }
}
