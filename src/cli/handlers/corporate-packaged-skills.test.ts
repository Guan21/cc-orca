import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadCanonicalGuides } from './bundled-skill-guide-table'
import { SKILL_HANDLERS } from './skills'

vi.mock('../packaged-build-profile', () => ({ resolveCliBuildProfile: () => 'corporate' }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('packaged Corporate Skills policy', () => {
  it('uses the packaged policy for topics even when the shell requests the default build', async () => {
    vi.stubEnv('ORCA_BUILD_PROFILE', 'default')
    expect((await loadCanonicalGuides()).map((guide) => guide.name)).toEqual([
      'orca-cli',
      'orchestration'
    ])
  })

  it('installs packaged resources locally despite a default ambient shell profile', async () => {
    vi.stubEnv('ORCA_BUILD_PROFILE', 'default')
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const cwd = await mkdtemp(join(tmpdir(), 'devcrew-packaged-skills-'))
    try {
      await SKILL_HANDLERS['skills install']({
        cwd,
        json: true,
        flags: new Map<string, string | boolean>([
          ['skill', 'orca-cli'],
          ['agent', 'claude-code,codex'],
          ['local', true]
        ]),
        get client(): never {
          throw new Error('Network runtime accessed')
        }
      })
      for (const directory of ['.claude', '.agents']) {
        expect(await readFile(join(cwd, directory, 'skills/orca-cli/SKILL.md'), 'utf8')).toContain(
          'name: orca-cli'
        )
      }
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
