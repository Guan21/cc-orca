import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectDir = resolve(import.meta.dirname, '../..')
const require = createRequire(import.meta.url)
const packageJson = require('../../package.json')
const MUTABLE_PACKAGING_ENV = [
  'ORCA_BUILD_PROFILE',
  'ORCA_CORPORATE_PRODUCT_NAME',
  'ORCA_CORPORATE_APP_ID'
]

function withPackagingEnv(env, assert) {
  const configPath = require.resolve('../electron-builder.config.cjs')
  const original = Object.fromEntries(MUTABLE_PACKAGING_ENV.map((key) => [key, process.env[key]]))
  try {
    for (const key of MUTABLE_PACKAGING_ENV) {
      delete process.env[key]
    }
    Object.assign(process.env, env)
    delete require.cache[configPath]
    assert(require('../electron-builder.config.cjs'))
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    delete require.cache[configPath]
    require('../electron-builder.config.cjs')
  }
}

function extraResourceSources(extraResources) {
  return extraResources.map((resource) => resource.from)
}

function tccDescriptions(extendInfo) {
  return Object.entries(extendInfo)
    .filter(([key, value]) => key.startsWith('NS') && typeof value === 'string')
    .map(([, value]) => value)
}

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

  it('provides reusable corporate installer build commands', () => {
    expect(packageJson.scripts['build:win:corporate']).toBe(
      'node config/scripts/build-corporate-package.mjs --win'
    )
    expect(packageJson.scripts['build:mac:corporate']).toBe(
      'node config/scripts/build-corporate-package.mjs --mac'
    )

    const corporatePackageScript = readFileSync(
      join(projectDir, 'config/scripts/build-corporate-package.mjs'),
      'utf8'
    )
    expect(corporatePackageScript).toContain("ORCA_BUILD_PROFILE: 'corporate'")
    expect(corporatePackageScript).toContain("'electron-builder'")
    expect(corporatePackageScript).not.toContain("['run', 'build:desktop']")
    expect(corporatePackageScript).not.toContain("'verify:built-skills-cli'")
    expect(corporatePackageScript).not.toContain('ORCA_BUILD_PROFILE=corporate')
  })

  it('stamps the packaged CLI with the same corporate profile marker', () => {
    const builderConfig = readFileSync(
      join(projectDir, 'config/electron-builder.config.cjs'),
      'utf8'
    )

    expect(builderConfig).toContain('orcaBuildProfile')
    expect(builderConfig).toContain("process.env.ORCA_BUILD_PROFILE === 'corporate'")
    expect(builderConfig).toContain('stampPackagedCliMetadata')
    expect(builderConfig).toContain('[verify-skills-cli-runtime] skipped corporate build profile')
  })

  it('keeps default packaging identity and artifact names unchanged', () => {
    withPackagingEnv({}, (config) => {
      expect(config.productName).toBe('Orca')
      expect(config.appId).toBe('com.stablyai.orca')
      expect(config.win.icon).toBeUndefined()
      expect(config.mac.icon).toBe('resources/build/icon.icns')
      expect(config.linux.icon).toBe('resources/build/icon.icns')
      expect(extraResourceSources(config.win.extraResources)).not.toContain(
        'resources/build/corporate/icon.png'
      )
      expect(extraResourceSources(config.mac.extraResources)).not.toContain(
        'resources/tray/corporate-menu-barTemplate.png'
      )
      expect(config.mac.extendInfo.NSAppleEventsUsageDescription).toContain('Orca')
      expect(config.nsis.artifactName).toBe('orca-windows-setup.${ext}')
      expect(config.dmg.artifactName).toBe('orca-macos-${arch}.${ext}')
      expect(config.publish).toEqual({
        provider: 'github',
        owner: 'stablyai',
        repo: 'orca',
        releaseType: 'release'
      })
    })
  })

  it('uses generic distinct corporate identity and artifact names', () => {
    withPackagingEnv({ ORCA_BUILD_PROFILE: 'corporate' }, (config) => {
      expect(config.productName).toBe('Secure Orca Lite')
      expect(config.appId).toBe('dev.orca.secure-lite')
      expect(config.win.icon).toBe('resources/build/corporate/icon.ico')
      expect(config.mac.icon).toBe('resources/build/corporate/icon.icns')
      expect(config.linux.icon).toBe('resources/build/corporate/icon.icns')
      for (const extraResources of [
        config.win.extraResources,
        config.mac.extraResources,
        config.linux.extraResources
      ]) {
        expect(extraResourceSources(extraResources)).toEqual(
          expect.arrayContaining([
            'resources/build/corporate/icon.png',
            'resources/tray/corporate-menu-barTemplate.png',
            'resources/tray/corporate-menu-barTemplate@2x.png'
          ])
        )
      }
      expect(config.mac.extendInfo.NSAppleEventsUsageDescription).toContain('Secure Orca Lite')
      expect(config.mac.extendInfo.NSAppleEventsUsageDescription).not.toContain('Orca allows')
      for (const description of tccDescriptions(config.mac.extendInfo)) {
        expect(description).toContain('Secure Orca Lite')
      }
      expect(config.nsis.artifactName).toBe('secure-orca-lite-windows-setup.${ext}')
      expect(config.dmg.artifactName).toBe('secure-orca-lite-macos-${arch}.${ext}')
      expect(config.publish).toBeNull()
    })
  })

  it('lets corporate packagers override public-safe identity at build time', () => {
    withPackagingEnv(
      {
        ORCA_BUILD_PROFILE: 'corporate',
        ORCA_CORPORATE_PRODUCT_NAME: 'Secure Orca Lite Preview',
        ORCA_CORPORATE_APP_ID: 'dev.example.secure-orca-lite-preview'
      },
      (config) => {
        expect(config.productName).toBe('Secure Orca Lite Preview')
        expect(config.appId).toBe('dev.example.secure-orca-lite-preview')
        expect(config.nsis.artifactName).toBe('secure-orca-lite-windows-setup.${ext}')
        expect(config.dmg.artifactName).toBe('secure-orca-lite-macos-${arch}.${ext}')
      }
    )
  })
})
