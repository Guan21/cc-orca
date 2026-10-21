import type { Store } from '../persistence'
import { splitWorktreeId } from '../../shared/worktree/id'
import { resolveProjectExecutionRuntime } from '../../shared/project-execution-runtime'
import { isWslUncPath } from '../../shared/wsl-paths'
import type { MainProjectSelectionCandidate } from './project-source-main-selection'
import type {
  MainRepositoryCatalog,
  MainSelectedRepositoryContext
} from './project-source-main-repository-registration'

type CatalogStore = Pick<
  Store,
  'getProjects' | 'getProjectHostSetups' | 'getRepos' | 'subscribeMutations'
> &
  Partial<Pick<Store, 'getUnambiguousWorktreeMetaForHost' | 'getAllWorktreeMetaForHost'>> & {
    getSettings?: () => Pick<ReturnType<Store['getSettings']>, 'localWindowsRuntimeDefault'>
  }
type SelectionCandidate = Omit<MainSelectedRepositoryContext, 'selectionRevision'>

/** Main-only Store adapter. Selection is a selector, never repository/read authorization.
 * Public Store source records are detached; supported mutations retire selection synchronously.
 * Private Main writes still require invalidation. Renderer snapshots never restore selection.
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

  listSelectionCandidates(): MainProjectSelectionCandidate[] {
    const revision = this.revision
    try {
      const candidates: MainProjectSelectionCandidate[] = []
      const metadata = this.store.getAllWorktreeMetaForHost?.('local')
      if (!metadata || this.disposed) {
        return []
      }
      for (const [workspaceId, meta] of Object.entries(metadata)) {
        const repoId = splitWorktreeId(workspaceId)?.repoId
        if (!repoId || !meta.projectId || !meta.projectHostSetupId || meta.linkedPR == null) {
          continue
        }
        const candidate: MainProjectSelectionCandidate = {
          projectId: meta.projectId,
          repoId,
          hostSetupId: meta.projectHostSetupId,
          workspaceKind: 'worktree',
          workspaceId,
          prNumber: meta.linkedPR
        }
        if (this.inspectSelectionCandidate(candidate)) {
          candidates.push(candidate)
        }
      }
      return !this.disposed && revision === this.revision ? candidates : []
    } catch {
      return []
    }
  }

  inspectSelectionCandidate(
    candidate: MainProjectSelectionCandidate
  ): Readonly<{ fingerprint: string; detail: string }> | null {
    const revision = this.revision
    try {
      const resolved = this.resolve({ ...candidate, selectionRevision: 0 })
      if (resolved === null) {
        return null
      }
      const catalog = this.readCatalog()
      const project = catalog.projects.find((entry) => entry.id === candidate.projectId)!
      const repo = catalog.repos.find((entry) => entry.id === candidate.repoId)!
      const provider = project.providerIdentity
      const meta = this.store.getUnambiguousWorktreeMetaForHost?.(candidate.workspaceId, 'local')
      const namePart = (value: unknown): value is string =>
        typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value)
      if (
        provider?.provider !== 'github' ||
        (provider.host !== undefined && provider.host !== 'github.com') ||
        !namePart(provider.owner) ||
        !namePart(provider.repo) ||
        repo.gitRemoteIdentity?.canonicalKey.toLowerCase() !==
          `github.com/${provider.owner}/${provider.repo}`.toLowerCase() ||
        meta?.linkedPR !== candidate.prNumber ||
        this.resolve({ ...candidate, selectionRevision: 0 }) !== resolved ||
        this.disposed ||
        revision !== this.revision
      ) {
        return null
      }
      const display = (value: string): string => value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
      return Object.freeze({
        fingerprint: JSON.stringify([resolved, meta.linkedPR]),
        detail: [
          `DevCrew Project: ${display(project.displayName)} (${display(project.id)})`,
          `Repository: github.com/${provider.owner}/${provider.repo} (${display(repo.id)})`,
          `Worktree: ${display(splitWorktreeId(candidate.workspaceId)!.worktreePath)} (${display(meta.instanceId!)})`,
          `PR #${candidate.prNumber}`,
          'Purpose: select the GitHub Project Source scope for this window.',
          'Selection does not authorize repository registration or PR read; each requires separate consent.'
        ].join('\n')
      })
    } catch {
      return null
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
      const globalWindowsRuntimeDefault = this.store.getSettings?.().localWindowsRuntimeDefault
      if (
        process.platform === 'win32' &&
        (!globalWindowsRuntimeDefault ||
          !['windows-host', 'wsl'].includes(globalWindowsRuntimeDefault.kind))
      ) {
        return null
      }
      const executionRuntime = resolveProjectExecutionRuntime({
        appPlatform: process.platform,
        projectId: project.id,
        projectRuntimePreference: project.localWindowsRuntimePreference,
        globalWindowsRuntimeDefault
      })
      if (
        executionRuntime.status !== 'resolved' ||
        !['local-host', 'windows-host'].includes(executionRuntime.runtime.kind) ||
        (process.platform === 'win32' && isWslUncPath(repo.path))
      ) {
        return null
      }
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
          (process.platform === 'win32' && isWslUncPath(parsed.worktreePath)) ||
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
      return JSON.stringify([
        selection,
        project,
        setup,
        repo,
        instance,
        globalWindowsRuntimeDefault,
        executionRuntime
      ])
    } catch {
      return null
    }
  }
}
