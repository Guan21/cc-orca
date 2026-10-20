/**
 * #116 / #152 G2-B4a — OFFLINE Main-owned Project ↔ immutable GitHub repository
 * registration boundary. This file performs no network I/O and installs no IPC.
 *
 * Catalog/selection/principal callbacks MUST be sourced in Electron Main from
 * the actual Store, active workspace and authenticated native account — never
 * from a renderer-supplied "trusted" selection or repo ID.
 *
 * The optional verifier is deliberately absent by default. Only a separately
 * reviewed, manually approved, fixed native GitHub registration operation may
 * later supply it. The verifier's return value is not by itself consent for
 * PR refresh; #158/#159 must still issue an explicit document-bound grant.
 */
import type { Project, ProjectHostSetup } from '../../shared/project-types'
import type { Repo } from '../../shared/repo-types'
import type { TrustedSelectedPrBinding } from './project-source-grant-registry'

export type MainSelectedRepositoryContext = Readonly<{
  projectId: string
  repoId: string
  hostSetupId: string
  /** Main-maintained monotonic epoch incremented on every selection, including A→B→A. */
  selectionRevision: number
  workspaceKind: 'folder' | 'worktree'
  workspaceId: string
  prNumber: number
}>

export type MainVerifiedGhAccount = Readonly<{
  principalId: string
  credentialGeneration: number
}>

export type MainVerifiedRepositoryIdentity = Readonly<{
  host: 'github.com'
  id: number
  nodeId: string
  nameWithOwner: string
  principalId: string
  credentialGeneration: number
}>

export type MainRepositoryCatalog = Readonly<{
  projects: readonly Project[]
  setups: readonly ProjectHostSetup[]
  repos: readonly Repo[]
}>

export type MainRepositoryRegistrationDependencies = Readonly<{
  readCatalog: () => MainRepositoryCatalog
  readSelection: () => MainSelectedRepositoryContext | null
  readPrincipal: () => MainVerifiedGhAccount | null
  /** Main must independently prove worktree ownership; default is deny. */
  isCurrentWorktree?: (selection: MainSelectedRepositoryContext) => boolean
  /**
   * OFF by default. Later native transport must explicitly approve each
   * registration request, verify effective credentials, and return exact IDs.
   */
  verifyRepository?: (
    repo: Readonly<{ host: 'github.com'; owner: string; name: string }>,
    signal: AbortSignal
  ) => Promise<MainVerifiedRepositoryIdentity | null>
}>

type Candidate = Readonly<{
  fingerprint: string
  binding: Omit<TrustedSelectedPrBinding, 'repository'> & {
    repository: Readonly<{ host: 'github.com'; owner: string; name: string }>
  }
  principal: MainVerifiedGhAccount
}>

type Registered = Readonly<{
  fingerprint: string
  identity: MainVerifiedRepositoryIdentity
}>

export type RegistrationResult = 'registered' | 'denied' | 'stale' | 'unavailable'

function safeString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
}

function namePart(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value)
}

function safePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function safeGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * The ephemeral registration must never survive A → B → A, change of
 * workspace/worktree, logout, credential replacement or Project catalog edit.
 * It proves only the static registered identity, NOT a read permission.
 */
export class MainRegisteredSelectedPrRepository {
  private pending: AbortController | null = null
  private registered: Registered | null = null
  private revision = 0

  constructor(private readonly deps: MainRepositoryRegistrationDependencies) {}

  retireAll(): void {
    this.revision += 1
    this.pending?.abort()
    this.pending = null
    this.registered = null
  }

  private candidate(): Candidate | null {
    const selected = this.deps.readSelection()
    const principal = this.deps.readPrincipal()
    if (
      !selected ||
      !principal ||
      !safeString(principal.principalId) ||
      !safeGeneration(principal.credentialGeneration) ||
      !safeString(selected.projectId) ||
      !safeString(selected.repoId) ||
      !safeString(selected.hostSetupId) ||
      !safeGeneration(selected.selectionRevision) ||
      !safeString(selected.workspaceId) ||
      !safePositive(selected.prNumber)
    ) {
      return null
    }
    const catalog = this.deps.readCatalog()
    const project = catalog.projects.find((item) => item.id === selected.projectId)
    const setup = catalog.setups.find((item) => item.id === selected.hostSetupId)
    const repo = catalog.repos.find((item) => item.id === selected.repoId)
    const provider = project?.providerIdentity
    if (
      !project ||
      !setup ||
      !repo ||
      provider?.provider !== 'github' ||
      (provider.host !== undefined && provider.host !== 'github.com') ||
      !namePart(provider.owner) ||
      !namePart(provider.repo) ||
      !project.sourceRepoIds.includes(repo.id) ||
      setup.projectId !== project.id ||
      setup.repoId !== repo.id ||
      setup.hostId !== 'local' ||
      (setup.executionHostId != null && setup.executionHostId !== 'local') ||
      setup.connectionId != null ||
      setup.setupState !== 'ready' ||
      repo.kind !== 'git' ||
      repo.connectionId != null ||
      (repo.executionHostId != null && repo.executionHostId !== 'local') ||
      repo.gitRemoteIdentity?.canonicalKey.toLowerCase() !==
        `github.com/${provider.owner}/${provider.repo}`.toLowerCase()
    ) {
      return null
    }
    // Folder UUID/root identity lacks an authoritative Project mapping in this catalog.
    if (selected.workspaceKind !== 'worktree' || this.deps.isCurrentWorktree?.(selected) !== true) {
      return null
    }
    const binding = {
      projectId: project.id,
      workspaceKind: selected.workspaceKind,
      workspaceId: selected.workspaceId,
      hostSetupId: setup.id,
      executionHostId: 'local',
      repository: {
        host: 'github.com' as const,
        owner: provider.owner,
        name: provider.repo
      },
      prNumber: selected.prNumber
    }
    const fingerprint = JSON.stringify([
      binding,
      selected.selectionRevision,
      project.updatedAt,
      project.sourceRepoIds,
      setup.updatedAt,
      setup.path,
      repo.path,
      repo.gitRemoteIdentity,
      principal.principalId,
      principal.credentialGeneration
    ])
    return { fingerprint, binding, principal }
  }

  /**
   * Called only after an explicit, Main-owned registration gesture.
   * No verifier => fail closed with no API access.
   */
  async registerSelected(): Promise<RegistrationResult> {
    this.retireAll()
    const before = this.candidate()
    const verifier = this.deps.verifyRepository
    if (!before || !verifier) {
      return 'denied'
    }
    const revision = this.revision
    const controller = new AbortController()
    this.pending = controller
    let verified: MainVerifiedRepositoryIdentity | null
    try {
      verified = await verifier(before.binding.repository, controller.signal)
    } catch {
      return controller.signal.aborted ? 'stale' : 'unavailable'
    } finally {
      if (this.pending === controller) {
        this.pending = null
      }
    }
    const after = this.candidate()
    if (
      controller.signal.aborted ||
      revision !== this.revision ||
      !after ||
      after.fingerprint !== before.fingerprint
    ) {
      return 'stale'
    }
    if (
      !verified ||
      verified.host !== 'github.com' ||
      !safePositive(verified.id) ||
      !safeString(verified.nodeId) ||
      !safeString(verified.nameWithOwner) ||
      verified.nameWithOwner.toLowerCase() !==
        `${before.binding.repository.owner}/${before.binding.repository.name}`.toLowerCase() ||
      verified.principalId !== before.principal.principalId ||
      verified.credentialGeneration !== before.principal.credentialGeneration
    ) {
      return 'denied'
    }
    this.registered = {
      fingerprint: before.fingerprint,
      // Allowlist only registered identifiers; never retain arbitrary response
      // fields (the injected verifier could expose raw API fields or secrets).
      identity: Object.freeze({
        host: 'github.com',
        id: verified.id,
        nodeId: verified.nodeId,
        nameWithOwner: verified.nameWithOwner,
        principalId: verified.principalId,
        credentialGeneration: verified.credentialGeneration
      })
    }
    return 'registered'
  }

  /**
   * Only a Main-owned consumer may pass this to B3.selectTrusted().
   * B3 must still authenticate the Electron event and obtain native consent.
   */
  currentBinding(): TrustedSelectedPrBinding | null {
    const before = this.candidate()
    const registered = this.registered
    if (!before || !registered || before.fingerprint !== registered.fingerprint) {
      this.retireAll()
      return null
    }
    return Object.freeze({
      ...before.binding,
      repository: Object.freeze({
        ...before.binding.repository,
        id: registered.identity.id,
        nodeId: registered.identity.nodeId
      })
    })
  }
}
