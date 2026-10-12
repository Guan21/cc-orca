import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { AsarPackager } = require('app-builder-lib/out/asar/asarUtil.js')
const { verifyPackagedAsarIntegrity } = require('./verify-packaged-asar-integrity.cjs')
const directories = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

async function packageFixture(mutateAfterStat = false) {
  const directory = mkdtempSync(join(tmpdir(), 'packaged-asar-producer-'))
  directories.push(directory)
  const source = join(directory, 'source')
  const resources = join(directory, 'resources')
  mkdirSync(join(source, 'out', 'main'), { recursive: true })
  mkdirSync(resources)
  const files = [
    join(source, 'acceptance.log'),
    join(source, 'package.json'),
    join(source, 'out', 'main', 'index.js')
  ]
  writeFileSync(files[0], 'initial evidence\n')
  writeFileSync(files[1], '{"main":"./out/main/index.js"}')
  writeFileSync(files[2], 'module.exports = 42')
  const metadata = new Map(files.map((file) => [file, statSync(file)]))
  if (mutateAfterStat) {
    appendFileSync(files[0], 'new evidence appended after electron-builder captured stat\n')
  }
  const packager = new AsarPackager(
    { info: { getWorkspaceRoot: async () => source } },
    { resourcePath: resources, defaultDestination: source, options: { smartUnpack: false } }
  )
  await packager.pack([{ src: source, destination: source, files, metadata }])
  return join(resources, 'app.asar')
}

it('accepts a stable real electron-builder ASAR including its nested asar version', async () => {
  expect(verifyPackagedAsarIntegrity(await packageFixture())).toMatchObject({
    packedFiles: 3,
    main: 'out/main/index.js'
  })
})

it('blocks real electron-builder stale-stat corruption before installer generation', async () => {
  const archive = await packageFixture(true)
  const bytes = readFileSync(archive)
  const headerLength = bytes.readUInt32LE(12)
  const header = JSON.parse(bytes.subarray(16, 16 + headerLength).toString('utf8'))
  expect(header.files['acceptance.log'].size).toBe(Buffer.byteLength('initial evidence\n'))
  expect(() => verifyPackagedAsarIntegrity(archive)).toThrow(/unaccounted bytes|hash mismatch/i)
})
