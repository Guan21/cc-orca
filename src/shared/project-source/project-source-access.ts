import { normalizeExecutionHostId, type ExecutionHostId } from '../execution-host'
import { parseDevelopmentEventReplay } from '../development-event-schema'
import type { DevelopmentEvent } from '../development-event-types'

/**
 * #116-A: a pure, deny-by-default policy contract.
 *
 * IMPORTANT: this module does NOT authenticate principals or producers and does not mint grants.
 * A trusted main/backend authority must verify both identities, own the grants and enforce
 * decisions BEFORE reading a source and BEFORE publishing a snapshot to the renderer.
 */
export type ProjectSourceScope = {
  readonly projectId: string
  /** Stable DevCrew repo identity, not a display name or path. */
  readonly repositoryId: string
  /** null means explicitly repo-wide; undefined/unknown is invalid. */
  readonly workspaceId: string | null
  /** null means explicitly all worktrees in this repo-wide authorized scope. */
  readonly worktreeId: string | null
  /** Always a concrete host; 'all' or a missing host is never an authorization scope. */
  readonly executionHostId: ExecutionHostId
}

export type ProjectSourcePermission = 'ingest-event' | 'read-snapshot'

/** These values must be resolved independently from trusted caller/source credentials. */
export type ProjectSourceAccessRequest = {
  readonly principalId: string
  readonly producerId: string
  readonly sourceId: string
  /** Bound event.source label, NOT proof of producer identity by itself. */
  readonly eventSourceName: string
  readonly scope: ProjectSourceScope
  readonly permission: ProjectSourcePermission
}

/** Only a trusted policy authority may create or load this grant. Never accept it from UI data. */
export type ProjectSourceGrant = {
  readonly principalId: string
  readonly producerId: string
  readonly sourceId: string
  readonly eventSourceName: string
  readonly scope: ProjectSourceScope
  readonly permissions: readonly ProjectSourcePermission[]
}

export type ProjectSourceAccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'invalid_identity' | 'not_authorized' }

export type ProjectSourceReplayDecision =
  | { readonly allowed: true; readonly events: readonly DevelopmentEvent[] }
  | {
      readonly allowed: false
      readonly reason: 'invalid_identity' | 'not_authorized' | 'invalid_events' | 'source_mismatch'
    }

const PERMISSIONS: readonly ProjectSourcePermission[] = ['ingest-event', 'read-snapshot']

function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    value !== '*' &&
    value !== 'all'
  )
}

function validOptionalScopeId(value: unknown): boolean {
  return value === null || validId(value)
}

function validScope(scope: ProjectSourceScope | null | undefined): boolean {
  return Boolean(
    scope &&
      validId(scope.projectId) &&
      validId(scope.repositoryId) &&
      validOptionalScopeId(scope.workspaceId) &&
      validOptionalScopeId(scope.worktreeId) &&
      normalizeExecutionHostId(scope.executionHostId) === scope.executionHostId
  )
}

function equalScope(left: ProjectSourceScope, right: ProjectSourceScope): boolean {
  return (
    left.projectId === right.projectId &&
    left.repositoryId === right.repositoryId &&
    left.workspaceId === right.workspaceId &&
    left.worktreeId === right.worktreeId &&
    left.executionHostId === right.executionHostId
  )
}

function validAccessRequest(request: ProjectSourceAccessRequest): boolean {
  return (
    validId(request.principalId) &&
    validId(request.producerId) &&
    validId(request.sourceId) &&
    validId(request.eventSourceName) &&
    validScope(request.scope) &&
    PERMISSIONS.includes(request.permission)
  )
}

function validGrant(grant: ProjectSourceGrant): boolean {
  return (
    Boolean(grant) &&
    validId(grant.principalId) &&
    validId(grant.producerId) &&
    validId(grant.sourceId) &&
    validId(grant.eventSourceName) &&
    validScope(grant.scope) &&
    Array.isArray(grant.permissions) &&
    grant.permissions.every((permission) => PERMISSIONS.includes(permission))
  )
}

/** Scope and principal/producer/source identity must match *exactly*; there is no wildcard. */
export function decideProjectSourceAccess(
  request: ProjectSourceAccessRequest,
  trustedGrants: readonly ProjectSourceGrant[]
): ProjectSourceAccessDecision {
  if (!validAccessRequest(request)) {
    return { allowed: false, reason: 'invalid_identity' }
  }

  const allowed = trustedGrants.some(
    (grant) =>
      validGrant(grant) &&
      grant.principalId === request.principalId &&
      grant.producerId === request.producerId &&
      grant.sourceId === request.sourceId &&
      grant.eventSourceName === request.eventSourceName &&
      equalScope(grant.scope, request.scope) &&
      grant.permissions.includes(request.permission)
  )

  return allowed ? { allowed: true } : { allowed: false, reason: 'not_authorized' }
}

/**
 * Atomically validate and scope an inbound replay *after* a trusted caller has
 * authenticated the producer and obtained policy-controlled grants.
 *
 * DevelopmentEvent v1's projectId and source are self-asserted labels. Checking
 * them here prevents accidental mixing; it is not producer authentication.
 * Nothing is projected when any replay entry fails.
 */
export function admitProjectSourceReplay(
  rawEvents: unknown,
  identity: Omit<ProjectSourceAccessRequest, 'permission'>,
  trustedGrants: readonly ProjectSourceGrant[]
): ProjectSourceReplayDecision {
  const access = decideProjectSourceAccess(
    { ...identity, permission: 'ingest-event' },
    trustedGrants
  )
  if (!access.allowed) {
    return access
  }

  const parsed = parseDevelopmentEventReplay(rawEvents)
  if (!parsed.ok) {
    return { allowed: false, reason: 'invalid_events' }
  }
  if (
    parsed.events.some(
      (event) =>
        event.projectId !== identity.scope.projectId || event.source !== identity.eventSourceName
    )
  ) {
    return { allowed: false, reason: 'source_mismatch' }
  }
  return { allowed: true, events: parsed.events }
}
