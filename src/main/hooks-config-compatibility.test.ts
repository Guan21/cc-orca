import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hasHooksFile, loadHooks } from './hooks'

const directories: string[] = []

function createProject(): string {
  const directory = mkdtempSync(join(tmpdir(), 'devcrew-config-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('DevCrew project configuration compatibility', () => {
  it('reads an existing orca.yaml without rewriting user data', () => {
    const directory = createProject()
    const content =
      'scripts:\n  setup: echo existing\nworktree:\n  sharedDirectories:\n    - assets\n'
    writeFileSync(join(directory, 'orca.yaml'), content, 'utf8')

    expect(hasHooksFile(directory)).toBe(true)
    expect(loadHooks(directory)).toMatchObject({
      scripts: { setup: 'echo existing' },
      worktree: { sharedDirectories: ['assets'] }
    })
    expect(readFileSync(join(directory, 'orca.yaml'), 'utf8')).toBe(content)
  })

  it('keeps orca.yaml authoritative when an unsupported devcrew.yaml coexists', () => {
    const directory = createProject()
    const candidate = 'scripts:\n  setup: echo candidate\n'
    writeFileSync(join(directory, 'orca.yaml'), 'scripts:\n  setup: echo legacy\n', 'utf8')
    writeFileSync(join(directory, 'devcrew.yaml'), candidate, 'utf8')

    expect(loadHooks(directory)?.scripts.setup).toBe('echo legacy')
    expect(readFileSync(join(directory, 'devcrew.yaml'), 'utf8')).toBe(candidate)
  })

  it('does not silently fall through to devcrew.yaml after a malformed configuration', () => {
    const directory = createProject()
    writeFileSync(join(directory, 'orca.yaml'), 'scripts: [unterminated', 'utf8')
    writeFileSync(join(directory, 'devcrew.yaml'), 'scripts:\n  setup: echo candidate\n', 'utf8')

    expect(hasHooksFile(directory)).toBe(true)
    expect(loadHooks(directory)).toBeNull()
  })

  it('does not advertise support for a devcrew.yaml-only folder', () => {
    const directory = createProject()
    writeFileSync(join(directory, 'devcrew.yaml'), 'scripts:\n  setup: echo candidate\n', 'utf8')

    expect(hasHooksFile(directory)).toBe(false)
    expect(loadHooks(directory)).toBeNull()
  })
})
