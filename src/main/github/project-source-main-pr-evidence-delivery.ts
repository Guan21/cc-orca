/** #165 B5c Task A — Main-only, inert selected-PR evidence delivery fence.
 *
 * This is NOT a credential/HEAD source. A future separately reviewed Main
 * adapter must supply current() exclusively from authenticated, revocable
 * Main Project/Repository/PR/Document/Grant state. Neither Renderer nor a
 * local git branch HEAD is a trustworthy selected GitHub PR HEAD provider.
 *
 * Do not install a production sender or enable native transport in this step.
 */
import {
  projectGitHubFacts,
  type GitHubFactSnapshot,
  type GitHubProjectFactScope
} from '../../shared/github/project-facts-read-model'
import type { SelectedGitHubPrProjection } from '../../shared/github/selected-pr-graphql-projection'
import type {
  TrustedSelectedPrBinding,
  VerifiedSourceDocument
} from './project-source-grant-registry'

export type MainPinnedSelectedPrHead = Readonly<{
  document: VerifiedSourceDocument
  binding: TrustedSelectedPrBinding
  /** The same revision used for the G1 fact scope. */
  bindingRevision: number
  selectionRevision: number
  grantRevision: number
  sessionIncarnation: string
  /** Main-verified GitHub selected PR HEAD, NOT Renderer or local git HEAD. */
  headSha: string
  observedAtMs: number
}>

export type MainSelectedPrFactPacket = Readonly<{
  version: 1
  projectId: string
  prNumber: number
  headSha: string
  snapshot: GitHubFactSnapshot
}>

type ReadyProjection = Extract<SelectedGitHubPrProjection, { status: 'ready' }>
type Options = Readonly<{
  /** Never supplied by Renderer/IPC, always re-read the Main authority. */
  readCurrent: () => MainPinnedSelectedPrHead | null
  /** Must authenticate current Window, Frame, Document, Session, Profile and grant. */
  isAuthorizedNow: () => boolean
  /** Default false until #151 Owner acceptance and native custody are verified. */
  isEnabled: () => boolean
  nowMs: () => number
  /** Main-owned synchronous WebContents delivery, never a promise-returning sink. */
  send: (packet: MainSelectedPrFactPacket) => void
}>

const MAX_EVIDENCE_AGE_MS = 5 * 60_000
const HEX_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i
const SMALL = (x: unknown): x is string =>
  typeof x === 'string' &&
  x.length > 0 &&
  x.length <= 256 &&
  x.trim() === x &&
  ![...x].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
const POSITIVE = (x: unknown): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x > 0
const NONNEGATIVE = (x: unknown): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= 0

function validDocument(d: VerifiedSourceDocument): boolean {
  return (
    d?.profile === 'personal-packaged' &&
    d.executionRealm === 'native' &&
    SMALL(d.installationId) &&
    POSITIVE(d.windowId) &&
    POSITIVE(d.webContentsId) &&
    NONNEGATIVE(d.frameProcessId) &&
    NONNEGATIVE(d.frameRoutingId) &&
    SMALL(d.documentId) &&
    SMALL(d.sessionPartition) &&
    SMALL(d.principalId) &&
    NONNEGATIVE(d.credentialGeneration)
  )
}

function validBinding(b: TrustedSelectedPrBinding): boolean {
  return (
    SMALL(b?.projectId) &&
    b.workspaceKind === 'worktree' &&
    SMALL(b.workspaceId) &&
    SMALL(b.hostSetupId) &&
    SMALL(b.executionHostId) &&
    b.repository?.host === 'github.com' &&
    POSITIVE(b.repository.id) &&
    SMALL(b.repository.nodeId) &&
    SMALL(b.repository.owner) &&
    SMALL(b.repository.name) &&
    POSITIVE(b.prNumber)
  )
}

function validHead(h: MainPinnedSelectedPrHead, now: number): boolean {
  return (
    validDocument(h?.document) &&
    validBinding(h.binding) &&
    POSITIVE(h.bindingRevision) &&
    POSITIVE(h.selectionRevision) &&
    POSITIVE(h.grantRevision) &&
    SMALL(h.sessionIncarnation) &&
    typeof h.headSha === 'string' &&
    HEX_SHA.test(h.headSha) &&
    Number.isFinite(now) &&
    Number.isFinite(h.observedAtMs) &&
    h.observedAtMs <= now &&
    now - h.observedAtMs <= MAX_EVIDENCE_AGE_MS
  )
}

function scopeFor(h: MainPinnedSelectedPrHead): GitHubProjectFactScope {
  return {
    projectId: h.binding.projectId,
    bindingRevision: h.bindingRevision,
    repository: {
      host: 'github.com',
      id: h.binding.repository.id,
      owner: h.binding.repository.owner,
      name: h.binding.repository.name
    }
  }
}

function packetFor(
  projection: ReadyProjection,
  h: MainPinnedSelectedPrHead,
  now: number
): MainSelectedPrFactPacket | null {
  const facts = projectGitHubFacts(projection.snapshot, scopeFor(h), now, MAX_EVIDENCE_AGE_MS)
  if (facts.status !== 'ready') {
    return null
  }
  const head = h.headSha.toLowerCase()
  const prs = facts.snapshot.facts.filter((x) => x.kind === 'pull_request')
  const commits = facts.snapshot.facts.filter((x) => x.kind === 'commit')
  const checks = facts.snapshot.facts.filter((x) => x.kind === 'check_run')
  if (
    prs.length !== 1 ||
    prs[0].number !== h.binding.prNumber ||
    prs[0].headSha !== head ||
    commits.length !== 1 ||
    commits[0].sha !== head ||
    checks.some((x) => x.headSha !== head)
  ) {
    return null
  }
  // All fields are re-projected through the bounded v1 G1 parser.
  return {
    version: 1,
    projectId: h.binding.projectId,
    prNumber: h.binding.prNumber,
    headSha: head,
    snapshot: facts.snapshot
  }
}

/** One operation, one final synchronous handoff. A new operation requires a new fence. */
export class MainSelectedPrFactDeliveryFence {
  private consumed = false
  private delivering = false

  constructor(private readonly options: Options) {}

  deliver(projection: ReadyProjection): boolean {
    if (this.consumed || this.delivering) {
      return false
    }
    // Reserve before calling potentially reentrant Main authority callbacks.
    this.consumed = true
    this.delivering = true
    try {
      if (!this.options.isEnabled() || !this.options.isAuthorizedNow()) {
        return false
      }
      const head = structuredClone(this.options.readCurrent())
      const now = this.options.nowMs()
      if (!head || !validHead(head, now)) {
        return false
      }
      const expected = JSON.stringify(head)
      const packet = packetFor(projection, head, now)
      if (!packet) {
        return false
      }
      // No await is allowed between this reauthentication and send().
      if (!this.options.isEnabled() || !this.options.isAuthorizedNow()) {
        return false
      }
      const stillCurrent = structuredClone(this.options.readCurrent())
      if (
        !stillCurrent ||
        !validHead(stillCurrent, this.options.nowMs()) ||
        JSON.stringify(stillCurrent) !== expected
      ) {
        return false
      }
      if (!this.options.isAuthorizedNow() || !this.options.isEnabled()) {
        return false
      }
      this.options.send(packet)
      return true
    } catch {
      // No raw exception, credentials, process data or GraphQL error leaves Main.
      return false
    } finally {
      this.delivering = false
    }
  }
}
