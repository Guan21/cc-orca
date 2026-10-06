import { describe, expect, it } from 'vitest'
import {
  CORPORATE_ZERO_AUTOMATIC_EGRESS_EXPECTATION,
  CORPORATE_ZERO_EGRESS_LIFECYCLE_STATES,
  decideCorporateNetworkIntent,
  isLegacyPublicCorporateDestination,
  resolveCorporateConfiguredEndpoint
} from './corporate-network-contract'

describe('Corporate network contract', () => {
  it('disables automatic undeclared app-owned egress', () => {
    expect(
      decideCorporateNetworkIntent({
        source: 'telemetry',
        category: 'automatic-app-owned-egress',
        initiatedBy: { kind: 'app-lifecycle', lifecycleState: 'cold-start' }
      })
    ).toMatchObject({
      status: 'disabled',
      category: 'automatic-app-owned-egress',
      reason: 'automatic_app_egress_requires_explicit_enablement'
    })
  })

  it('disables administrator-configured capabilities when the endpoint is absent', () => {
    expect(
      resolveCorporateConfiguredEndpoint({
        capability: 'plugin.marketplace',
        configuredEndpoint: null
      })
    ).toMatchObject({
      status: 'disabled',
      reason: 'endpoint_not_configured'
    })
  })

  it('allows an administrator-configured capability with a valid explicit endpoint', () => {
    const resolution = resolveCorporateConfiguredEndpoint({
      capability: 'plugin.marketplace',
      configuredEndpoint: 'https://plugins.company.test/orca-marketplace.json'
    })

    expect(resolution).toMatchObject({
      status: 'allowed',
      endpoint: 'https://plugins.company.test/orca-marketplace.json'
    })
    if (resolution.status === 'allowed') {
      expect(decideCorporateNetworkIntent(resolution.intent)).toMatchObject({
        status: 'allow',
        reason: 'administrator_configured_endpoint'
      })
    }
  })

  it('allows Claude only when the provider is allowed, enabled, and actually invoked', () => {
    expect(
      decideCorporateNetworkIntent({
        source: 'native-chat',
        category: 'provider-specific-egress',
        capability: 'provider.claude',
        destination: { url: 'https://api.anthropic.com' },
        initiatedBy: { kind: 'provider-operation', provider: 'claude', operation: 'launch' },
        provider: { id: 'claude', allowed: true, enabled: true, operationActive: true }
      })
    ).toMatchObject({
      status: 'allow',
      reason: 'provider_allowed_enabled_and_invoked'
    })
  })

  it('does not infer provider permission from credential presence alone', () => {
    expect(
      decideCorporateNetworkIntent({
        source: 'account-status',
        category: 'provider-specific-egress',
        capability: 'provider.codex',
        destination: { url: 'https://chatgpt.com' },
        initiatedBy: { kind: 'background-task', operation: 'credential-check' },
        provider: {
          id: 'codex',
          allowed: true,
          enabled: false,
          operationActive: false,
          credentialPresent: true
        }
      })
    ).toMatchObject({
      status: 'disabled',
      reason: 'provider_operation_not_active'
    })
  })

  it('denies legacy public fallback destinations', () => {
    expect(isLegacyPublicCorporateDestination('https://github.com/stablyai/orca-plugins.git')).toBe(
      true
    )
    expect(
      decideCorporateNetworkIntent({
        source: 'plugin-marketplace',
        category: 'administrator-configured-egress',
        capability: 'plugin.marketplace',
        destination: { url: 'https://github.com/stablyai/orca-plugins.git', configured: true },
        initiatedBy: { kind: 'administrator-configuration' }
      })
    ).toMatchObject({
      status: 'deny',
      reason: 'legacy_public_dependency_not_allowed'
    })
  })

  it('allows explicit user navigation as user-initiated egress', () => {
    expect(
      decideCorporateNetworkIntent({
        source: 'browser',
        category: 'user-initiated-egress',
        destination: { url: 'https://docs.company.test/runbook' },
        initiatedBy: { kind: 'user-action', action: 'open-browser-url' }
      })
    ).toMatchObject({
      status: 'allow',
      reason: 'explicit_user_action'
    })
  })

  it('states the Corporate lifecycle zero-automatic-egress expectation', () => {
    expect(CORPORATE_ZERO_AUTOMATIC_EGRESS_EXPECTATION).toBe(0)
    expect(CORPORATE_ZERO_EGRESS_LIFECYCLE_STATES).toEqual([
      'cold-start',
      'focus',
      'hide',
      'show',
      'restore',
      'open-settings',
      'open-support-feedback-ui',
      'idle'
    ])
  })
})
