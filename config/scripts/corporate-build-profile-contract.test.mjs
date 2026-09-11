import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectDir = resolve(import.meta.dirname, '../..')
const require = createRequire(import.meta.url)
const packageJson = require('../../package.json')

describe('corporate build profile package contract', () => {
  it('provides a cross-platform corporate Electron bundle build entrypoint', () => {
    expect(packageJson.scripts['build:electron-vite:corporate']).toBe(
      'node config/scripts/run-corporate-electron-vite-build.mjs'
    )

    const corporateBuildScript = readFileSync(
      join(projectDir, 'config/scripts/run-corporate-electron-vite-build.mjs'),
      'utf8'
    )
    expect(corporateBuildScript).toContain("ORCA_BUILD_PROFILE: 'corporate'")
    expect(corporateBuildScript).toContain('run-electron-vite-build.mjs')
    expect(corporateBuildScript).not.toContain('ORCA_BUILD_PROFILE=corporate')
  })

  it('stamps the packaged CLI with the same corporate profile marker', () => {
    const builderConfig = readFileSync(
      join(projectDir, 'config/electron-builder.config.cjs'),
      'utf8'
    )

    expect(builderConfig).toContain('orcaBuildProfile')
    expect(builderConfig).toContain("process.env.ORCA_BUILD_PROFILE === 'corporate'")
    expect(builderConfig).toContain('stampPackagedCliMetadata')
  })
})
