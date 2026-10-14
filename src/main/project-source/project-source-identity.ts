import type { Project, ProjectHostSetup } from '../../shared/project-types'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { ProjectSourceScope } from '../../shared/project-source/project-source-access'
import { canonicalWorktreeIdentity } from '../../shared/worktree/identity'

/** Record consistency is necessary, but is never source or filesystem attestation. */
export type ProjectSourceIdentityRecords = {
  projects: Pick<Project, 'id' | 'sourceRepoIds'>[]
  setups: Pick<
    ProjectHostSetup,
    | 'id'
    | 'projectId'
    | 'repoId'
    | 'hostId'
    | 'executionHostId'
    | 'connectionId'
    | 'runtimeOwnerEnvironmentId'
    | 'path'
    | 'kind'
    | 'setupState'
  >[]
  repositories: Pick<Repo, 'id' | 'executionHostId' | 'connectionId' | 'path' | 'kind'>[]
  worktrees: Pick<
    Worktree,
    | 'id'
    | 'repoId'
    | 'projectId'
    | 'projectHostSetupId'
    | 'hostId'
    | 'instanceId'
    | 'identity'
    | 'runtimeOwnerEnvironmentId'
    | 'path'
  >[]
  folders: Pick<FolderWorkspace, 'id' | 'projectGroupId' | 'executionHostId' | 'connectionId'>[]
}

export type ProjectSourceIdentitySelection = Pick<
  ProjectSourceScope,
  'projectId' | 'setupId' | 'repositoryId' | 'workspaceId' | 'executionHostId'
> &
  (
    | { readonly kind: 'git-worktree'; readonly worktreeId: string }
    | { readonly kind: 'folder-workspace'; readonly worktreeId: null }
  )

type IdentityDenialReason =
  | 'invalid_identity'
  | 'folder_ownership_missing'
  | 'missing_or_ambiguous_records'
  | 'conflicting_ownership'
  | 'native_host_not_proven'
  | 'checkout_identity_not_proven'

type IdentityDenial = { readonly status: 'NOT_PROVEN'; readonly reason: IdentityDenialReason }
export type MatchedProjectSourceRecords = {
  readonly status: 'matched-records'
  readonly identity: ProjectSourceIdentitySelection
  /** A change detector only, never an ownership or registration revision. */
  readonly recordSnapshot: string
}

function exactId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    value !== '*' &&
    value !== 'all'
  )
}

/** Main-private inspection only; selections and returned matches carry no authority. */
export function inspectProjectSourceIdentity(
  records: ProjectSourceIdentityRecords,
  selection: ProjectSourceIdentitySelection
): IdentityDenial | MatchedProjectSourceRecords {
  if (
    !selection ||
    ![
      selection.projectId,
      selection.setupId,
      selection.repositoryId,
      selection.workspaceId,
      selection.executionHostId
    ].every(exactId)
  ) {
    return { status: 'NOT_PROVEN', reason: 'invalid_identity' }
  }
  if (selection.kind === 'folder-workspace' && selection.worktreeId === null) {
    // FolderWorkspace.projectGroupId is sidebar organization, not Project ownership.
    return { status: 'NOT_PROVEN', reason: 'folder_ownership_missing' }
  }
  if (
    selection.kind !== 'git-worktree' ||
    !exactId(selection.worktreeId) ||
    selection.workspaceId !== selection.worktreeId
  ) {
    return { status: 'NOT_PROVEN', reason: 'invalid_identity' }
  }
  const projects = records.projects.filter((row) => row.id === selection.projectId)
  const setups = records.setups.filter((row) => row.id === selection.setupId)
  const repositories = records.repositories.filter((row) => row.id === selection.repositoryId)
  const worktrees = records.worktrees.filter((row) => row.id === selection.worktreeId)
  if ([projects, setups, repositories, worktrees].some((rows) => rows.length !== 1)) {
    return { status: 'NOT_PROVEN', reason: 'missing_or_ambiguous_records' }
  }
  const [project] = projects
  const [setup] = setups
  const [repo] = repositories
  const [worktree] = worktrees
  const repositoryOwners = records.projects.filter((row) => row.sourceRepoIds.includes(repo.id))
  const repositorySetups = records.setups.filter((row) => row.repoId === repo.id)
  if (
    repositoryOwners.length !== 1 ||
    repositoryOwners[0] !== project ||
    repositorySetups.length !== 1 ||
    repositorySetups[0] !== setup ||
    setup.projectId !== project.id ||
    setup.repoId !== repo.id ||
    setup.setupState !== 'ready' ||
    setup.kind !== 'git' ||
    repo.kind !== 'git' ||
    !setup.path ||
    setup.path !== repo.path ||
    worktree.projectId !== project.id ||
    worktree.repoId !== repo.id ||
    worktree.projectHostSetupId !== setup.id ||
    records.folders.some((row) => row.id === selection.workspaceId)
  ) {
    return { status: 'NOT_PROVEN', reason: 'conflicting_ownership' }
  }
  // Explicit local stamps are required; normal routing's legacy-local fallback is unsafe here.
  if (
    selection.executionHostId !== 'local' ||
    setup.hostId !== 'local' ||
    setup.executionHostId !== 'local' ||
    repo.executionHostId !== 'local' ||
    worktree.hostId !== 'local' ||
    setup.connectionId != null ||
    repo.connectionId != null ||
    setup.runtimeOwnerEnvironmentId !== undefined ||
    worktree.runtimeOwnerEnvironmentId !== undefined
  ) {
    return { status: 'NOT_PROVEN', reason: 'native_host_not_proven' }
  }
  const identity = worktree.identity
  if (
    !exactId(worktree.instanceId) ||
    !identity ||
    identity.instanceId !== worktree.instanceId ||
    identity.executionHostId !== 'local' ||
    identity.key !==
      canonicalWorktreeIdentity({
        worktreeId: worktree.id,
        executionHostId: 'local',
        instanceId: worktree.instanceId
      })
  ) {
    return { status: 'NOT_PROVEN', reason: 'checkout_identity_not_proven' }
  }
  return Object.freeze({
    status: 'matched-records',
    identity: Object.freeze({ ...selection }),
    recordSnapshot: JSON.stringify([project, setup, repo, worktree])
  })
}

export function projectSourceIdentityIsCurrent(
  captured: MatchedProjectSourceRecords,
  records: ProjectSourceIdentityRecords
): boolean {
  const current = inspectProjectSourceIdentity(records, captured.identity)
  return current.status === 'matched-records' && current.recordSnapshot === captured.recordSnapshot
}

/** No production source is approved; no caller-supplied catalog can bypass missing proof. */
export function resolveProjectSourceBinding(
  records: ProjectSourceIdentityRecords,
  selection: ProjectSourceIdentitySelection
):
  | IdentityDenial
  | {
      readonly status: 'NOT_PROVEN'
      readonly reason: 'source_attestation_missing'
      readonly missing: readonly string[]
    } {
  const result = inspectProjectSourceIdentity(records, selection)
  if (result.status === 'NOT_PROVEN') {
    return result
  }
  return {
    status: 'NOT_PROVEN',
    reason: 'source_attestation_missing',
    missing: [
      'main_owned_namespace',
      'actual_execution_realm',
      'ownership_revision',
      'source_registration_revision',
      'stable_native_root_ownership',
      'approved_producer'
    ]
  }
}
