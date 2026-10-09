import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SKILL_HANDLERS } from './skills'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
describe('Corporate CLI packaged skills', () => {
  it('installs trusted bundled resources in the explicit local workspace without launching npx', async () => {
    vi.stubEnv('ORCA_BUILD_PROFILE', 'corporate')
    const cwd = await mkdtemp(join(tmpdir(), 'corporate-skill-cli-'))
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    await SKILL_HANDLERS['skills install']({
      cwd,
      json: true,
      flags: new Map<string, string | boolean>([
        ['skill', 'orca-cli'],
        ['agent', 'universal'],
        ['local', true]
      ]),
      get client(): never {
        throw new Error('Network runtime accessed')
      }
    })
    expect(await readFile(join(cwd, '.agents/skills/orca-cli/SKILL.md'), 'utf8')).toContain(
      'name: orca-cli'
    )
  })
  it('rejects the Linear integration topic', async () => {
    vi.stubEnv('ORCA_BUILD_PROFILE', 'corporate')
    await expect(
      SKILL_HANDLERS['skills install']({
        cwd: '/unused',
        json: true,
        flags: new Map([['skill', 'orca-linear']]),
        get client(): never {
          throw new Error('Network runtime accessed')
        }
      })
    ).rejects.toThrow('Unknown skill')
  })
})
