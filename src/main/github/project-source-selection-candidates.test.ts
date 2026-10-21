import { describe, expect, it } from 'vitest'
import type { Project, ProjectHostSetup } from '../../shared/project-types'
import type { Repo } from '../../shared/repo-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { MainProjectSourceCatalog } from './project-source-main-catalog'

function fixture() {
  const project: Project = {
    id: 'p',
    displayName: 'Project',
    badgeColor: 'blue',
    sourceRepoIds: ['r'],
    createdAt: 1,
    updatedAt: 1,
    providerIdentity: { provider: 'github', host: 'github.com', owner: 'owner', repo: 'repo' }
  }
  const repo = {
    id: 'r',
    displayName: 'Repository',
    badgeColor: 'blue',
    path: '/repo',
    kind: 'git',
    addedAt: 1,
    gitRemoteIdentity: { canonicalKey: 'github.com/owner/repo' }
  } as Repo
  const setup: ProjectHostSetup = {
    id: 's',
    projectId: 'p',
    repoId: 'r',
    hostId: 'local',
    path: '/repo',
    displayName: 'Local',
    setupState: 'ready',
    setupMethod: 'cloned',
    createdAt: 1,
    updatedAt: 1
  }
  const meta = {
    instanceId: 'instance-1',
    projectId: 'p',
    projectHostSetupId: 's',
    hostId: 'local',
    linkedPR: 3
  } as WorktreeMeta
  const worktrees: Record<string, WorktreeMeta> = { 'r::/repo/w': meta }
  const projects = [project]
  const repos = [repo]
  const setups = [setup]
  let ambiguous = false
  const store = {
    getSettings: () => ({ localWindowsRuntimeDefault: { kind: 'windows-host' as const } }),
    getProjects: () => projects,
    getProjectHostSetups: () => setups,
    getRepos: () => repos,
    getAllWorktreeMetaForHost: () => worktrees,
    getUnambiguousWorktreeMetaForHost: (id: string) => (ambiguous ? undefined : worktrees[id]),
    subscribeMutations: () => () => {}
  }
  const catalog = new MainProjectSourceCatalog(store)
  const candidate = {
    projectId: 'p',
    repoId: 'r',
    hostSetupId: 's',
    workspaceKind: 'worktree' as const,
    workspaceId: 'r::/repo/w',
    prNumber: 3
  }
  return {
    project,
    repo,
    setup,
    meta,
    worktrees,
    projects,
    repos,
    setups,
    store,
    catalog,
    candidate,
    makeAmbiguous: () => {
      ambiguous = true
    }
  }
}

describe('Main source selection candidate inspection', () => {
  it('enumerates Store-owned scope and describes its separate purpose without selecting it', () => {
    const f = fixture()
    expect(f.catalog.listSelectionCandidates()).toEqual([f.candidate])
    const inspected = f.catalog.inspectSelectionCandidate(f.candidate)!
    expect(inspected.detail).toContain('Project')
    expect(inspected.detail).toContain('github.com/owner/repo')
    expect(inspected.detail).toContain('/repo/w')
    expect(inspected.detail).toContain('instance-1')
    expect(inspected.detail).toContain('PR #3')
    expect(inspected.detail).toContain('registration')
    expect(inspected.detail).toContain('read')
    expect(f.catalog.readSelection()).toBeNull()
  })

  it.each(['projectId', 'repoId', 'hostSetupId', 'workspaceId'] as const)(
    'rejects forged %s',
    (key) => {
      const f = fixture()
      expect(f.catalog.inspectSelectionCandidate({ ...f.candidate, [key]: 'forged' })).toBeNull()
    }
  )

  it('rejects folder scopes without using repo ID as workspace authority', () => {
    const f = fixture()
    expect(
      f.catalog.inspectSelectionCandidate({
        ...f.candidate,
        workspaceKind: 'folder',
        workspaceId: 'r'
      })
    ).toBeNull()
  })

  it.each(['ssh:remote', 'wsl:ubuntu', 'runtime:remote'])('rejects %s hosts', (host) => {
    const f = fixture()
    Object.assign(f.repo, { executionHostId: host })
    expect(f.catalog.listSelectionCandidates()).toEqual([])
  })

  it('requires exact provider and repository canonical identity', () => {
    const f = fixture()
    f.repo.gitRemoteIdentity!.canonicalKey = 'github.com/owner/other'
    expect(f.catalog.inspectSelectionCandidate(f.candidate)).toBeNull()
    f.repo.gitRemoteIdentity!.canonicalKey = 'github.com/owner/repo'
    f.project.providerIdentity!.host = 'github.example.com'
    expect(f.catalog.listSelectionCandidates()).toEqual([])
  })

  it.each(['projects', 'repos', 'setups'] as const)('rejects duplicate %s identities', (key) => {
    const f = fixture()
    if (key === 'projects') {
      f.projects.push({ ...f.project })
    }
    if (key === 'repos') {
      f.repos.push({ ...f.repo })
    }
    if (key === 'setups') {
      f.setups.push({ ...f.setup })
    }
    expect(f.catalog.listSelectionCandidates()).toEqual([])
  })

  it('requires current unambiguous metadata and exact linked PR', () => {
    const f = fixture()
    expect(f.catalog.inspectSelectionCandidate({ ...f.candidate, prNumber: 4 })).toBeNull()
    f.meta.linkedPR = null
    expect(f.catalog.listSelectionCandidates()).toEqual([])
    f.meta.linkedPR = 3
    f.makeAmbiguous()
    expect(f.catalog.listSelectionCandidates()).toEqual([])
  })

  it('enumerates multiple worktree instances and returns detached candidates', () => {
    const f = fixture()
    f.worktrees['r::/repo/other'] = { ...f.meta, instanceId: 'instance-2', linkedPR: 4 }
    const candidates = f.catalog.listSelectionCandidates()
    expect(candidates).toHaveLength(2)
    candidates[0] = { ...candidates[0]!, projectId: 'forged' }
    expect(f.catalog.listSelectionCandidates()[0]).toEqual(f.candidate)
  })

  it('changes fingerprint on linked PR or instance replacement and sanitizes native display', () => {
    const f = fixture()
    const original = f.catalog.inspectSelectionCandidate(f.candidate)!.fingerprint
    f.meta.instanceId = 'new-instance'
    expect(f.catalog.inspectSelectionCandidate(f.candidate)!.fingerprint).not.toBe(original)
    f.project.displayName = 'Project\n\r\u202eAccept\u0000'
    expect(f.catalog.inspectSelectionCandidate(f.candidate)!.detail).not.toContain('\u202e')
    expect(f.catalog.inspectSelectionCandidate(f.candidate)!.detail).not.toContain('Project\n')
  })

  it('fails closed with missing enumeration, missing catalog, or disposal', () => {
    const f = fixture()
    const { getAllWorktreeMetaForHost: _omitted, ...store } = f.store
    expect(new MainProjectSourceCatalog(store).listSelectionCandidates()).toEqual([])
    f.projects.length = 0
    expect(f.catalog.listSelectionCandidates()).toEqual([])
    f.catalog.dispose()
    expect(f.catalog.inspectSelectionCandidate(f.candidate)).toBeNull()
  })

  it('rejects mutation reentrancy during the final identity check', () => {
    const f = fixture()
    const read = f.store.getUnambiguousWorktreeMetaForHost
    let calls = 0
    f.store.getUnambiguousWorktreeMetaForHost = (id: string) => {
      if (++calls === 3) {
        f.catalog.invalidate()
      }
      return read(id)
    }
    expect(f.catalog.inspectSelectionCandidate(f.candidate)).toBeNull()
  })
})
