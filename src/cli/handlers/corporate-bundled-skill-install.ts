import { lstat, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BundledSkillGuide } from './bundled-skill-guide-table'
import { CORPORATE_BUNDLED_SKILL_NAMES } from '../../shared/corporate-skills-policy'

const AGENT_DIRECTORIES: Record<string, string> = {
  'claude-code': '.claude',
  codex: '.agents',
  universal: '.agents'
}

export async function installCorporateBundledSkills(
  guides: readonly BundledSkillGuide[],
  agents: readonly string[],
  root: string
): Promise<{ written: string[]; existing: string[] }> {
  if (guides.some((guide) => !CORPORATE_BUNDLED_SKILL_NAMES.some((name) => name === guide.name))) {
    throw new Error('This skill requires a capability unavailable in Corporate')
  }
  if (agents.length === 0 || agents.some((agent) => !Object.hasOwn(AGENT_DIRECTORIES, agent))) {
    throw new Error('Corporate local Skills support claude-code, codex, and universal only')
  }
  const destinations = [...new Set(agents.map((agent) => AGENT_DIRECTORIES[agent]))]
  const written: string[] = []
  const existing: string[] = []
  for (const agentDirectory of destinations) {
    const parent = join(root, agentDirectory, 'skills')
    for (const directory of [join(root, agentDirectory), parent]) {
      const stat = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return null
        }
        throw error
      })
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
        throw new Error('Corporate bundled installation requires ordinary local directories')
      }
    }
    await mkdir(parent, { recursive: true })
    for (const guide of guides) {
      const destination = join(parent, guide.name)
      const created = await mkdir(destination)
        .then(() => true)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'EEXIST') {
            return false
          }
          throw error
        })
      if (!created) {
        const directory = await lstat(destination)
        if (!directory.isDirectory() || directory.isSymbolicLink()) {
          throw new Error(`Skill path must be an ordinary local directory: ${destination}`)
        }
        const file = await lstat(join(destination, 'SKILL.md')).catch(() => null)
        if (!file?.isFile() || file.isSymbolicLink()) {
          throw new Error(`Skill already exists: ${destination}; inspect it before replacing`)
        }
        existing.push(destination)
        continue
      }
      await writeFile(join(destination, 'SKILL.md'), guide.markdown, {
        encoding: 'utf8',
        flag: 'wx'
      })
      for (const reference of guide.references) {
        if (!/^[a-z0-9-]+$/.test(reference.name)) {
          throw new Error('Invalid bundled reference name')
        }
        await mkdir(join(destination, 'references'), { recursive: true })
        await writeFile(
          join(destination, 'references', `${reference.name}.md`),
          reference.markdown,
          { encoding: 'utf8', flag: 'wx' }
        )
      }
      written.push(destination)
    }
  }
  return { written, existing }
}
