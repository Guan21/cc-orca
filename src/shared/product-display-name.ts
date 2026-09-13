import {
  getOrcaBuildProfile,
  type OrcaBuildProfile
} from './corporate-build-profile'

export const DEFAULT_PRODUCT_DISPLAY_NAME = 'Orca'
export const CORPORATE_PRODUCT_DISPLAY_NAME = 'Secure Orca Lite'

export function getProductDisplayName(
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): string {
  return profile === 'corporate'
    ? CORPORATE_PRODUCT_DISPLAY_NAME
    : DEFAULT_PRODUCT_DISPLAY_NAME
}
