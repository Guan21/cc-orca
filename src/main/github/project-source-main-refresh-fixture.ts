import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { expect, vi } from 'vitest'
import { MainProjectSourceIntegration } from './project-source-main-integration'
import { MainProjectSourceCatalog } from './project-source-main-catalog'
import { MainCredentialEvidenceProvider } from './project-source-main-credential'
import {
  SOURCE_LIFECYCLE_DOMAINS,
  SOURCE_READINESS_GATES
} from './project-source-composition-contract'
import type { Project, ProjectHostSetup } from '../../shared/project-types'
import type { Repo } from '../../shared/repo-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
export const HEAD = 'a'.repeat(40)
const URL = 'file:///DevCrew/resources/app.asar/out/renderer/index.html'
export const REPO = { id: 'R_1', databaseId: 321, nameWithOwner: 'Acme/Repo' }

export function response() {
  const checkRuns = {
    totalCount: 1,
    pageInfo: { hasNextPage: false },
    nodes: [
      {
        id: 'CR_1',
        databaseId: 99,
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        repository: REPO,
        checkSuite: { id: 'CS_1' }
      }
    ]
  }
  const checkSuites = {
    totalCount: 1,
    pageInfo: { hasNextPage: false },
    nodes: [
      {
        id: 'CS_1',
        databaseId: 71,
        commit: { oid: HEAD },
        repository: REPO,
        checkRuns
      }
    ]
  }
  return {
    data: {
      node: {
        ...REPO,
        pullRequest: {
          id: 'PR_42',
          number: 42,
          state: 'OPEN',
          merged: false,
          headRefOid: HEAD,
          updatedAt: new Date(Date.now() - 1000).toISOString(),
          headRepository: REPO,
          commits: { nodes: [{ commit: { oid: HEAD, repository: REPO, checkSuites } }] }
        }
      }
    }
  }
}

export function fixture(
  mocks: { window: ReturnType<typeof vi.fn> },
  enabled = true,
  completeComposition = true
) {
  const project: Project = {
    id: 'p',
    displayName: 'P',
    badgeColor: 'blue',
    sourceRepoIds: ['r'],
    createdAt: 1,
    updatedAt: 1,
    providerIdentity: { provider: 'github', owner: 'Acme', repo: 'Repo' }
  }
  const repo: Repo = {
    id: 'r',
    displayName: 'R',
    badgeColor: 'blue',
    path: '/repo',
    kind: 'git',
    addedAt: 1,
    gitRemoteIdentity: { canonicalKey: 'github.com/Acme/Repo' } as Repo['gitRemoteIdentity']
  }
  const setup: ProjectHostSetup = {
    id: 's',
    projectId: 'p',
    repoId: 'r',
    hostId: 'local',
    path: '/repo',
    displayName: 'S',
    setupState: 'ready',
    setupMethod: 'cloned',
    createdAt: 1,
    updatedAt: 1
  }
  const catalog = new MainProjectSourceCatalog({
    getSettings: () => ({ localWindowsRuntimeDefault: { kind: 'windows-host' as const } }),
    getProjects: () => [project],
    getProjectHostSetups: () => [setup],
    getRepos: () => [repo],
    subscribeMutations: () => () => {},
    getUnambiguousWorktreeMetaForHost: () =>
      ({
        instanceId: 'workspace-1',
        projectId: 'p',
        projectHostSetupId: 's',
        hostId: 'local'
      }) as WorktreeMeta
  })
  const selected = {
    projectId: 'p',
    repoId: 'r',
    hostSetupId: 's',
    workspaceKind: 'worktree' as const,
    workspaceId: 'r::/repo/w',
    prNumber: 42
  }
  expect(catalog.selectCurrent(selected)).toBe(true)
  let evidence = {
    host: 'github.com',
    source: 'os-keyring',
    principalId: 'user:1',
    credentialGeneration: 2,
    configDir: resolve('trusted-gh'),
    identityFingerprint: 'key-2',
    policyReviewReceipt: 'offline-fixture-only',
    loginVerified: true
  }
  let change!: () => void
  const readEvidence = vi.fn(() => evidence)
  const credential = new MainCredentialEvidenceProvider({
    adapter: {
      readEvidence,
      subscribeChanges: (listener) => {
        change = listener
        return () => {}
      }
    }
  })
  const frame = { processId: 2, routingId: 3, url: URL, isDestroyed: () => false }
  const session = { label: 'approved' }
  const sender = Object.assign(new EventEmitter(), {
    id: 5,
    session,
    mainFrame: frame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false
  })
  mocks.window.mockReturnValue({ id: 6, webContents: sender, isDestroyed: () => false })
  const event = { sender, senderFrame: frame }
  const path = resolve('trusted-gh.exe')
  const options = {
    enabled,
    approvedWebContents: sender as never,
    catalog,
    credential,
    origin: {
      approvedSession: session as never,
      expectedDocumentUrl: URL,
      currentAppProfile: () => 'personal' as const
    },
    runner: {
      executable: {
        path,
        realPath: path,
        dev: 1,
        ino: 2,
        size: 4,
        mtimeMs: 1,
        sha256: createHash('sha256')
          .update(Buffer.from([77, 90, 0, 0]))
          .digest('hex')
      },
      runtime: () => ({ packaged: true, profile: 'personal', execution: 'native' }),
      environment: {},
      confinement: { assertConfined: vi.fn<() => void>() }
    }
  }
  const executeRaw = vi.fn(async (...args: unknown[]) => {
    const query = JSON.stringify(args)
    return JSON.stringify(
      query.includes('RepositoryRegistration') ? { data: { repository: REPO } } : response()
    )
  })
  const lifecycleListeners = new Map<string, () => void>()
  const readinessState: Record<string, boolean | 'throw'> = Object.fromEntries(
    SOURCE_READINESS_GATES.map((name) => [name, true])
  )
  const composition = completeComposition
    ? {
        readiness: Object.fromEntries(
          SOURCE_READINESS_GATES.map((name) => [
            name,
            () => {
              if (readinessState[name] === 'throw') {
                throw new Error('offline gate unavailable')
              }
              return readinessState[name] === true
            }
          ])
        ),
        lifecycle: Object.fromEntries(
          SOURCE_LIFECYCLE_DOMAINS.map((name) => [
            name,
            (listener: () => void) => {
              lifecycleListeners.set(name, listener)
              return () => {
                lifecycleListeners.delete(name)
              }
            }
          ])
        )
      }
    : undefined
  const integration = new MainProjectSourceIntegration({ ...options, executeRaw, composition })
  return {
    integration,
    executeRaw,
    lifecycleListeners,
    readinessState,
    catalog,
    selected,
    event,
    sender,
    frame,
    project,
    repo,
    setup,
    options: { ...options, executeRaw, composition },
    readEvidence,
    rotate: () => {
      evidence = { ...evidence, credentialGeneration: 3 }
      change()
    }
  }
}
