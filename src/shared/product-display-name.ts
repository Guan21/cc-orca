import { getOrcaBuildProfile, type OrcaBuildProfile } from './corporate-build-profile'
import { PRODUCT_DISPLAY_NAME } from './product-identity'

export const DEFAULT_PRODUCT_DISPLAY_NAME = PRODUCT_DISPLAY_NAME
export const CORPORATE_PRODUCT_DISPLAY_NAME = PRODUCT_DISPLAY_NAME

export function getProductDisplayName(profile: OrcaBuildProfile = getOrcaBuildProfile()): string {
  return profile === 'corporate' ? CORPORATE_PRODUCT_DISPLAY_NAME : DEFAULT_PRODUCT_DISPLAY_NAME
}
