import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Project, ProjectHostSetup } from '../../shared/project-types'
import type { Repo } from '../../shared/repo-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import type { GlobalWindowsRuntimeDefault } from '../../shared/project-execution-runtime'
import { MainProjectSourceCatalog } from './project-source-main-catalog'

function fixture() {
  const project: Project = {
    id: 'p',
    displayName: 'P',
    badgeColor: 'blue',
    sourceRepoIds: ['r'],
    createdAt: 1,
    updatedAt: 1
  }
  const repo: Repo = {
    id: 'r',
    displayName: 'R',
    badgeColor: 'blue',
    path: '/repo',
    kind: 'git',
    addedAt: 1
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
  const settings: { localWindowsRuntimeDefault: GlobalWindowsRuntimeDefault } = {
    localWindowsRuntimeDefault: { kind: 'windows-host' }
  }
  const store = {
    getProjects: () => [project],
    getRepos: () => [repo],
    getProjectHostSetups: () => [setup],
    getSettings: () => settings,
    getUnambiguousWorktreeMetaForHost: (): WorktreeMeta => ({
      displayName: 'W',
      comment: '',
      linkedIssue: null,
      linkedPR: 3,
      linkedLinearIssue: null,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 1,
      instanceId: 'instance',
      projectId: 'p',
      projectHostSetupId: 's',
      hostId: 'local'
    }),
    subscribeMutations: () => () => {}
  }
  const candidate = {
    projectId: 'p',
    repoId: 'r',
    hostSetupId: 's',
    workspaceKind: 'worktree' as const,
    workspaceId: 'r::/repo/w',
    prNumber: 3
  }
  return { project, repo, setup, settings, store, candidate }
}

afterEach(() => vi.restoreAllMocks())

describe('Main Project source native runtime boundary', () => {
  it('rejects Project WSL despite local host identifiers', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const f = fixture()
    f.project.localWindowsRuntimePreference = { kind: 'wsl', distro: 'Ubuntu' }
    expect(new MainProjectSourceCatalog(f.store).selectCurrent(f.candidate)).toBe(false)
  })

  it.each(['Ubuntu', null])('rejects inherited global WSL or repair (%s)', (distro) => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const f = fixture()
    f.settings.localWindowsRuntimeDefault = { kind: 'wsl', distro }
    expect(new MainProjectSourceCatalog(f.store).selectCurrent(f.candidate)).toBe(false)
  })

  it('accepts explicit Windows host override over a global WSL default', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const f = fixture()
    f.settings.localWindowsRuntimeDefault = { kind: 'wsl', distro: 'Ubuntu' }
    f.project.localWindowsRuntimePreference = { kind: 'windows-host' }
    expect(new MainProjectSourceCatalog(f.store).selectCurrent(f.candidate)).toBe(true)
  })

  it.each(['linux', 'darwin'] as const)(
    'accepts the native %s runtime without Windows settings',
    (platform) => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
      const f = fixture()
      const { getSettings: _, ...store } = f.store
      f.project.localWindowsRuntimePreference = { kind: 'wsl', distro: 'Ubuntu' }
      expect(new MainProjectSourceCatalog(store).selectCurrent(f.candidate)).toBe(true)
    }
  )

  it('requires actual runtime settings on Windows', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const f = fixture()
    const { getSettings: _, ...store } = f.store
    expect(new MainProjectSourceCatalog(store).selectCurrent(f.candidate)).toBe(false)
  })

  it.each([String.raw`\\wsl$\Ubuntu\repo`, '//wsl.localhost/Ubuntu/repo'])(
    'rejects WSL repository and worktree paths even with native runtime (%s)',
    (wslPath) => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
      const f = fixture()
      const catalog = new MainProjectSourceCatalog(f.store)
      expect(catalog.selectCurrent({ ...f.candidate, workspaceId: `r::${wslPath}` })).toBe(false)
      f.repo.path = wslPath
      f.setup.path = wslPath
      expect(catalog.selectCurrent(f.candidate)).toBe(false)
    }
  )

  it('retires selection if global config changes even when Project still resolves native', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const f = fixture()
    f.project.localWindowsRuntimePreference = { kind: 'windows-host' }
    const catalog = new MainProjectSourceCatalog(f.store)
    expect(catalog.selectCurrent(f.candidate)).toBe(true)
    f.settings.localWindowsRuntimeDefault = { kind: 'wsl', distro: 'Ubuntu' }
    expect(catalog.readSelection()).toBeNull()
    f.settings.localWindowsRuntimeDefault = { kind: 'windows-host' }
    expect(catalog.readSelection()).toBeNull()
  })

  it('retires selection when inherited global runtime changes to WSL', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const f = fixture()
    const catalog = new MainProjectSourceCatalog(f.store)
    expect(catalog.selectCurrent(f.candidate)).toBe(true)
    f.settings.localWindowsRuntimeDefault = { kind: 'wsl', distro: 'Ubuntu' }
    expect(catalog.readSelection()).toBeNull()
  })

  it('retires selection if settings can no longer be read', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const f = fixture()
    const catalog = new MainProjectSourceCatalog(f.store)
    expect(catalog.selectCurrent(f.candidate)).toBe(true)
    f.store.getSettings = () => {
      throw new Error('unavailable')
    }
    expect(catalog.readSelection()).toBeNull()
  })
})
