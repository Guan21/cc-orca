import { getOrcaBuildProfile } from './corporate-build-profile'
import { decideCorporateNetworkIntent } from './network/corporate-network-contract'

export type CorporateExternalIntegration = 'jira' | 'linear'

export function corporateIntegrationFailure(
  integration: CorporateExternalIntegration
): Error | null {
  if (getOrcaBuildProfile() !== 'corporate') {
    return null
  }
  // Saved credentials and user-entered sites are not administrator authorization.
  const decision = decideCorporateNetworkIntent({
    source: integration,
    capability: integration,
    category: 'administrator-configured-egress',
    initiatedBy: { kind: 'administrator-configuration' }
  })
  return decision.status === 'allow'
    ? null
    : new Error(
        `${integration === 'jira' ? 'Jira' : 'Linear'} requires administrator authorization in DevCrew Corporate.`
      )
}

export function assertCorporateIntegrationAllowed(integration: CorporateExternalIntegration): void {
  const failure = corporateIntegrationFailure(integration)
  if (failure) {
    throw failure
  }
}
