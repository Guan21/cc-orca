import { vi, type Mock } from 'vitest'
import type { GitHubFact } from '../../../shared/github/project-facts-read-model'
import type { SelectedGitHubPrProjection } from '../../../shared/github/selected-pr-graphql-projection'
import type { MainSelectedPrOperationContext } from '../project-source-grant-registry'
import type { MainSelectedPrHeadAuthority } from '../project-source-main-pr-head-contract'
import { MainTrustedSelectedPrHeadProvider } from '../project-source-main-pr-head-provider'

export const NOW = Date.parse('2026-10-22T12:00:00Z')
export const HEAD = 'a'.repeat(40)
export const OTHER_HEAD = 'b'.repeat(40)
export const AUTHORITY: MainSelectedPrHeadAuthority = {
  document: {
    profile: 'personal-packaged',
    executionRealm: 'native',
    installationId: 'installation-1',
    windowId: 1,
    webContentsId: 2,
    frameProcessId: 4,
    frameRoutingId: 6,
    documentId: 'document-1',
    sessionPartition: 'persist:main',
    principalId: 'principal-1',
    credentialGeneration: 5
  },
  binding: {
    projectId: 'project-1',
    workspaceKind: 'worktree',
    workspaceId: 'worktree-1',
    hostSetupId: 'host-1',
    executionHostId: 'native-host-1',
    repository: { host: 'github.com', id: 1001, nodeId: 'R_1', owner: 'Team', name: 'service' },
    prNumber: 12
  },
  bindingRevision: 8,
  selectionRevision: 9,
  grantRevision: 12,
  sessionIncarnation: 'incarnation-1'
}

export function head(authority = AUTHORITY) {
  return {
    version: 1 as const,
    ...authority,
    document: { ...authority.document },
    binding: { ...authority.binding, repository: { ...authority.binding.repository } },
    headSha: HEAD,
    observedAtMs: NOW - 1000
  }
}

export function context(authority = AUTHORITY): MainSelectedPrOperationContext {
  return {
    document: authority.document,
    bindingRevision: authority.bindingRevision,
    grantRevision: authority.grantRevision,
    sessionIncarnation: authority.sessionIncarnation,
    expiresAtMs: NOW + 60_000,
    isCurrent: () => true
  }
}

export function ready(
  facts?: readonly GitHubFact[]
): Extract<SelectedGitHubPrProjection, { status: 'ready' }> {
  return {
    status: 'ready',
    snapshot: {
      version: 1,
      projectId: AUTHORITY.binding.projectId,
      bindingRevision: AUTHORITY.bindingRevision,
      repository: { host: 'github.com', id: 1001, owner: 'Team', name: 'service' },
      fetchedAt: '2026-10-22T11:59:59Z',
      facts: facts ?? [
        {
          kind: 'pull_request',
          number: 12,
          headSha: HEAD,
          state: 'open',
          updatedAt: '2026-10-22T11:59:59Z'
        },
        { kind: 'commit', sha: HEAD },
        { kind: 'check_run', id: 80, headSha: HEAD, status: 'completed', conclusion: 'success' }
      ],
      attestation: 'not_verified_by_projection',
      agentExecution: 'unknown',
      taskCompletion: 'unknown'
    }
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}

type SelectedPrHeadFixture = {
  provider: MainTrustedSelectedPrHeadProvider
  raw: ReturnType<typeof head>
  readCurrent: Mock<() => MainSelectedPrHeadAuthority | null>
  readEvidence: Mock<
    (authority: MainSelectedPrHeadAuthority, signal: AbortSignal) => Promise<unknown>
  >
  owner: Mock<() => boolean>
  subscribeAuthority: Mock<(listener: () => void) => () => void>
  subscribeAdapter: Mock<(listener: () => void) => () => void>
  unlistenAuthority: Mock<() => void>
  unlistenAdapter: Mock<() => void>
  setCurrent(value: MainSelectedPrHeadAuthority | null): void
  setNow(value: number): void
  authorityChanged(): void
  adapterChanged(): void
  acquire(
    context?: MainSelectedPrOperationContext,
    signal?: AbortSignal
  ): ReturnType<MainTrustedSelectedPrHeadProvider['acquire']>
}

export function setup(
  options: Partial<ConstructorParameters<typeof MainTrustedSelectedPrHeadProvider>[0]> = {}
): SelectedPrHeadFixture {
  let current: MainSelectedPrHeadAuthority | null = structuredClone(AUTHORITY)
  let authorityListener: () => void = () => {}
  let adapterListener: () => void = () => {}
  let now = NOW
  const raw = head()
  const readCurrent = vi.fn(() => current)
  const readEvidence = vi.fn(
    async (_authority: MainSelectedPrHeadAuthority, _signal: AbortSignal): Promise<unknown> => raw
  )
  const unlistenAuthority = vi.fn()
  const unlistenAdapter = vi.fn()
  const subscribeAuthority = vi.fn((listener: () => void) => {
    authorityListener = listener
    return unlistenAuthority
  })
  const subscribeAdapter = vi.fn((listener: () => void) => {
    adapterListener = listener
    return unlistenAdapter
  })
  const owner = vi.fn(() => true)
  const provider = new MainTrustedSelectedPrHeadProvider({
    enabled: true,
    isOwnerAuthorized: owner,
    authority: { readCurrent, subscribeChanges: subscribeAuthority },
    adapter: { readEvidence, subscribeChanges: subscribeAdapter },
    nowMs: () => now,
    ...options
  })
  return {
    provider,
    raw,
    readCurrent,
    readEvidence,
    owner,
    subscribeAuthority,
    subscribeAdapter,
    unlistenAuthority,
    unlistenAdapter,
    setCurrent(value: MainSelectedPrHeadAuthority | null) {
      current = value
    },
    setNow(value: number) {
      now = value
    },
    authorityChanged() {
      authorityListener()
    },
    adapterChanged() {
      adapterListener()
    },
    acquire: (ctx = context(), signal = new AbortController().signal) =>
      provider.acquire(ctx, signal, AUTHORITY.binding)
  }
}
