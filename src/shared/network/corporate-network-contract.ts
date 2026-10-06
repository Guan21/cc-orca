export const CORPORATE_NETWORK_CONTRACT_VERSION = 'corporate.network.v1'

export const CORPORATE_ZERO_EGRESS_LIFECYCLE_STATES = [
  'cold-start',
  'focus',
  'hide',
  'show',
  'restore',
  'open-settings',
  'open-support-feedback-ui',
  'idle'
] as const

export const CORPORATE_ZERO_AUTOMATIC_EGRESS_EXPECTATION = 0

export const CORPORATE_NETWORK_ACTIVITY_CATEGORIES = [
  'automatic-app-owned-egress',
  'provider-specific-egress',
  'user-initiated-egress',
  'administrator-configured-egress',
  'forbidden-legacy-implicit-dependency'
] as const

export type CorporateLifecycleState = (typeof CORPORATE_ZERO_EGRESS_LIFECYCLE_STATES)[number]
export type CorporateNetworkActivityCategory =
  (typeof CORPORATE_NETWORK_ACTIVITY_CATEGORIES)[number]
export type CorporateNetworkDecisionStatus = 'allow' | 'deny' | 'disabled'
export type CorporateConfiguredEndpointStatus = 'allowed' | 'disabled'
export type CorporateProviderId = 'claude' | 'codex' | (string & {})

export type CorporateNetworkDestination = {
  readonly url: string
  readonly configured?: boolean
}

export type CorporateNetworkInitiator =
  | { readonly kind: 'app-lifecycle'; readonly lifecycleState: CorporateLifecycleState }
  | { readonly kind: 'background-task'; readonly operation: string }
  | {
      readonly kind: 'provider-operation'
      readonly provider: CorporateProviderId
      readonly operation: string
    }
  | { readonly kind: 'user-action'; readonly action: string }
  | { readonly kind: 'administrator-configuration' }
  | { readonly kind: 'child-process'; readonly command?: string }

export type CorporateProviderNetworkState = {
  readonly id: CorporateProviderId
  readonly allowed: boolean
  readonly enabled: boolean
  readonly operationActive: boolean
  readonly credentialPresent?: boolean
}

export type CorporateNetworkIntent = {
  readonly source: string
  readonly category: CorporateNetworkActivityCategory
  readonly initiatedBy: CorporateNetworkInitiator
  readonly capability?: string
  readonly destination?: CorporateNetworkDestination
  readonly explicitlyEnabled?: boolean
  readonly provider?: CorporateProviderNetworkState
}

export type CorporateNetworkDecision = {
  readonly status: CorporateNetworkDecisionStatus
  readonly reason: CorporateNetworkDecisionReason
  readonly category: CorporateNetworkActivityCategory
  readonly source: string
  readonly capability?: string
  readonly destination?: CorporateNetworkDestination
}

export type CorporateNetworkDecisionReason =
  | 'automatic_app_egress_requires_explicit_enablement'
  | 'administrator_configured_endpoint'
  | 'endpoint_not_configured'
  | 'endpoint_invalid'
  | 'explicit_user_action'
  | 'user_action_required'
  | 'provider_allowed_enabled_and_invoked'
  | 'provider_not_allowed'
  | 'provider_not_enabled'
  | 'provider_operation_not_active'
  | 'legacy_public_dependency_not_allowed'
  | 'forbidden_legacy_implicit_dependency'

export type CorporateConfiguredEndpointResolution =
  | {
      readonly status: 'allowed'
      readonly endpoint: string
      readonly intent: CorporateNetworkIntent
    }
  | {
      readonly status: 'disabled'
      readonly reason:
        | 'endpoint_not_configured'
        | 'endpoint_invalid'
        | 'legacy_public_dependency_not_allowed'
      readonly capability: string
    }

const VALID_CORPORATE_ENDPOINT_PROTOCOLS = new Set([
  'http:',
  'https:',
  'ssh:',
  'git+ssh:',
  'ws:',
  'wss:'
])

const LEGACY_ORCA_GITHUB_REPOSITORIES = new Set(['orca', 'orca-plugins'])
const LEGACY_ORCA_SOCIAL_HOSTS = new Set(['discord.gg', 'x.com', 'twitter.com'])

export function decideCorporateNetworkIntent(
  intent: CorporateNetworkIntent
): CorporateNetworkDecision {
  if (intent.category === 'forbidden-legacy-implicit-dependency') {
    return decision(intent, 'deny', 'forbidden_legacy_implicit_dependency')
  }
  if (intent.destination && isLegacyPublicCorporateDestination(intent.destination.url)) {
    return decision(intent, 'deny', 'legacy_public_dependency_not_allowed')
  }

  if (intent.category === 'automatic-app-owned-egress') {
    return intent.explicitlyEnabled === true
      ? decision(intent, 'allow', 'administrator_configured_endpoint')
      : decision(intent, 'disabled', 'automatic_app_egress_requires_explicit_enablement')
  }

  if (intent.category === 'administrator-configured-egress') {
    if (!intent.destination?.configured) {
      return decision(intent, 'disabled', 'endpoint_not_configured')
    }
    if (!isValidCorporateEndpoint(intent.destination.url)) {
      return decision(intent, 'disabled', 'endpoint_invalid')
    }
    return decision(intent, 'allow', 'administrator_configured_endpoint')
  }

  if (intent.category === 'provider-specific-egress') {
    return decideProviderIntent(intent)
  }

  if (intent.category === 'user-initiated-egress') {
    if (intent.initiatedBy.kind !== 'user-action') {
      return decision(intent, 'disabled', 'user_action_required')
    }
    return decision(intent, 'allow', 'explicit_user_action')
  }

  return decision(intent, 'deny', 'forbidden_legacy_implicit_dependency')
}

export function resolveCorporateConfiguredEndpoint(input: {
  readonly capability: string
  readonly configuredEndpoint: string | null | undefined
  readonly source?: string
}): CorporateConfiguredEndpointResolution {
  const endpoint = input.configuredEndpoint?.trim()
  if (!endpoint) {
    return { status: 'disabled', reason: 'endpoint_not_configured', capability: input.capability }
  }
  if (!isValidCorporateEndpoint(endpoint)) {
    return { status: 'disabled', reason: 'endpoint_invalid', capability: input.capability }
  }
  if (isLegacyPublicCorporateDestination(endpoint)) {
    return {
      status: 'disabled',
      reason: 'legacy_public_dependency_not_allowed',
      capability: input.capability
    }
  }
  return {
    status: 'allowed',
    endpoint,
    intent: {
      source: input.source ?? input.capability,
      category: 'administrator-configured-egress',
      capability: input.capability,
      destination: { url: endpoint, configured: true },
      initiatedBy: { kind: 'administrator-configuration' }
    }
  }
}

export function isLegacyPublicCorporateDestination(destination: string): boolean {
  const parsed = parseDestinationUrl(destination)
  if (!parsed) {
    return false
  }
  const host = parsed.hostname.toLowerCase()
  if (host === 'onorca.dev' || host.endsWith('.onorca.dev')) {
    return true
  }
  if (host === 'us.i.posthog.com' || host.endsWith('.posthog.com')) {
    return true
  }
  if (isLegacyOrcaGitHubDestination(parsed)) {
    return true
  }
  if (LEGACY_ORCA_SOCIAL_HOSTS.has(host)) {
    const path = parsed.pathname.toLowerCase()
    return host === 'discord.gg' || path === '/orca_build' || path.startsWith('/orca_build/')
  }
  return false
}

function decideProviderIntent(intent: CorporateNetworkIntent): CorporateNetworkDecision {
  const provider = intent.provider
  if (!provider?.operationActive || intent.initiatedBy.kind !== 'provider-operation') {
    return decision(intent, 'disabled', 'provider_operation_not_active')
  }
  if (!provider.allowed) {
    return decision(intent, 'deny', 'provider_not_allowed')
  }
  if (!provider.enabled) {
    return decision(intent, 'disabled', 'provider_not_enabled')
  }
  return decision(intent, 'allow', 'provider_allowed_enabled_and_invoked')
}

function decision(
  intent: CorporateNetworkIntent,
  status: CorporateNetworkDecisionStatus,
  reason: CorporateNetworkDecisionReason
): CorporateNetworkDecision {
  return {
    status,
    reason,
    category: intent.category,
    source: intent.source,
    ...(intent.capability ? { capability: intent.capability } : {}),
    ...(intent.destination ? { destination: intent.destination } : {})
  }
}

function isValidCorporateEndpoint(endpoint: string): boolean {
  const parsed = parseDestinationUrl(endpoint)
  return Boolean(
    parsed && VALID_CORPORATE_ENDPOINT_PROTOCOLS.has(parsed.protocol) && parsed.hostname
  )
}

function parseDestinationUrl(destination: string): URL | null {
  try {
    return new URL(destination.trim())
  } catch {
    return null
  }
}

function isLegacyOrcaGitHubDestination(parsed: URL): boolean {
  if (parsed.hostname.toLowerCase() !== 'github.com') {
    return false
  }
  const segments = parsed.pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
  const owner = segments[0]?.toLowerCase()
  const repository = segments[1]?.toLowerCase().replace(/\.git$/i, '')
  return (
    owner === 'stablyai' && Boolean(repository && LEGACY_ORCA_GITHUB_REPOSITORIES.has(repository))
  )
}
