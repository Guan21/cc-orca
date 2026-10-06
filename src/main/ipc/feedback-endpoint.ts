import { resolveCorporateConfiguredEndpoint } from '../../shared/network/corporate-network-contract'

const FEEDBACK_API_URL_ENV = 'ORCA_FEEDBACK_API_URL'

export function resolveFeedbackApiUrl(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): string | null {
  const resolution = resolveCorporateConfiguredEndpoint({
    capability: 'feedback-api',
    configuredEndpoint: env[FEEDBACK_API_URL_ENV],
    source: 'feedback'
  })
  return resolution.status === 'allowed' ? resolution.endpoint : null
}
