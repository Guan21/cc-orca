import type { CorporateSupportConfig } from '../shared/corporate-support-config'
import { resolveCorporateConfiguredEndpoint } from '../shared/network/corporate-network-contract'

function resolveSupportUrl(capability: string, configuredEndpoint: string | undefined): string | null {
  const resolution = resolveCorporateConfiguredEndpoint({
    capability,
    configuredEndpoint,
    source: 'support-navigation'
  })
  return resolution.status === 'allowed' ? resolution.endpoint : null
}

export function getCorporateSupportConfig(): CorporateSupportConfig {
  return {
    bugTrackerUrl: resolveSupportUrl('bug-tracker-url', process.env.ORCA_BUG_TRACKER_URL),
    supportSlackUrl: resolveSupportUrl('support-slack-url', process.env.ORCA_SUPPORT_SLACK_URL)
  }
}
