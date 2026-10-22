import type {
  TrustedSelectedPrBinding,
  VerifiedSourceDocument
} from './project-source-grant-registry'

export type MainSelectedPrHeadAuthority = Readonly<{
  document: VerifiedSourceDocument
  binding: TrustedSelectedPrBinding
  bindingRevision: number
  selectionRevision: number
  grantRevision: number
  sessionIncarnation: string
}>

export type MainPinnedSelectedPrHead = MainSelectedPrHeadAuthority &
  Readonly<{ headSha: string; observedAtMs: number }>

export type MainSelectedPrHeadEvidence = MainPinnedSelectedPrHead & Readonly<{ version: 1 }>

export const MAX_SELECTED_PR_HEAD_AGE_MS = 5 * 60_000
const HEX_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i
const record = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)
const small = (x: unknown): x is string =>
  typeof x === 'string' &&
  x.length > 0 &&
  x.length <= 256 &&
  x.trim() === x &&
  ![...x].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
const positive = (x: unknown): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x > 0
const nonnegative = (x: unknown): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= 0

function validDocument(d: unknown): d is VerifiedSourceDocument {
  return (
    record(d) &&
    d.profile === 'personal-packaged' &&
    d.executionRealm === 'native' &&
    small(d.installationId) &&
    positive(d.windowId) &&
    positive(d.webContentsId) &&
    nonnegative(d.frameProcessId) &&
    nonnegative(d.frameRoutingId) &&
    small(d.documentId) &&
    small(d.sessionPartition) &&
    small(d.principalId) &&
    nonnegative(d.credentialGeneration)
  )
}

function validBinding(b: unknown): b is TrustedSelectedPrBinding {
  return (
    record(b) &&
    small(b.projectId) &&
    b.workspaceKind === 'worktree' &&
    small(b.workspaceId) &&
    small(b.hostSetupId) &&
    small(b.executionHostId) &&
    record(b.repository) &&
    b.repository.host === 'github.com' &&
    positive(b.repository.id) &&
    small(b.repository.nodeId) &&
    small(b.repository.owner) &&
    small(b.repository.name) &&
    positive(b.prNumber)
  )
}

export function validMainSelectedPrAuthority(h: unknown): h is MainSelectedPrHeadAuthority {
  return (
    record(h) &&
    validDocument(h.document) &&
    validBinding(h.binding) &&
    positive(h.bindingRevision) &&
    positive(h.selectionRevision) &&
    positive(h.grantRevision) &&
    small(h.sessionIncarnation)
  )
}

export function validMainSelectedPrHead(h: unknown, now: number): h is MainPinnedSelectedPrHead {
  return (
    validMainSelectedPrAuthority(h) &&
    'headSha' in h &&
    typeof h.headSha === 'string' &&
    HEX_SHA.test(h.headSha) &&
    'observedAtMs' in h &&
    typeof h.observedAtMs === 'number' &&
    Number.isFinite(now) &&
    Number.isFinite(h.observedAtMs) &&
    h.observedAtMs <= now &&
    now - h.observedAtMs <= MAX_SELECTED_PR_HEAD_AGE_MS
  )
}

/** Copy only authority fields, never unknown adapter payload or credentials. */
export function copyMainSelectedPrAuthority(
  h: MainSelectedPrHeadAuthority
): MainSelectedPrHeadAuthority {
  const d = h.document
  const b = h.binding
  const r = b.repository
  return Object.freeze({
    document: Object.freeze({
      profile: d.profile,
      executionRealm: d.executionRealm,
      installationId: d.installationId,
      windowId: d.windowId,
      webContentsId: d.webContentsId,
      frameProcessId: d.frameProcessId,
      frameRoutingId: d.frameRoutingId,
      documentId: d.documentId,
      sessionPartition: d.sessionPartition,
      principalId: d.principalId,
      credentialGeneration: d.credentialGeneration
    }),
    binding: Object.freeze({
      projectId: b.projectId,
      workspaceKind: b.workspaceKind,
      workspaceId: b.workspaceId,
      hostSetupId: b.hostSetupId,
      executionHostId: b.executionHostId,
      repository: Object.freeze({
        host: r.host,
        id: r.id,
        nodeId: r.nodeId,
        owner: r.owner,
        name: r.name
      }),
      prNumber: b.prNumber
    }),
    bindingRevision: h.bindingRevision,
    selectionRevision: h.selectionRevision,
    grantRevision: h.grantRevision,
    sessionIncarnation: h.sessionIncarnation
  })
}

export function copyMainSelectedPrHead(h: MainPinnedSelectedPrHead): MainSelectedPrHeadEvidence {
  return Object.freeze({
    version: 1,
    ...copyMainSelectedPrAuthority(h),
    headSha: h.headSha.toLowerCase(),
    observedAtMs: h.observedAtMs
  })
}

export function versionedMainSelectedPrHead(h: unknown): h is MainSelectedPrHeadEvidence {
  return (
    record(h) &&
    h.version === 1 &&
    typeof h.observedAtMs === 'number' &&
    validMainSelectedPrHead(h, h.observedAtMs)
  )
}
