import { getOrcaBuildProfile, type OrcaBuildProfile } from './corporate-build-profile'

const LOCAL_SKILL_OPERATIONS = new Set([
  'discover',
  'freshnessInventory',
  'deleteSupported',
  'previewDelete',
  'delete'
])
export const CORPORATE_BUNDLED_SKILL_NAMES = ['orca-cli', 'orchestration'] as const

export function isLocalSkillOperation(operation: string): boolean {
  return LOCAL_SKILL_OPERATIONS.has(operation)
}

export function assertSkillOperationAllowed(
  operation: string,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): void {
  if (profile === 'corporate' && !isLocalSkillOperation(operation)) {
    throw new Error('Remote Skills require Corporate authorization')
  }
}
