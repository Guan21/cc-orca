import { describe, expect, it } from 'vitest'
import { corporateVmGatePrerequisites, runCorporateVmGate } from './run-corporate-vm-egress-tests.mjs'

describe('real Corporate VM release gate', () => {
  it('reports unavailable VM prerequisites without declaring acceptance', () => {
    expect(corporateVmGatePrerequisites({}, () => true)).toEqual({
      available: false,
      reason: 'Set ORCA_CORPORATE_VM_RECIPE_REPO and ORCA_CORPORATE_VM_RECIPE_ID for a real Linux VM recipe.'
    })
  })

  it('rejects a recipe repository without its authoritative configuration', () => {
    expect(corporateVmGatePrerequisites({
      ORCA_CORPORATE_VM_RECIPE_REPO: '/fixture', ORCA_CORPORATE_VM_RECIPE_ID: 'real-vm'
    }, () => false).available).toBe(false)
  })

  it('fails required acceptance before starting Electron when VM prerequisites are absent', async () => {
    let launches = 0
    const result = await runCorporateVmGate({ env: {}, required: true,
      exists: () => true, run: async () => { launches++; return 0 }, report: () => {} })
    expect(result).toBe(1)
    expect(launches).toBe(0)
  })

  it('returns a distinct unavailable status for developer invocation', async () => {
    expect(await runCorporateVmGate({ env: {}, required: false,
      exists: () => true, run: async () => 0, report: () => {} })).toBe(2)
  })

  it('propagates real VM test failure with background Corporate launch enforced', async () => {
    const calls = []
    const result = await runCorporateVmGate({
      env: { ORCA_CORPORATE_VM_RECIPE_REPO: '/fixture', ORCA_CORPORATE_VM_RECIPE_ID: 'real-vm' },
      required: true, exists: () => true, report: () => {},
      run: async (args, env) => { calls.push({ args, env }); return 7 }
    })
    expect(result).toBe(7)
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toContain('tests/e2e/corporate-vm-egress.spec.ts')
    expect(calls[0].env).toMatchObject({ ORCA_BACKGROUND_LAUNCH: '1', ORCA_E2E_CORPORATE_BUILD: '1', ORCA_CORPORATE_VM_REQUIRED: '1' })
  })
})
