/**
 * #191 G2-C3 — volatile Renderer projection. This is NOT mounted in the UI.
 * UI selection is a display filter, never a GitHub access grant.
 */
import type { GitHubFactSnapshot } from '../../../shared/github/project-facts-read-model'
import {
  readSelectedPrViewFacts,
  type SelectedPrViewFacts
} from '../../../shared/github/project-source-renderer-view-contract'

export type SelectedPrViewScope = Readonly<{
  projectId: string
  repositoryId: number
  prNumber: number
  bindingRevision: number
}>

const validScope = (s: SelectedPrViewScope | null): s is SelectedPrViewScope =>
  !!s &&
  typeof s.projectId === 'string' &&
  s.projectId.length > 0 &&
  Number.isSafeInteger(s.repositoryId) && s.repositoryId > 0 &&
  Number.isSafeInteger(s.prNumber) && s.prNumber > 0 &&
  Number.isSafeInteger(s.bindingRevision) && s.bindingRevision >= 0

export function createVolatileSelectedPrView(nowMs: () => number = Date.now) {
  let scope: SelectedPrViewScope | null = null
  let visible: GitHubFactSnapshot | null = null
  let maxRevision = -1
  let disposed = false
  const observers = new Set<() => void>()

  const notify = (): void => {
    for (const observer of observers) {
      try { observer() } catch { /* continue releasing independent listeners */ }
    }
  }
  const clear = (): void => {
    if (!visible) {
      return
    }
    visible = null
    notify()
  }

  return {
    /** Changing even A->B->A always synchronously forgets prior facts. */
    select(next: SelectedPrViewScope | null): void {
      if (disposed) {
        return
      }
      clear()
      scope = validScope(next) ? { ...next } : null
    },
    /** A safe packet is never a replacement for Main consent or a credential attestation. */
    receive(message: SelectedPrViewFacts): boolean {
      if (disposed || !validScope(scope)) {
        return false
      }
      const input = readSelectedPrViewFacts(message, nowMs())
      if (!input || input.revision <= maxRevision) {
        clear()
        return false
      }
      const { packet } = input
      if (
        packet.projectId !== scope.projectId ||
        packet.prNumber !== scope.prNumber ||
        packet.snapshot.repository.id !== scope.repositoryId ||
        packet.snapshot.bindingRevision !== scope.bindingRevision
      ) {
        clear()
        return false
      }
      // This monotonic local revision cannot attest sender incarnation across
      // Renderer restart; the production installed sender is still absent.
      maxRevision = input.revision
      visible = structuredClone(packet.snapshot)
      notify()
      return true
    },
    /** Clear does not require a token, active selection, or a round-trip. */
    retire(): void {
      clear()
    },
    snapshot(): GitHubFactSnapshot | null {
      return visible ? structuredClone(visible) : null
    },
    subscribe(listener: () => void): () => void {
      if (disposed) {
        return () => undefined
      }
      observers.add(listener)
      return () => { observers.delete(listener) }
    },
    dispose(): void {
      if (disposed) {
        return
      }
      clear()
      disposed = true
      scope = null
      observers.clear()
    }
  }
}
