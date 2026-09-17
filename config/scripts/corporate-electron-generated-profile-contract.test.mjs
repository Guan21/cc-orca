import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const mainChunksDir = resolve('out/main/chunks')
const corporateBuildScript = resolve('config/scripts/run-corporate-electron-vite-build.mjs')

function ensureCorporateMainChunks() {
  if (existsSync(mainChunksDir)) {
    return
  }
  const result = spawnSync(process.execPath, [corporateBuildScript], {
    env: {
      ...process.env,
      ORCA_ELECTRON_VITE_TARGET: 'main'
    },
    stdio: 'inherit'
  })
  if (result.error) {
    throw result.error
  }
  if (!existsSync(mainChunksDir)) {
    const buildResult =
      result.signal !== null
        ? `exited with signal ${result.signal}`
        : `exited with code ${result.status ?? 1}`
    throw new Error(`Corporate Electron main build ${buildResult} before creating out/main/chunks.`)
  }
}

function findCorporateProfileChunk() {
  ensureCorporateMainChunks()
  const candidates = readdirSync(mainChunksDir)
    .filter((name) => name.endsWith('.js') && name.startsWith('tui-agent-selection-'))
    .map((name) => resolve(mainChunksDir, name))
  if (candidates.length === 0) {
    throw new Error('Missing generated corporate profile chunk in out/main/chunks.')
  }
  return candidates[0]
}

function resolveCandidate(candidate, envValue) {
  const previousEnv = process.env.ORCA_BUILD_PROFILE
  const previousGlobal = globalThis.__ORCA_BUILD_PROFILE__
  try {
    delete globalThis.__ORCA_BUILD_PROFILE__
    if (envValue === undefined) {
      delete process.env.ORCA_BUILD_PROFILE
    } else {
      process.env.ORCA_BUILD_PROFILE = envValue
    }
    return candidate()
  } finally {
    if (previousEnv === undefined) {
      delete process.env.ORCA_BUILD_PROFILE
    } else {
      process.env.ORCA_BUILD_PROFILE = previousEnv
    }
    if (previousGlobal === undefined) {
      delete globalThis.__ORCA_BUILD_PROFILE__
    } else {
      globalThis.__ORCA_BUILD_PROFILE__ = previousGlobal
    }
  }
}

function profileResults(candidate) {
  try {
    return {
      unset: resolveCandidate(candidate, undefined),
      envDefault: resolveCandidate(candidate, 'default'),
      envCorporate: resolveCandidate(candidate, 'corporate')
    }
  } catch {
    return null
  }
}

describe('generated corporate Electron build profile', () => {
  it('pins the generated main-process profile resolver to corporate', async () => {
    const chunkPath = findCorporateProfileChunk()
    const generatedChunk = await import(`${chunkPath}?cacheBust=${Date.now()}`)
    const functionExports = Object.entries(generatedChunk).filter(
      (entry) => typeof entry[1] === 'function'
    )
    const profileResolvers = functionExports
      .map(([name, candidate]) => ({ name, results: profileResults(candidate) }))
      .filter(
        ({ results }) =>
          results !== null &&
          [results.unset, results.envDefault, results.envCorporate].every(
            (value) => value === 'default' || value === 'corporate'
          )
      )

    expect(profileResolvers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          results: {
            unset: 'corporate',
            envDefault: 'corporate',
            envCorporate: 'corporate'
          }
        })
      ])
    )
  })
})
