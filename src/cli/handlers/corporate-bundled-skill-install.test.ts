import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installCorporateBundledSkills } from './corporate-bundled-skill-install'

const guide = {
  name: 'orca-cli',
  markdown: '# Trusted',
  fullMarkdown: '# Trusted full',
  description: '',
  aliases: [],
  references: [{ name: 'browser', markdown: '# Browser' }]
}
describe('trusted Corporate bundled skill installation', () => {
  it('writes packaged guides and references to approved local agent homes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'corporate-skills-'))
    await installCorporateBundledSkills([guide], ['claude-code', 'codex', 'universal'], root)
    expect(await readFile(join(root, '.claude/skills/orca-cli/SKILL.md'), 'utf8')).toBe('# Trusted')
    expect(
      await readFile(join(root, '.agents/skills/orca-cli/references/browser.md'), 'utf8')
    ).toBe('# Browser')
  })
  it('preserves existing user instructions while installing missing bundled skills', async () => {
    const root = await mkdtemp(join(tmpdir(), 'corporate-skills-'))
    const directory = join(root, '.agents/skills/orca-cli')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'SKILL.md'), 'custom')
    const result = await installCorporateBundledSkills(
      [guide, { ...guide, name: 'orchestration' }],
      ['universal'],
      root
    )
    expect(result.existing).toEqual([directory])
    expect(result.written).toEqual([join(root, '.agents/skills/orchestration')])
    expect(await readFile(join(directory, 'SKILL.md'), 'utf8')).toBe('custom')
    expect(await readFile(join(root, '.agents/skills/orchestration/SKILL.md'), 'utf8')).toBe(
      '# Trusted'
    )
  })
  it.each(['orca-linear', '../escape', 'computer-use'])(
    'rejects unauthorized topic %s',
    async (name) => {
      await expect(
        installCorporateBundledSkills([{ ...guide, name }], ['universal'], '/unused')
      ).rejects.toThrow('Corporate')
    }
  )
  it('rejects unsupported agents before creating directories', async () => {
    await expect(installCorporateBundledSkills([guide], ['cursor'], '/unused')).rejects.toThrow(
      'Corporate'
    )
  })
})
