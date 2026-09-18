import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('main-process StarNag startup policy', () => {
  const readyRuntimeSource = readFileSync(
    join(process.cwd(), 'src/main/startup/main-process-ready-runtime.ts'),
    'utf8'
  ).replace(/\r\n/g, '\n')

  const READY_ENTRY = 'export async function initializeReadyRuntimeServices('
  const readyRuntimeEntryBody = readyRuntimeSource
    .slice(readyRuntimeSource.indexOf(READY_ENTRY) + READY_ENTRY.length)
    .split('\nexport ')[0]

  it('starts the upstream StarNag service only when the active build profile allows it', () => {
    expect(readyRuntimeSource).toContain(
      "import { isCapabilityEnabledForBuildProfile } from '../../shared/corporate-build-profile'"
    )
    expect(readyRuntimeEntryBody).toContain("if (isCapabilityEnabledForBuildProfile('star-nag'))")

    const gateIndex = readyRuntimeEntryBody.indexOf(
      "if (isCapabilityEnabledForBuildProfile('star-nag'))"
    )
    const serviceIndex = readyRuntimeEntryBody.indexOf('new StarNagService(')
    const browserBridgeIndex = readyRuntimeEntryBody.indexOf('state.agentBrowserBridge')

    expect(gateIndex).toBeGreaterThanOrEqual(0)
    expect(serviceIndex).toBeGreaterThan(gateIndex)
    expect(browserBridgeIndex).toBeGreaterThan(serviceIndex)
  })
})
