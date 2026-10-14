import { describe, expect, it } from 'vitest'
import {
  inspectProjectSourceIdentity,
  projectSourceIdentityIsCurrent,
  resolveProjectSourceBinding,
  type ProjectSourceIdentityRecords
} from './project-source-identity'

function records(): ProjectSourceIdentityRecords {
  return {
    projects: [{ id: 'project', sourceRepoIds: ['repo'] }],
    setups: [
      {
        id: 'setup',
        projectId: 'project',
        repoId: 'repo',
        hostId: 'local',
        executionHostId: 'local',
        path: '/repo',
        kind: 'git',
        setupState: 'ready'
      }
    ],
    repositories: [{ id: 'repo', executionHostId: 'local', path: '/repo', kind: 'git' }],
    worktrees: [
      {
        id: 'worktree',
        repoId: 'repo',
        projectId: 'project',
        projectHostSetupId: 'setup',
        hostId: 'local',
        instanceId: 'instance',
        identity: { key: 'wt2:local:instance', instanceId: 'instance', executionHostId: 'local' },
        path: '/repo/branch'
      }
    ],
    folders: []
  }
}
const selection = {
  projectId: 'project',
  setupId: 'setup',
  repositoryId: 'repo',
  workspaceId: 'worktree',
  kind: 'git-worktree' as const,
  worktreeId: 'worktree',
  executionHostId: 'local' as const
}

describe('Main project source record identity (not producer attestation)', () => {
  it('matches one exact chain of existing Main record types in isolated conditions', () => {
    const result = inspectProjectSourceIdentity(records(), selection)
    expect(result.status).toBe('matched-records')
    if (result.status === 'matched-records') {
      expect(result.identity).toEqual(selection)
      expect(projectSourceIdentityIsCurrent(result, records())).toBe(true)
    }
  })

  it.each(['projects', 'setups', 'repositories', 'worktrees'] as const)(
    'denies missing %s records',
    (key) => {
      const state = records()
      state[key] = []
      expect(inspectProjectSourceIdentity(state, selection).status).toBe('NOT_PROVEN')
    }
  )

  it.each(['projects', 'setups', 'repositories', 'worktrees'] as const)(
    'denies ambiguous %s identities',
    (key) => {
      const state = records()
      state[key].push({ ...state[key][0] } as never)
      expect(inspectProjectSourceIdentity(state, selection).status).toBe('NOT_PROVEN')
    }
  )

  it('denies cross-project repository ownership', () => {
    const state = records()
    state.projects.push({ id: 'other-project', sourceRepoIds: ['repo'] })
    expect(inspectProjectSourceIdentity(state, selection).status).toBe('NOT_PROVEN')
  })

  it.each(['repoId', 'projectId', 'projectHostSetupId'] as const)(
    'denies worktree %s collisions',
    (field) => {
      const state = records()
      state.worktrees[0][field] = 'other'
      expect(inspectProjectSourceIdentity(state, selection).status).toBe('NOT_PROVEN')
    }
  )

  it('denies a forged worktree identity key', () => {
    const state = records()
    state.worktrees[0].identity!.key = 'wt2:local:other'
    expect(inspectProjectSourceIdentity(state, selection).status).toBe('NOT_PROVEN')
  })

  it.each([undefined, 'ssh:box', 'runtime:paired', 'unknown', ' local'])(
    'never falls back from host %s',
    (host) => {
      const state = records()
      state.repositories[0].executionHostId = host as 'local'
      expect(inspectProjectSourceIdentity(state, selection).status).toBe('NOT_PROVEN')
    }
  )

  it('denies a local row with surviving SSH ownership', () => {
    const state = records()
    state.repositories[0].connectionId = 'box'
    expect(inspectProjectSourceIdentity(state, selection).status).toBe('NOT_PROVEN')
  })

  it('does not turn folder projectGroupId or renderer host stamps into ownership', () => {
    const folder = { ...selection, kind: 'folder-workspace' as const, worktreeId: null }
    expect(inspectProjectSourceIdentity(records(), folder)).toEqual({
      status: 'NOT_PROVEN',
      reason: 'folder_ownership_missing'
    })
    expect(
      inspectProjectSourceIdentity(records(), { ...selection, worktreeId: 'other' }).status
    ).toBe('NOT_PROVEN')
  })

  it('invalidates changed source ownership records and checkout occupants', () => {
    for (const change of [
      (state: ProjectSourceIdentityRecords): void => {
        state.setups[0].path = '/replaced'
      },
      (state: ProjectSourceIdentityRecords): void => {
        state.projects[0].sourceRepoIds = []
      },
      (state: ProjectSourceIdentityRecords): void => {
        state.worktrees[0].instanceId = 'replaced'
      }
    ]) {
      const state = records()
      const result = inspectProjectSourceIdentity(state, selection)
      expect(result.status).toBe('matched-records')
      if (result.status === 'matched-records') {
        change(state)
        expect(projectSourceIdentityIsCurrent(result, state)).toBe(false)
      }
    }
  })

  it('never treats even matching fabricated records as production source proof', () => {
    expect(resolveProjectSourceBinding(records(), selection)).toEqual({
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
    })
  })
})

describe('unproven native roots remain unavailable', () => {
  it.each([
    String.raw`\\server\share\repo`,
    String.raw`\\wsl.localhost\Ubuntu\repo`,
    String.raw`C:\junction\repo`,
    '/symlink/repo',
    '/replaced/ancestor/repo'
  ])('never attests path %s from textual records', (path) => {
    const state = records()
    state.repositories[0].path = path
    state.setups[0].path = path
    const result = resolveProjectSourceBinding(state, selection)
    expect(result.status).toBe('NOT_PROVEN')
    if ('missing' in result) {
      expect(result.missing).toContain('stable_native_root_ownership')
    }
  })

  it('denies conflicting registered roots before source attestation', () => {
    const state = records()
    state.setups[0].path = '/different-root'
    expect(inspectProjectSourceIdentity(state, selection)).toEqual({
      status: 'NOT_PROVEN',
      reason: 'conflicting_ownership'
    })
  })

  it('denies a folder/worktree locator collision', () => {
    const state = records()
    state.folders.push({ id: 'worktree', projectGroupId: 'project', executionHostId: 'local' })
    expect(inspectProjectSourceIdentity(state, selection).status).toBe('NOT_PROVEN')
  })

  it.each(['ssh:box', 'runtime:paired'] as const)(
    'denies fully consistent remote host %s',
    (host) => {
      const state = records()
      state.setups[0].hostId = host
      state.setups[0].executionHostId = host
      state.repositories[0].executionHostId = host
      state.worktrees[0].hostId = host
      expect(inspectProjectSourceIdentity(state, { ...selection, executionHostId: host })).toEqual({
        status: 'NOT_PROVEN',
        reason: 'native_host_not_proven'
      })
    }
  )

  it('refuses to infer native versus WSL realm even when every host stamp is local', () => {
    const result = resolveProjectSourceBinding(records(), selection)
    expect(result.status).toBe('NOT_PROVEN')
    if ('missing' in result) {
      expect(result.missing).toContain('actual_execution_realm')
    }
  })
})
