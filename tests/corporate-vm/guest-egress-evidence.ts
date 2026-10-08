import { isIP } from 'node:net'
import {
  decideCorporateNetworkIntent,
  isLegacyPublicCorporateDestination,
  type CorporateNetworkActivityCategory,
  type CorporateNetworkInitiator
} from '../../src/shared/network/corporate-network-contract'

export type GuestEndpoint = { address: string; port: number; protocol: 'tcp' | 'udp' }
export type GuestDestination = GuestEndpoint & { disposition: 'sentinel' | 'rejected' }
type ProcessEvidence = {
  executable: 'claude' | 'codex' | 'python3' | 'git'
  provider?: 'claude' | 'codex'
  pid: number
}
export type GuestObservationContext = {
  scenario: string
  initiatedBy?: CorporateNetworkInitiator
  processEvidence?: ProcessEvidence
  syntheticDestination?: string
}
export type VmRuntimeEgressAttempt = {
  timestamp: string
  plane: 'vm'
  runtimeId: string
  scenario: string
  process: string
  provider?: string
  pid?: number
  source: 'guest-firewall'
  category: CorporateNetworkActivityCategory
  destination: GuestEndpoint | null
  initiatedBy: CorporateNetworkInitiator
  expected: boolean
  failure?: 'unexpected' | 'destination-mismatch' | 'missing-attribution'
  attribution: 'scenario-process-correlation' | 'unknown'
}
export function parseGuestGuardSnapshot(
  output: string,
  sessionId: string
): {
  sentinelPackets: number
  rejectedPackets: number
  destinations: GuestDestination[]
} {
  const totals = { sentinel: 0, rejected: 0 }
  const counts = { sentinel: 0, rejected: 0 }
  const destinations: GuestDestination[] = []
  for (const line of output.split('\n')) {
    if (line.startsWith('COUNTER ')) {
      const match = /^COUNTER (sentinel|rejected) (\d+)$/.exec(line.trim())
      if (!match) {
        throw new Error('Malformed guest firewall counter')
      }
      const key = match[1] as keyof typeof totals
      const value = Number(match[2])
      if (!Number.isSafeInteger(value)) {
        throw new Error('Invalid guest firewall counter')
      }
      totals[key] += value
      if (!Number.isSafeInteger(totals[key])) {
        throw new Error('Invalid guest firewall counter total')
      }
      counts[key]++
      continue
    }
    const tag = new RegExp(`\\bORCA_${sessionId}_(ALLOW|DENY) `).exec(line)
    if (!tag) {
      continue
    }
    const address = /\bDST=([^\s]+)/.exec(line)?.[1]
    const protocol = /\bPROTO=([^\s]+)/.exec(line)?.[1]?.toLowerCase()
    const port = Number(/\bDPT=(\d+)/.exec(line)?.[1])
    if (
      !address ||
      !isIP(address) ||
      !['tcp', 'udp'].includes(protocol ?? '') ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      throw new Error('Malformed guest firewall log')
    }
    destinations.push({
      address,
      port,
      protocol: protocol as 'tcp' | 'udp',
      disposition: tag[1] === 'ALLOW' ? 'sentinel' : 'rejected'
    })
  }
  if (!counts.sentinel || !counts.rejected || counts.sentinel !== counts.rejected) {
    throw new Error('Guest firewall counters unavailable')
  }
  return { sentinelPackets: totals.sentinel, rejectedPackets: totals.rejected, destinations }
}

export function classifyGuestAttempt(
  input: GuestObservationContext & {
    runtimeId: string
    sentinel: GuestEndpoint
    destination: GuestEndpoint | null
    disposition: 'sentinel' | 'rejected'
    syntheticDestination?: string
  }
): VmRuntimeEgressAttempt {
  const initiatedBy = input.initiatedBy ?? { kind: 'background-task', operation: input.scenario }
  const evidence = input.processEvidence
  const provider = initiatedBy.kind === 'provider-operation' ? initiatedBy.provider : undefined
  const attributed =
    evidence &&
    Number.isInteger(evidence.pid) &&
    evidence.pid > 0 &&
    (provider
      ? provider === (evidence.provider ?? evidence.executable)
      : initiatedBy.kind === 'user-action' && evidence.executable === 'git')
  const forbidden =
    input.syntheticDestination && isLegacyPublicCorporateDestination(input.syntheticDestination)
  const category: CorporateNetworkActivityCategory = forbidden
    ? 'forbidden-legacy-implicit-dependency'
    : provider
      ? 'provider-specific-egress'
      : initiatedBy.kind === 'user-action'
        ? 'user-initiated-egress'
        : 'automatic-app-owned-egress'
  const matches =
    input.destination?.address === input.sentinel.address &&
    input.destination.port === input.sentinel.port &&
    input.destination.protocol === input.sentinel.protocol
  const decision = decideCorporateNetworkIntent({
    source: 'guest-firewall',
    category,
    initiatedBy,
    ...(provider
      ? {
          provider: {
            id: provider,
            enabled: true,
            allowed: true,
            operationActive: Boolean(attributed)
          }
        }
      : {})
  })
  const expected = Boolean(
    attributed && matches && input.disposition === 'sentinel' && decision.status === 'allow'
  )
  const explicit = provider || initiatedBy.kind === 'user-action'
  return {
    timestamp: new Date().toISOString(),
    plane: 'vm',
    runtimeId: input.runtimeId,
    scenario: input.scenario,
    process: attributed ? evidence.executable : 'unknown',
    ...(attributed && provider ? { provider } : {}),
    ...(attributed ? { pid: evidence.pid } : {}),
    source: 'guest-firewall',
    category,
    destination: input.destination,
    initiatedBy,
    expected,
    attribution: attributed ? 'scenario-process-correlation' : 'unknown',
    ...(!expected
      ? {
          failure:
            explicit && !matches
              ? ('destination-mismatch' as const)
              : matches && !attributed && explicit
                ? ('missing-attribution' as const)
                : ('unexpected' as const)
        }
      : {})
  }
}
