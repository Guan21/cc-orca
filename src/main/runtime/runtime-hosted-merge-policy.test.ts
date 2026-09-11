import { afterEach, describe, expect, it, vi } from 'vitest'
import { MERGE_NOT_ALLOWED_BY_ORG_POLICY } from '../../shared/corporate-build-profile'
import type { Repo } from '../../shared/repo-types'
import { RuntimeGitHubReviewMutationCommands } from './runtime-github-review-mutation-commands'
import { RuntimeGitLabMutationCommands } from './runtime-gitlab-mutation-commands'

const repo: Repo = {
  id: 'repo-1',
  path: '/workspace/repo',
  displayName: 'Repo',
  badgeColor: '#737373',
  addedAt: 1
}

describe('runtime hosted merge policy', () => {
  afterEach(() => {
    delete process.env.ORCA_BUILD_PROFILE
  })

  it('denies corporate GitHub merge automation through runtime commands', async () => {
    process.env.ORCA_BUILD_PROFILE = 'corporate'
    const resolveRepo = vi.fn(async () => repo)
    const commands = new RuntimeGitHubReviewMutationCommands({
      resolveRepo,
      getLocalGitArgs: () => []
    })

    await expect(commands.mergeRepoPR('repo-1', 7, 'squash')).resolves.toEqual({
      ok: false,
      error: MERGE_NOT_ALLOWED_BY_ORG_POLICY
    })
    await expect(commands.setRepoPRAutoMerge('repo-1', 7, true, 'squash')).resolves.toEqual({
      ok: false,
      error: MERGE_NOT_ALLOWED_BY_ORG_POLICY
    })

    expect(resolveRepo).toHaveBeenCalledTimes(2)
  })

  it('denies corporate GitLab merge automation through runtime commands', async () => {
    process.env.ORCA_BUILD_PROFILE = 'corporate'
    const resolveRepo = vi.fn(async () => repo)
    const commands = new RuntimeGitLabMutationCommands({
      resolveRepo,
      getLocalGitArgs: () => []
    })

    await expect(commands.mergeGitLabRepoMR('repo-1', 8, 'squash')).resolves.toEqual({
      ok: false,
      error: MERGE_NOT_ALLOWED_BY_ORG_POLICY
    })

    expect(resolveRepo).toHaveBeenCalledOnce()
  })
})
