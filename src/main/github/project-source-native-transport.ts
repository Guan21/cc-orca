import {
  createProjectSourceNativeGhRunner,
  ProjectSourceNativeGhError,
  type ProjectSourceNativeGhRunner,
  type ProjectSourceNativeGhOptions
} from '../git/command-runner/project-source-native-gh'
import type { MainVerifiedRepositoryIdentity } from './project-source-main-repository-registration'
import type { MainNativeGitHubPrincipal } from './project-source-native-principal'
import {
  GITHUB_REGISTRATION_QUERY,
  GITHUB_SELECTED_PR_QUERY,
  parseRepositoryRegistrationResponse,
  parseSelectedPrResponse,
  repositoryRegistrationVariables,
  selectedPrVariables
} from './project-source-native-operations'
import type { SelectedGitHubPrProjection } from '../../shared/github/selected-pr-graphql-projection'

import type {
  MainNativeRegistrationLease,
  MainNativeSelectedPrLease
} from './project-source-native-authorization'
export type {
  MainNativeRegistrationLease,
  MainNativeSelectedPrLease
} from './project-source-native-authorization'
type Lease = MainNativeRegistrationLease | MainNativeSelectedPrLease
type RunnerPolicy = Omit<
  ProjectSourceNativeGhOptions,
  | 'enabled'
  | 'fixedQueries'
  | 'expectedPrincipalId'
  | 'expectedCredentialGeneration'
  | 'readCredentialAttestation'
  | 'assertAuthorized'
>
type Failure =
  | { status: 'disabled' | 'denied' | 'busy' | 'revoked' | 'unavailable' }
  | { status: 'transport_error'; code: string }
type Registration = { status: 'registered'; identity: MainVerifiedRepositoryIdentity } | Failure
let nativeTransportBusy = false

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
function fingerprint(lease: Lease): string {
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
      ? {
          repository: lease.repository,
          expectedIdentity: lease.expectedIdentity
        }
      : { binding: lease.binding, headSha: lease.headSha })
  })
}

/** Unwired Main-only composition; neither this class nor enabled=true issues grants. */
export class MainNativeGitHubTransport {
  private pending: AbortController | null = null
  private epoch = 0
  private retired = false
  private readonly consumed = new WeakSet<Lease>()
  private readonly consumedActions = new Set<string>()
  private readonly enabled: boolean
  private readonly principal: MainNativeGitHubPrincipal
  private readonly policy: RunnerPolicy

  constructor(options: {
    enabled?: boolean
    principal: MainNativeGitHubPrincipal
    runner: RunnerPolicy
  }) {
    this.enabled = options.enabled === true
    this.principal = options.principal
    this.policy = Object.freeze({
      ...options.runner,
      executable: Object.freeze({ ...options.runner.executable }),
      environment: Object.freeze({ ...options.runner.environment })
    })
  }

  retireAll(): void {
    this.retired = true
    this.epoch += 1
    this.pending?.abort()
  }

  private valid(lease: Lease): boolean {
    const current = this.principal.current()
    const d = lease.document
    const now = Date.now()
    return (
      !this.retired &&
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
      positive(lease.selectionRevision) &&
      positive(lease.bindingRevision) &&
      positive(lease.grantRevision) &&
      Number.isFinite(lease.expiresAtMs) &&
      lease.expiresAtMs > now &&
      lease.expiresAtMs <= now + 15 * 60_000 &&
      !lease.signal.aborted &&
      lease.isCurrent() === true
    )
  }

  private async run<T>(
    lease: Lease,
    operation: Lease['operation'],
    variables: Readonly<Record<string, string | number>> | null,
    parse: (input: unknown) => T
  ): Promise<T | Failure> {
    if (!this.enabled) {
      return { status: 'disabled' }
    }
    if (this.pending || nativeTransportBusy) {
      return { status: 'busy' }
    }
    const start = Date.now()
    let initial: string
    try {
      if (
        lease.operation !== operation ||
        !variables ||
        this.consumed.has(lease) ||
        !this.valid(lease)
      ) {
        return { status: 'denied' }
      }
      initial = fingerprint(lease)
      if (this.consumedActions.has(lease.actionId) || this.consumedActions.size >= 256) {
        return { status: 'denied' }
      }
    } catch {
      return { status: 'denied' }
    }
    this.consumed.add(lease)
    this.consumedActions.add(lease.actionId)
    nativeTransportBusy = true
    const epoch = this.epoch
    const controller = new AbortController()
    this.pending = controller
    const abort = (): void => controller.abort()
    lease.signal.addEventListener('abort', abort, { once: true })
    const assertCurrent = (): void => {
      if (
        controller.signal.aborted ||
        epoch !== this.epoch ||
        !this.valid(lease) ||
        fingerprint(lease) !== initial
      ) {
        throw new Error('AUTHORIZATION_REVOKED')
      }
    }
    let runner: ProjectSourceNativeGhRunner | undefined
    try {
      assertCurrent()
      const principal = this.principal.current()
      if (!principal) {
        return { status: 'revoked' }
      }
      runner = createProjectSourceNativeGhRunner({
        ...this.policy,
        enabled: true,
        fixedQueries: {
          repositoryRegistration: GITHUB_REGISTRATION_QUERY,
          selectedPrRead: GITHUB_SELECTED_PR_QUERY
        },
        expectedPrincipalId: principal.principalId,
        expectedCredentialGeneration: principal.credentialGeneration,
        readCredentialAttestation: () => this.principal.current(),
        assertAuthorized: assertCurrent
      })
      const response = await runner.execute({
        operation,
        variables: { ...variables },
        deadlineMs: Math.min(start + 15_000, lease.expiresAtMs),
        signal: controller.signal
      })
      assertCurrent()
      if (Date.now() >= start + 15_000) {
        return { status: 'transport_error', code: 'DEADLINE' }
      }
      if (Buffer.byteLength(response) > 1024 * 1024) {
        return { status: 'transport_error', code: 'RESPONSE_TOO_LARGE' }
      }
      const result = parse(JSON.parse(response) as unknown)
      assertCurrent()
      if (Date.now() >= start + 15_000) {
        return { status: 'transport_error', code: 'DEADLINE' }
      }
      return result
    } catch (error) {
      try {
        assertCurrent()
      } catch {
        return { status: 'revoked' }
      }
      return error instanceof ProjectSourceNativeGhError
        ? { status: 'transport_error', code: error.code }
        : { status: 'unavailable' }
    } finally {
      lease.signal.removeEventListener('abort', abort)
      if (this.pending === controller) {
        this.pending = null
      }
      const release = (): void => {
        nativeTransportBusy = false
      }
      if (runner) {
        void runner.whenIdle().then(release, release)
      } else {
        release()
      }
    }
  }

  async register(lease: MainNativeRegistrationLease): Promise<Registration> {
    if (!this.enabled) {
      return { status: 'disabled' }
    }
    const account = this.principal.current()
    return this.run(
      lease,
      'repositoryRegistration',
      lease.repository?.host === 'github.com'
        ? repositoryRegistrationVariables(lease.repository)
        : null,
      (input): Registration => {
        if (!account) {
          return { status: 'denied' }
        }
        const identity = parseRepositoryRegistrationResponse(input, {
          ...lease.repository,
          principalId: account.principalId,
          credentialGeneration: account.credentialGeneration,
          expectedIdentity: lease.expectedIdentity
        })
        return identity ? { status: 'registered', identity } : { status: 'unavailable' }
      }
    )
  }

  async readSelected(
    lease: MainNativeSelectedPrLease
  ): Promise<SelectedGitHubPrProjection | Failure> {
    const binding = lease.binding
    if (
      !binding ||
      binding.projectId !== lease.projectId ||
      binding.workspaceId !== lease.workspaceId ||
      binding.executionHostId !== 'local'
    ) {
      return { status: 'denied' }
    }
    const scope = {
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
    return this.run(lease, 'selectedPrRead', selectedPrVariables(scope, lease.headSha), (input) =>
      parseSelectedPrResponse(input, scope, lease.headSha, Date.now())
    )
  }
}
