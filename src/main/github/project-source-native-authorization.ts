import type {
  TrustedSelectedPrBinding,
  VerifiedSourceDocument
} from './project-source-grant-registry'

/** B4c must create this from current #158/#159 authority, never from IPC arguments. */
type MainNativeSourceLease = {
  document: VerifiedSourceDocument
  projectId: string
  workspaceId: string
  selectionRevision: number
  bindingRevision: number
  grantRevision: number
  sessionIncarnation: string
  /** New Main-issued nonce for each explicit user action, separate from a read grant. */
  actionId: string
  expiresAtMs: number
  signal: AbortSignal
  /** Recheck catalog, binding, document, Session, Window and every revision. */
  isCurrent(): boolean
}
export type MainNativeRegistrationLease = MainNativeSourceLease & {
  operation: 'repositoryRegistration'
  repository: { host: 'github.com'; owner: string; name: string }
  expectedIdentity?: { id: number; nodeId: string }
}
export type MainNativeSelectedPrLease = MainNativeSourceLease & {
  operation: 'selectedPrRead'
  binding: TrustedSelectedPrBinding
  headSha: string
}
export type MainNativeSelectedPrSnapshotLease = Omit<MainNativeSelectedPrLease, 'headSha'>
