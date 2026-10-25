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
  parseSelectedPrSnapshotResponse,
  repositoryRegistrationVariables,
  selectedPrVariables,
  selectedPrSnapshotVariables
} from './project-source-native-operations'
import type { SelectedGitHubPrProjection } from '../../shared/github/selected-pr-graphql-projection'

import type {
  MainNativeRegistrationLease,
  MainNativeSelectedPrLease,
  MainNativeSelectedPrSnapshotLease
} from './project-source-native-authorization'
import {
  nativeSelectedPrScope,
  nativeSourceLeaseFingerprint as fingerprint,
  validNativeSourceLease,
  type MainNativeSourceLease as Lease
} from './project-source-native-lease'
import { executeMainFixedRead, type MainNativeFixedReadExecutor } from './project-source-fixed-read'
export type { MainNativeFixedReadRequest } from './project-source-fixed-read'
export type {
  MainNativeRegistrationLease,
  MainNativeSelectedPrLease,
  MainNativeSelectedPrSnapshotLease
}
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

export class MainNativeGitHubTransport {
  private pending: AbortController | null = null
  private epoch = 0
  private retired = false
  private readonly consumed = new WeakSet<Lease>()
  private readonly consumedActions = new Set<string>()
  private readonly enabled: boolean
  private readonly principal: MainNativeGitHubPrincipal
  private readonly policy: RunnerPolicy
  private readonly executeRaw?: MainNativeFixedReadExecutor

  constructor(options: {
    enabled?: boolean
    principal: MainNativeGitHubPrincipal
    runner: RunnerPolicy
    /** Main-only injection; production bootstrap never supplies this source. */
    executeRaw?: MainNativeFixedReadExecutor
  }) {
    this.enabled = options.enabled === true
    this.principal = options.principal
    this.executeRaw = options.executeRaw
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
    return validNativeSourceLease(lease, this.principal, this.retired)
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
    let actionId: string
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
      actionId = lease.actionId
      if (this.consumedActions.has(actionId) || this.consumedActions.size >= 256) {
        return { status: 'denied' }
      }
    } catch {
      return { status: 'denied' }
    }
    if (this.pending || nativeTransportBusy) {
      return { status: 'busy' }
    }
    this.consumed.add(lease)
    this.consumedActions.add(actionId)
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
    let rawIdle: Promise<void> | undefined
    try {
      assertCurrent()
      const principal = this.principal.current()
      if (!principal) {
        return { status: 'revoked' }
      }
      const request = {
        operation,
        variables: { ...variables },
        deadlineMs: Math.min(start + 15_000, lease.expiresAtMs),
        signal: controller.signal
      }
      let response: string
      if (this.executeRaw) {
        response = await executeMainFixedRead(
          {
            ...request,
            query:
              operation === 'repositoryRegistration'
                ? GITHUB_REGISTRATION_QUERY
                : GITHUB_SELECTED_PR_QUERY
          },
          (boundedRequest) => {
            assertCurrent()
            const executing = Promise.resolve(this.executeRaw!(boundedRequest))
            rawIdle = executing.then(
              () => undefined,
              () => undefined
            )
            return executing
          }
        )
      } else {
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
        response = await runner.execute(request)
      }
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
      } else if (rawIdle) {
        void rawIdle.then(release, release)
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
    const scope = nativeSelectedPrScope(lease)
    if (!scope) {
      return { status: 'denied' }
    }
    return this.run(lease, 'selectedPrRead', selectedPrVariables(scope, lease.headSha), (input) =>
      parseSelectedPrResponse(input, scope, lease.headSha, Date.now())
    )
  }

  async readSelectedSnapshot(
    lease: MainNativeSelectedPrSnapshotLease
  ): Promise<SelectedGitHubPrProjection | Failure> {
    if (!this.enabled) {
      return { status: 'disabled' }
    }
    const scope = nativeSelectedPrScope(lease)
    if (!scope) {
      return { status: 'denied' }
    }
    return this.run(lease, 'selectedPrRead', selectedPrSnapshotVariables(scope), (input) =>
      parseSelectedPrSnapshotResponse(input, scope, Date.now())
    )
  }
}
