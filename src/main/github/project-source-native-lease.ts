import type { MainNativeGitHubPrincipal } from './project-source-native-principal'
import type { SelectedGitHubPrScope } from '../../shared/github/selected-pr-graphql-projection'
import type {
  MainNativeRegistrationLease,
  MainNativeSelectedPrLease,
  MainNativeSelectedPrSnapshotLease
} from './project-source-native-authorization'

export type MainNativeSourceLease =
  | MainNativeRegistrationLease
  | MainNativeSelectedPrLease
  | MainNativeSelectedPrSnapshotLease

export function nativeSelectedPrScope(
  lease: MainNativeSelectedPrSnapshotLease
): SelectedGitHubPrScope | null {
  const binding = lease.binding
  if (
    !binding ||
    binding.projectId !== lease.projectId ||
    binding.workspaceId !== lease.workspaceId ||
    binding.executionHostId !== 'local'
  ) {
    return null
  }
  return {
    source: {
      projectId: binding.projectId,
      bindingRevision: lease.bindingRevision,
      repository: {
        host: binding.repository.host,
        id: binding.repository.id,
        owner: binding.repository.owner,
        name: binding.repository.name
      }
    },
    repositoryNodeId: binding.repository.nodeId,
    prNumber: binding.prNumber
  }
}

function positive(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}
function bounded(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
}
export function nativeSourceLeaseFingerprint(lease: MainNativeSourceLease): string {
  return JSON.stringify({
    operation: lease.operation,
    document: lease.document,
    projectId: lease.projectId,
    workspaceId: lease.workspaceId,
    selectionRevision: lease.selectionRevision,
    bindingRevision: lease.bindingRevision,
    grantRevision: lease.grantRevision,
    sessionIncarnation: lease.sessionIncarnation,
    actionId: lease.actionId,
    expiresAtMs: lease.expiresAtMs,
    ...(lease.operation === 'repositoryRegistration'
      ? { repository: lease.repository, expectedIdentity: lease.expectedIdentity }
      : { binding: lease.binding, headSha: 'headSha' in lease ? lease.headSha : undefined })
  })
}
export function validNativeSourceLease(
  lease: MainNativeSourceLease,
  principal: MainNativeGitHubPrincipal,
  retired: boolean
): boolean {
  const current = principal.current()
  const d = lease.document
  const now = Date.now()
  return (
    !retired &&
    current !== null &&
    d?.profile === 'personal-packaged' &&
    d.executionRealm === 'native' &&
    positive(d.windowId) &&
    positive(d.webContentsId) &&
    Number.isSafeInteger(d.frameProcessId) &&
    d.frameProcessId >= 0 &&
    Number.isSafeInteger(d.frameRoutingId) &&
    d.frameRoutingId >= 0 &&
    bounded(d.installationId) &&
    bounded(d.documentId) &&
    bounded(d.sessionPartition) &&
    d.principalId === current.principalId &&
    d.credentialGeneration === current.credentialGeneration &&
    bounded(lease.projectId) &&
    bounded(lease.workspaceId) &&
    bounded(lease.sessionIncarnation) &&
    bounded(lease.actionId) &&
    [lease.selectionRevision, lease.bindingRevision, lease.grantRevision].every(positive) &&
    Number.isFinite(lease.expiresAtMs) &&
    lease.expiresAtMs > now &&
    lease.expiresAtMs <= now + 15 * 60_000 &&
    !lease.signal.aborted &&
    lease.isCurrent() === true
  )
}
