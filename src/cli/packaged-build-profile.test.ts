import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { resolveCliBuildProfile } from './packaged-build-profile'

describe('packaged CLI build profile', () => {
  it('uses the packaged output marker when no runtime override is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-cli-profile-'))
    const packageJsonPath = join(dir, 'package.json')
    try {
      writeFileSync(
        packageJsonPath,
        JSON.stringify({ type: 'commonjs', orcaBuildProfile: 'corporate' })
      )

      expect(resolveCliBuildProfile({}, packageJsonPath)).toBe('corporate')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.each(['default', 'whatever', 'corporate'])(
    'does not let ORCA_BUILD_PROFILE=%s downgrade a corporate package marker',
    (envProfile) => {
      const dir = mkdtempSync(join(tmpdir(), 'orca-cli-profile-'))
      const packageJsonPath = join(dir, 'package.json')
      try {
        writeFileSync(
          packageJsonPath,
          JSON.stringify({ type: 'commonjs', orcaBuildProfile: 'corporate' })
        )

        expect(resolveCliBuildProfile({ ORCA_BUILD_PROFILE: envProfile }, packageJsonPath)).toBe(
          'corporate'
        )
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )

  it('allows explicit runtime profile selection to upgrade a default package marker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-cli-profile-'))
    const packageJsonPath = join(dir, 'package.json')
    try {
      writeFileSync(
        packageJsonPath,
        JSON.stringify({ type: 'commonjs', orcaBuildProfile: 'default' })
      )

      expect(resolveCliBuildProfile({ ORCA_BUILD_PROFILE: 'corporate' }, packageJsonPath)).toBe(
        'corporate'
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falls back to the default profile when no marker exists', () => {
    expect(resolveCliBuildProfile({}, join(tmpdir(), 'missing-orca-package.json'))).toBe('default')
  })
})
