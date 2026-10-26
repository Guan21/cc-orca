import type { BrowserWindow, WebContents } from 'electron'
import { projectGitHubFacts } from '../../shared/github/project-facts-read-model'
import { MAX_SELECTED_PR_HEAD_AGE_MS, validMainSelectedPrHead } from './project-source-main-pr-head-contract'
import type { MainPinnedSelectedPrHead } from './project-source-main-pr-head-contract'
import type { MainSelectedPrFactPacket } from './project-source-main-pr-evidence-delivery'
import { verifyProjectSourceWindowDocument } from './project-source-window-document'

/** Inert Main -> approved document contract. No Renderer listener or production feature is installed. */
export const PROJECT_SOURCE_FACT_CHANNEL = 'devCrew:privateSelectedPrFacts:v1'
export const PROJECT_SOURCE_CLEAR_CHANNEL = 'devCrew:clearPrivateSelectedPrFacts:v1'

type Options = Readonly<{
  enabled?: boolean
  window: BrowserWindow
  expectedDocumentUrl: string
  currentAppProfile(): 'personal' | 'corporate' | 'development'
  /** Re-authenticate the actual Main-owned grant and current binding. */
  isAuthorizedNow(): boolean
  /** Trusted Main receipt/head, never a Renderer-supplied object. */
  readCurrent(): MainPinnedSelectedPrHead | null
  /** Must synchronously notify BEFORE every protected state mutation. */
  subscribeRetirement(listener: () => void): () => void
  nowMs?: () => number
}>

/**
 * A second synchronous delivery gate, downstream of the B5c one-use fact fence.
 * Main owns the WebContents, message channel and all authority callbacks. This
 * adapter is NOT installed by production bootstrap: lifecycle and credential
 * producers, preload listener/clearer, and native QA are still missing.
 */
export class MainSelectedPrRendererFactSink {
  private readonly contents: WebContents
  private readonly session: WebContents['session']
  private readonly readCurrent: Options['readCurrent']
  private readonly isAuthorizedNow: Options['isAuthorizedNow']
  private readonly nowMs: () => number
  private unsubscribe: (() => void) | null = null
  private available = false
  private disposed = false
  private sending = false
  private clearing = false
  private displayed = false
  private epoch = 0

  constructor(private readonly options: Options) {
    this.contents = options.window.webContents
    this.session = this.contents.session
    this.readCurrent = options.readCurrent.bind(options)
    this.isAuthorizedNow = options.isAuthorizedNow.bind(options)
    this.nowMs = options.nowMs?.bind(options) ?? Date.now
    if (options.enabled !== true) {
      return
    }
    let installing = true
    let interrupted = false
    try {
      const unsubscribe = options.subscribeRetirement(() => {
        if (installing) {
          interrupted = true
        }
        this.retire()
      })
      installing = false
      if (typeof unsubscribe !== 'function' || interrupted || this.disposed) {
        try {
          unsubscribe?.()
        } catch {
          // Do not restore authority on cleanup failure.
        }
        return
      }
      this.unsubscribe = unsubscribe
      this.available = true
    } catch {
      // Unknown lifecycle/subscription status is deny-only.
    }
  }

  /** Every FACT and CLEAR must have a strictly greater revision than its predecessor. */
  private nextRevision(): number | null {
    const next = this.epoch + 1
    if (!Number.isSafeInteger(next)) {
      this.available = false
      return null
    }
    this.epoch = next
    return next
  }

  /** Identity verification is Main-only. No renderer-provided frame or ID. */
  private validDocument(): boolean {
    return verifyProjectSourceWindowDocument(
      {
        approvedWindow: this.options.window,
        approvedSession: this.session,
        currentAppProfile: this.options.currentAppProfile,
        expectedDocumentUrl: this.options.expectedDocumentUrl
      },
      this.contents,
      this.contents.mainFrame
    )
  }

  private current(epoch: number): boolean {
    return (
      this.available &&
      !this.disposed &&
      !this.clearing &&
      this.epoch === epoch &&
      this.validDocument() &&
      this.isAuthorizedNow() &&
      this.epoch === epoch
    )
  }

  /** Only a versioned, tightly scoped G1 packet can cross this Main-owned sink. */
  publish(packet: MainSelectedPrFactPacket): boolean {
    if (this.sending || this.clearing || !this.available || this.disposed) {
      return false
    }
    this.sending = true
    const epoch = this.epoch
    try {
      if (!this.current(epoch)) {
        return false
      }
      const head = structuredClone(this.readCurrent())
      const now = this.nowMs()
      if (!head || !validMainSelectedPrHead(head, now) || !this.current(epoch)) {
        return false
      }
      const copied = structuredClone(packet)
      if (
        copied?.version !== 1 ||
        copied.projectId !== head.binding.projectId ||
        copied.prNumber !== head.binding.prNumber ||
        copied.headSha?.toLowerCase() !== head.headSha.toLowerCase() ||
        copied.snapshot?.attestation !== 'not_verified_by_projection' ||
        copied.snapshot.agentExecution !== 'unknown' ||
        copied.snapshot.taskCompletion !== 'unknown'
      ) {
        return false
      }
      const snapshot = copied.snapshot
      const projection = projectGitHubFacts(
        {
          version: snapshot.version,
          projectId: snapshot.projectId,
          bindingRevision: snapshot.bindingRevision,
          repository: snapshot.repository,
          fetchedAt: snapshot.fetchedAt,
          facts: snapshot.facts
        },
        {
          projectId: head.binding.projectId,
          bindingRevision: head.bindingRevision,
          repository: {
            host: head.binding.repository.host,
            id: head.binding.repository.id,
            owner: head.binding.repository.owner,
            name: head.binding.repository.name
          }
        },
        now,
        MAX_SELECTED_PR_HEAD_AGE_MS
      )
      if (projection.status !== 'ready') {
        return false
      }
      const facts = projection.snapshot.facts
      const prs = facts.filter((fact) => fact.kind === 'pull_request')
      const commits = facts.filter((fact) => fact.kind === 'commit')
      if (
        prs.length !== 1 ||
        prs[0].number !== head.binding.prNumber ||
        prs[0].headSha !== head.headSha.toLowerCase() ||
        commits.length !== 1 ||
        commits[0].sha !== head.headSha.toLowerCase() ||
        facts.some((fact) => fact.kind === 'check_run' && fact.headSha !== head.headSha.toLowerCase()) ||
        !this.current(epoch) ||
        JSON.stringify(this.readCurrent()) !== JSON.stringify(head) ||
        !this.current(epoch)
      ) {
        return false
      }
      // One monotonic revision for EACH outgoing event, not only retirement.
      // A FACT after CLEAR must be newer than that CLEAR or Preload rejects it.
      const revision = this.nextRevision()
      if (revision === null) {
        return false
      }
      // Mark it visible first: synchronous, reentrant retirement must be able
      // to enqueue CLEAR *after* this FACT. No await between final gate and send.
      this.displayed = true
      this.contents.send(PROJECT_SOURCE_FACT_CHANNEL, {
        revision,
        packet: {
          version: 1,
          projectId: head.binding.projectId,
          prNumber: head.binding.prNumber,
          headSha: head.headSha.toLowerCase(),
          snapshot: projection.snapshot
        }
      })
      return this.epoch === revision
    } catch {
      // If a transport partially sent, retire and try to clear the old view.
      this.retire()
      return false
    } finally {
      this.sending = false
    }
  }

  /**
   * Call synchronously before the trusted state changes. Clear is safe for the
   * original approved document only. Destroyed/replaced documents need separate
   * native and Renderer clearing proof; this contract cannot prove that.
   */
  retire(): void {
    const revision = this.nextRevision()
    if (!this.displayed || this.clearing) {
      return
    }
    this.displayed = false
    this.clearing = true
    try {
      if (revision !== null && this.validDocument()) {
        this.contents.send(PROJECT_SOURCE_CLEAR_CHANNEL, { revision })
      }
    } catch {
      // Do not throw from a source lifecycle revocation callback.
    } finally {
      this.clearing = false
    }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.retire()
    this.disposed = true
    this.available = false
    const unsubscribe = this.unsubscribe
    this.unsubscribe = null
    try {
      unsubscribe?.()
    } catch {
      // A failed unsubscribe never reauthorizes this sender.
    }
  }
}
