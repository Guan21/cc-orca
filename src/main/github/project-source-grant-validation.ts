import type {
  TrustedSelectedPrBinding,
  VerifiedSourceDocument
} from './project-source-grant-registry'

function bounded(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
}

export function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function validDocument(
  value: VerifiedSourceDocument | null
): value is VerifiedSourceDocument {
  return (
    value !== null &&
    value.profile === 'personal-packaged' &&
    value.executionRealm === 'native' &&
    positive(value.windowId) &&
    positive(value.webContentsId) &&
    nonnegative(value.frameProcessId) &&
    nonnegative(value.frameRoutingId) &&
    nonnegative(value.credentialGeneration) &&
    bounded(value.installationId) &&
    bounded(value.documentId) &&
    bounded(value.sessionPartition) &&
    bounded(value.principalId)
  )
}

export function validBinding(value: TrustedSelectedPrBinding): boolean {
  return (
    bounded(value.projectId) &&
    (value.workspaceKind === 'folder' || value.workspaceKind === 'worktree') &&
    bounded(value.workspaceId) &&
    bounded(value.hostSetupId) &&
    bounded(value.executionHostId) &&
    value.repository?.host === 'github.com' &&
    positive(value.repository.id) &&
    bounded(value.repository.nodeId) &&
    bounded(value.repository.owner) &&
    bounded(value.repository.name) &&
    positive(value.prNumber)
  )
}

export function copyDocument(d: VerifiedSourceDocument): VerifiedSourceDocument {
  return Object.freeze({ ...d })
}

export function copyBinding(b: TrustedSelectedPrBinding): TrustedSelectedPrBinding {
  return Object.freeze({ ...b, repository: Object.freeze({ ...b.repository }) })
}

export function sameDocument(a: VerifiedSourceDocument, b: VerifiedSourceDocument): boolean {
  return (
    a.profile === b.profile &&
    a.executionRealm === b.executionRealm &&
    a.installationId === b.installationId &&
    a.windowId === b.windowId &&
    a.webContentsId === b.webContentsId &&
    a.frameProcessId === b.frameProcessId &&
    a.frameRoutingId === b.frameRoutingId &&
    a.documentId === b.documentId &&
    a.sessionPartition === b.sessionPartition &&
    a.principalId === b.principalId &&
    a.credentialGeneration === b.credentialGeneration
  )
}
