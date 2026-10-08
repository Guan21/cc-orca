import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('DevCrew package CLI compatibility', () => {
  it('uses the same dispatcher for devcrew and the existing orca command', () => {
    const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      bin: Record<string, string>
    }

    expect(manifest.bin.orca).toBe('./out/cli/index.js')
    expect(manifest.bin.devcrew).toBe(manifest.bin.orca)
    expect(manifest.bin['orca-dev']).toBe('./config/scripts/orca-dev.mjs')
  })
})
