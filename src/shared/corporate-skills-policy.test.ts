import { describe, expect, it } from 'vitest'
import { assertSkillOperationAllowed, isLocalSkillOperation } from './corporate-skills-policy'

describe('corporate skill boundary', () => {
  it.each(['discover', 'freshnessInventory', 'deleteSupported', 'previewDelete', 'delete'])(
    'allows local %s',
    (operation) => {
      expect(isLocalSkillOperation(operation)).toBe(true)
      expect(() => assertSkillOperationAllowed(operation, 'corporate')).not.toThrow()
    }
  )
  it.each([
    'installShare',
    'install',
    'startUpdateRun',
    'listOwnedShares',
    'getPackage',
    'share',
    'beginUpload',
    'unknown'
  ])('blocks %s before remote execution', (operation) => {
    expect(() => assertSkillOperationAllowed(operation, 'corporate')).toThrow(
      'Remote Skills require Corporate authorization'
    )
    expect(() => assertSkillOperationAllowed(operation, 'default')).not.toThrow()
  })
})
