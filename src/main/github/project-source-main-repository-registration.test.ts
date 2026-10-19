import { describe, expect, it, vi } from 'vitest'
import type { Project, ProjectHostSetup } from '../../shared/project-types'
import type { Repo } from '../../shared/repo-types'
import {
  MainRegisteredSelectedPrRepository,
  type MainSelectedRepositoryContext,
  type MainVerifiedGhAccount,
  type MainVerifiedRepositoryIdentity
} from './project-source-main-repository-registration'

function createFixture(includeVerifier = true) {
  const project: Project = {
    id: 'project-a',
    displayName: 'Alpha',
    badgeColor: 'blue',
    createdAt: 1,
    updatedAt: 1,
    sourceRepoIds: ['repo-a'],
    providerIdentity: {
      provider: 'github',
      host: 'github.com',
      owner: 'team',
      repo: 'service'
    }
  }
  const setup: ProjectHostSetup = {
    id: 'setup-a',
    projectId: 'project-a',
    repoId: 'repo-a',
    hostId: 'local',
    path: '/workspace/service',
    displayName: 'Alpha local',
    setupState: 'ready',
    setupMethod: 'cloned',
    createdAt: 1,
    updatedAt: 1
  }
  const repo: Repo = {
    id: 'repo-a',
    path: '/workspace/service',
    displayName: 'service',
    badgeColor: 'blue',
    kind: 'git',
    addedAt: 1,
    executionHostId: 'local',
    gitRemoteIdentity: {
      canonicalKey: 'github.com/team/service',
      remoteName: 'origin',
      remoteUrl: 'https://github.com/team/service.git'
    }
  }
  let selected: MainSelectedRepositoryContext | null = {
    projectId: 'project-a',
    repoId: 'repo-a',
    hostSetupId: 'setup-a',
    workspaceKind: 'folder',
    workspaceId: 'repo-a',
    prNumber: 17
  }
  let principal: MainVerifiedGhAccount | null = {
    principalId: 'gh-user',
    credentialGeneration: 2
  }
  let worktreeIsCurrent = false
  const verified: MainVerifiedRepositoryIdentity = {
    host: 'github.com',
    id: 42,
    nodeId: 'R_node_42',
    nameWithOwner: 'team/service',
    principalId: 'gh-user',
    credentialGeneration: 2
  }
  const verify = vi.fn(async () => ({ ...verified }))
  const registry = new MainRegisteredSelectedPrRepository({
    readCatalog: () => ({ projects: [project], setups: [setup], repos: [repo] }),
    readSelection: () => selected,
    readPrincipal: () => principal,
    isCurrentWorktree: () => worktreeIsCurrent,
    verifyRepository: includeVerifier ? verify : undefined
  })
  return {
    project,
    setup,
    repo,
    registry,
    verify,
    verified,
    setSelection: (value: MainSelectedRepositoryContext | null) => {
      selected = value
    },
    setPrincipal: (value: MainVerifiedGhAccount | null) => {
      principal = value
    },
    setWorktree: (value: boolean) => {
      worktreeIsCurrent = value
    }
  }
}

describe('#152 B4a Main-only registered immutable GitHub identity (offline)', () => {
  it('is disabled until a separately approved verifier is supplied', async () => {
    const { registry } = createFixture(false)
    expect(await registry.registerSelected()).toBe('denied')
    expect(registry.currentBinding()).toBeNull()
  })

  it('registers matching numeric/node IDs and exposes a copied trusted binding', async () => {
    const { registry, verify } = createFixture()
    expect(await registry.registerSelected()).toBe('registered')
    expect(verify).toHaveBeenCalledWith(
      { host: 'github.com', owner: 'team', name: 'service' },
      expect.any(AbortSignal)
    )
    expect(registry.currentBinding()).toMatchObject({
      projectId: 'project-a',
      workspaceId: 'repo-a',
      hostSetupId: 'setup-a',
      executionHostId: 'local',
      prNumber: 17,
      repository: {
        host: 'github.com',
        id: 42,
        nodeId: 'R_node_42',
        owner: 'team',
        name: 'service'
      }
    })
  })

  it('rejects wrong immutable repository ID or node ID', async () => {
    const { registry, verify, verified } = createFixture()
    verify.mockResolvedValueOnce({ ...verified, id: 0 })
    expect(await registry.registerSelected()).toBe('denied')
    verify.mockResolvedValueOnce({ ...verified, nodeId: '' })
    expect(await registry.registerSelected()).toBe('denied')
    expect(registry.currentBinding()).toBeNull()
  })

  it('rejects wrong remote identity even with the same visible name', async () => {
    const { repo, registry, verify } = createFixture()
    repo.gitRemoteIdentity = {
      canonicalKey: 'github.com/other/service',
      remoteName: 'origin',
      remoteUrl: 'https://github.com/other/service.git'
    }
    expect(await registry.registerSelected()).toBe('denied')
    expect(verify).not.toHaveBeenCalled()
  })

  it('rejects same display repo under another Project or host setup', async () => {
    const { registry, setup, project, verify } = createFixture()
    setup.projectId = 'another-project'
    expect(await registry.registerSelected()).toBe('denied')
    setup.projectId = project.id
    setup.hostId = 'ssh:remote'
    expect(await registry.registerSelected()).toBe('denied')
    expect(verify).not.toHaveBeenCalled()
  })

  it('denies WSL/SSH/pairing, unready setup and missing Project membership', async () => {
    const { registry, repo, setup, project, verify } = createFixture()
    repo.executionHostId = 'ssh:remote'
    expect(await registry.registerSelected()).toBe('denied')
    repo.executionHostId = 'local'
    setup.setupState = 'not-set-up'
    expect(await registry.registerSelected()).toBe('denied')
    setup.setupState = 'ready'
    project.sourceRepoIds = ['other-repo']
    expect(await registry.registerSelected()).toBe('denied')
    expect(verify).not.toHaveBeenCalled()
  })

  it('rejects GHES, malformed owner and absent matching remote', async () => {
    const { registry, project, repo } = createFixture()
    project.providerIdentity!.host = 'ghe.example.com'
    expect(await registry.registerSelected()).toBe('denied')
    project.providerIdentity!.host = 'github.com'
    project.providerIdentity!.owner = 'wrong owner'
    expect(await registry.registerSelected()).toBe('denied')
    project.providerIdentity!.owner = 'team'
    repo.gitRemoteIdentity = null
    expect(await registry.registerSelected()).toBe('denied')
  })

  it('rejects a different GitHub principal or credential generation in verified response', async () => {
    const { registry, verify, verified } = createFixture()
    verify.mockResolvedValueOnce({ ...verified, principalId: 'another-user' })
    expect(await registry.registerSelected()).toBe('denied')
    verify.mockResolvedValueOnce({ ...verified, credentialGeneration: 3 })
    expect(await registry.registerSelected()).toBe('denied')
  })

  it('rejects a repository rename or cross-host verifier answer', async () => {
    const { registry, verify, verified } = createFixture()
    verify.mockResolvedValueOnce({ ...verified, nameWithOwner: 'team/elsewhere' })
    expect(await registry.registerSelected()).toBe('denied')
    verify.mockResolvedValueOnce({ ...verified, host: 'enterprise.github.test' as 'github.com' })
    expect(await registry.registerSelected()).toBe('denied')
  })

  it('invalidates the cached registration across A -> B -> A', async () => {
    const { registry, setSelection } = createFixture()
    expect(await registry.registerSelected()).toBe('registered')
    setSelection({
      projectId: 'project-b',
      repoId: 'repo-a',
      hostSetupId: 'setup-a',
      workspaceKind: 'folder',
      workspaceId: 'repo-a',
      prNumber: 17
    })
    expect(registry.currentBinding()).toBeNull()
    setSelection({
      projectId: 'project-a',
      repoId: 'repo-a',
      hostSetupId: 'setup-a',
      workspaceKind: 'folder',
      workspaceId: 'repo-a',
      prNumber: 17
    })
    expect(registry.currentBinding()).toBeNull()
  })

  it('invalidates on catalog edits or a changed selected PR', async () => {
    const { registry, setup } = createFixture()
    expect(await registry.registerSelected()).toBe('registered')
    setup.updatedAt += 1
    expect(registry.currentBinding()).toBeNull()
  })

  it('invalidates on principal switch and cannot silently revive an old registration', async () => {
    const { registry, setPrincipal } = createFixture()
    expect(await registry.registerSelected()).toBe('registered')
    setPrincipal({ principalId: 'another-user', credentialGeneration: 3 })
    expect(registry.currentBinding()).toBeNull()
    setPrincipal({ principalId: 'gh-user', credentialGeneration: 2 })
    expect(registry.currentBinding()).toBeNull()
  })

  it('worktrees require a separately authenticated Main-owned predicate', async () => {
    const { registry, setSelection, setWorktree } = createFixture()
    const worktree: MainSelectedRepositoryContext = {
      projectId: 'project-a',
      repoId: 'repo-a',
      hostSetupId: 'setup-a',
      workspaceKind: 'worktree',
      workspaceId: 'worktree-17',
      prNumber: 17
    }
    setSelection(worktree)
    expect(await registry.registerSelected()).toBe('denied')
    setWorktree(true)
    expect(await registry.registerSelected()).toBe('registered')
    setWorktree(false)
    expect(registry.currentBinding()).toBeNull()
  })

  it('discards a pending registration after Project switching mid-request', async () => {
    const { registry, verify, verified, setSelection } = createFixture()
    let complete!: (value: MainVerifiedRepositoryIdentity | null) => void
    verify.mockImplementationOnce(
      () =>
        new Promise<MainVerifiedRepositoryIdentity | null>((resolve) => {
          complete = resolve
        })
    )
    const ongoing = registry.registerSelected()
    setSelection(null)
    complete(verified)
    expect(await ongoing).toBe('stale')
    expect(registry.currentBinding()).toBeNull()
  })

  it('revocation aborts pending registration and a later answer cannot reinstate it', async () => {
    const { registry, verify, verified } = createFixture()
    let complete!: (value: MainVerifiedRepositoryIdentity | null) => void
    verify.mockImplementationOnce(
      () =>
        new Promise<MainVerifiedRepositoryIdentity | null>((resolve) => {
          complete = resolve
        })
    )
    const ongoing = registry.registerSelected()
    registry.retireAll()
    complete(verified)
    expect(await ongoing).toBe('stale')
    expect(registry.currentBinding()).toBeNull()
  })

  it('remains fail-closed on verifier error and does not expose error text', async () => {
    const { registry, verify } = createFixture()
    verify.mockRejectedValueOnce(new Error('private token: never return this'))
    expect(await registry.registerSelected()).toBe('unavailable')
    expect(registry.currentBinding()).toBeNull()
  })
})
