import type { MainProjectSourceCatalog } from './project-source-main-catalog'
import type { MainSelectedRepositoryContext } from './project-source-main-repository-registration'

export type MainProjectSelectionCandidate = Omit<MainSelectedRepositoryContext, 'selectionRevision'>
export type MainProjectSelectionSnapshot = Readonly<{
  revision: number
  candidate: MainProjectSelectionCandidate | null
}>

/** Main-only producer contract; renderer snapshots and session persistence cannot implement it. */
export type MainProjectSelectionSource = Readonly<{
  subscribeChanges(listener: (snapshot: MainProjectSelectionSnapshot) => void): () => void
  readCurrent(): MainProjectSelectionSnapshot
}>

export type MainProjectSelectionState = Readonly<{
  status: 'selected' | 'denied' | 'unavailable'
  selection: MainSelectedRepositoryContext | null
}>

/** No authoritative application producer exists yet: absence stays unavailable across restarts. */
export class MainProjectSourceSelection {
  private status: MainProjectSelectionState['status'] = 'unavailable'
  private selection: MainSelectedRepositoryContext | null = null
  private unavailable = false
  private disposed = false
  private sourceRevision = 0
  private receivedEvents = 0
  private processing = false
  private invalidations = 0
  private readonly subscriptions: (() => void)[] = []

  constructor(
    private readonly catalog: MainProjectSourceCatalog,
    source?: MainProjectSelectionSource
  ) {
    this.catalog.invalidate()
    if (!source) {
      this.unavailable = true
      return
    }
    try {
      this.addSubscription(
        catalog.subscribe(() => {
          this.selection = null
          if (!this.unavailable) {
            this.status = 'denied'
          }
          if (this.processing) {
            this.invalidations += 1
          }
        })
      )
      this.status = 'denied'
      this.addSubscription(
        source.subscribeChanges((snapshot) => {
          this.receivedEvents += 1
          this.accept(snapshot)
        })
      )
      if (this.unavailable || this.receivedEvents > 0) {
        return
      }
      const events = this.receivedEvents
      const initial = source.readCurrent()
      if (this.receivedEvents === events) {
        this.accept(initial)
      }
    } catch {
      this.disable()
    }
  }

  readCurrent(): MainProjectSelectionState {
    if (this.unavailable || this.disposed) {
      return { status: 'unavailable', selection: null }
    }
    try {
      const current = this.catalog.readSelection()
      if (this.selection !== current) {
        this.selection = null
        this.status = 'denied'
        if (current) {
          this.catalog.invalidate()
        }
      }
    } catch {
      this.disable()
    }
    return Object.freeze({ status: this.status, selection: this.selection })
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.disable()
  }

  private addSubscription(unsubscribe: () => void): void {
    if (typeof unsubscribe !== 'function') {
      throw new Error('Selection source unavailable')
    }
    if (this.unavailable || this.disposed) {
      unsubscribe()
    } else {
      this.subscriptions.push(unsubscribe)
    }
  }

  private disable(): void {
    this.unavailable = true
    this.status = 'unavailable'
    this.selection = null
    this.catalog.invalidate()
    for (const unsubscribe of this.subscriptions.splice(0)) {
      try {
        unsubscribe()
      } catch {
        /* Continue disposing remaining subscriptions. */
      }
    }
  }

  private accept(snapshot: MainProjectSelectionSnapshot): void {
    if (this.unavailable || this.disposed) {
      return
    }
    if (this.processing) {
      this.disable()
      return
    }
    try {
      const copied: MainProjectSelectionSnapshot = structuredClone(snapshot)
      if (
        !copied ||
        !Number.isSafeInteger(copied.revision) ||
        copied.revision < 1 ||
        !Object.hasOwn(copied, 'candidate')
      ) {
        this.disable()
        return
      }
      if (copied.revision <= this.sourceRevision) {
        this.catalog.invalidate()
        return
      }
      this.sourceRevision = copied.revision
      if (copied.candidate === null) {
        this.catalog.invalidate()
        return
      }
      const candidate = Object.freeze(copied.candidate)
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        !['projectId', 'repoId', 'hostSetupId', 'workspaceId'].every(
          (key) => typeof candidate[key as keyof MainProjectSelectionCandidate] === 'string'
        ) ||
        !['worktree', 'folder'].includes(candidate.workspaceKind) ||
        !Number.isSafeInteger(candidate.prNumber) ||
        candidate.prNumber < 1
      ) {
        this.disable()
        return
      }
      this.processing = true
      this.invalidations = 0
      const selected = this.catalog.selectCurrent(candidate)
      const current = this.catalog.readSelection()
      if (!this.unavailable && selected && current && this.invalidations === 1) {
        this.selection = current
        this.status = 'selected'
      } else {
        this.catalog.invalidate()
      }
    } catch {
      this.disable()
    } finally {
      this.processing = false
    }
  }
}
