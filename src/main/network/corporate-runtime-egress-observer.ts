import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  decideCorporateNetworkIntent,
  type CorporateNetworkActivityCategory,
  type CorporateNetworkDecision,
  type CorporateNetworkInitiator,
  type CorporateProviderNetworkState
} from '../../shared/network/corporate-network-contract'
import {
  readCorporateRuntimeEgressScenario,
  writeCorporateRuntimeEgressScenario
} from './corporate-runtime-egress-scenario'

export const CORPORATE_RUNTIME_EGRESS_LOG_PATH_ENV = 'ORCA_CORPORATE_RUNTIME_EGRESS_LOG_PATH'
export const CORPORATE_RUNTIME_EGRESS_SCENARIO_ENV = 'ORCA_CORPORATE_RUNTIME_EGRESS_SCENARIO'
export const CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET_ENV =
  'ORCA_CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET'
export const CORPORATE_RUNTIME_EGRESS_SUPPRESS_EXTERNAL_ENV =
  'ORCA_CORPORATE_RUNTIME_EGRESS_SUPPRESS_EXTERNAL'

export type RuntimeEgressProcessKind =
  | 'main'
  | 'renderer'
  | 'child-process'
  | 'provider-process'
  | 'plugin-worker'
  | 'unknown'

export type RuntimeEgressDestination = {
  readonly scheme: string
  readonly hostname: string
  readonly port: number | null
  readonly normalized: string
  readonly loopback: boolean
}

export type RuntimeEgressAttempt = {
  readonly timestamp: string
  readonly scenario: string
  readonly process: {
    readonly kind: RuntimeEgressProcessKind
    readonly pid?: number
  }
  readonly source: string
  readonly category: CorporateNetworkActivityCategory
  readonly capability?: string
  readonly destination?: RuntimeEgressDestination
  readonly initiatedBy: CorporateNetworkInitiator
  readonly decision: CorporateNetworkDecision
}

export type RuntimeEgressAttemptInput = {
  readonly scenario?: string
  readonly processKind: RuntimeEgressProcessKind
  readonly pid?: number
  readonly source: string
  readonly category: CorporateNetworkActivityCategory
  readonly capability?: string
  readonly destination?: string | URL | null
  readonly initiatedBy: CorporateNetworkInitiator
  readonly explicitlyEnabled?: boolean
  readonly provider?: CorporateProviderNetworkState
}

export type CorporateRuntimeEgressFailure = {
  readonly kind: 'unexpected' | 'destination-mismatch' | 'missing-attribution'
  readonly attempt: RuntimeEgressAttempt
  readonly expected: string
}

type RuntimeEgressJsonRecord = Omit<RuntimeEgressAttempt, 'decision'> & {
  readonly decision: Pick<CorporateNetworkDecision, 'status' | 'reason'>
}

declare global {
  var __orcaCorporateRuntimeEgressRecord:
    | ((input: RuntimeEgressAttemptInput) => RuntimeEgressAttempt)
    | undefined
  var __orcaCorporateRuntimeEgressSetScenario: ((scenario: string) => void) | undefined
}

let currentScenario = process.env[CORPORATE_RUNTIME_EGRESS_SCENARIO_ENV] ?? 'cold-start'

export function normalizeRuntimeEgressDestination(
  destination: string | URL | null | undefined
): RuntimeEgressDestination | undefined {
  if (!destination) {
    return undefined
  }
  const parsed = parseRuntimeDestination(destination)
  if (!parsed?.hostname) {
    return undefined
  }
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase()
  const hostname = parsed.hostname.toLowerCase()
  const port = resolveDestinationPort(parsed)
  return {
    scheme,
    hostname,
    port,
    normalized: `${scheme}://${hostname}${port === null ? '' : `:${port}`}`,
    loopback: isLoopbackHost(hostname)
  }
}

export function createRuntimeEgressAttempt(input: RuntimeEgressAttemptInput): RuntimeEgressAttempt {
  const destination = normalizeRuntimeEgressDestination(input.destination)
  const destinationUrl = destination?.normalized
  const policyDestinationUrl = normalizeRuntimePolicyDestination(input.destination) ?? destinationUrl
  const decision = decideCorporateNetworkIntent({
    source: input.source,
    category: input.category,
    initiatedBy: input.initiatedBy,
    ...(input.capability ? { capability: input.capability } : {}),
    ...(policyDestinationUrl
      ? {
          destination: {
            url: policyDestinationUrl,
            configured: input.category === 'administrator-configured-egress'
          }
        }
      : {}),
    ...(input.explicitlyEnabled !== undefined ? { explicitlyEnabled: input.explicitlyEnabled } : {}),
    ...(input.provider ? { provider: input.provider } : {})
  })

  return {
    timestamp: new Date().toISOString(),
    scenario: input.scenario ?? readRuntimeEgressScenario(),
    process: {
      kind: input.processKind,
      ...(input.pid ? { pid: input.pid } : {})
    },
    source: input.source,
    category: input.category,
    ...(input.capability ? { capability: input.capability } : {}),
    ...(destination ? { destination } : {}),
    initiatedBy: input.initiatedBy,
    decision
  }
}

export function assertNoUnexpectedCorporateEgress(
  attempts: readonly RuntimeEgressAttempt[]
): CorporateRuntimeEgressFailure[] {
  const failures: CorporateRuntimeEgressFailure[] = []

  for (const attempt of attempts) {
    if (!attempt.initiatedBy?.kind) {
      failures.push({
        kind: 'missing-attribution',
        attempt,
        expected: 'attributed initiator for every observed egress attempt'
      })
      continue
    }
    if (!attempt.destination) {
      continue
    }
    if (attempt.destination?.loopback) {
      continue
    }
    if (attempt.category === 'automatic-app-owned-egress') {
      failures.push({
        kind: 'unexpected',
        attempt,
        expected: '0 automatic Internet attempts'
      })
      continue
    }
    if (attempt.category === 'forbidden-legacy-implicit-dependency') {
      failures.push({
        kind: 'unexpected',
        attempt,
        expected: '0 forbidden legacy Internet attempts'
      })
      continue
    }
    if (attempt.decision.status !== 'allow') {
      failures.push({
        kind: 'unexpected',
        attempt,
        expected: `allowed Corporate network decision, got ${attempt.decision.status}`
      })
    }
  }

  return failures
}

export function formatCorporateEgressFailures(
  failures: readonly CorporateRuntimeEgressFailure[]
): string {
  return failures.map(formatCorporateEgressFailure).join('\n\n')
}

export function recordRuntimeEgressAttempt(input: RuntimeEgressAttemptInput): RuntimeEgressAttempt {
  const attempt = createRuntimeEgressAttempt(input)
  appendRuntimeEgressAttempt(attempt)
  return attempt
}

export function setRuntimeEgressScenario(scenario: string): void {
  currentScenario = scenario
  const logPath = process.env[CORPORATE_RUNTIME_EGRESS_LOG_PATH_ENV]
  if (!logPath) {
    return
  }
  writeCorporateRuntimeEgressScenario(logPath, scenario)
}

export function getRuntimeEgressLifecycleScenario() {
  if (
    currentScenario === 'cold-start' ||
    currentScenario === 'focus' ||
    currentScenario === 'hide' ||
    currentScenario === 'show' ||
    currentScenario === 'restore' ||
    currentScenario === 'open-settings' ||
    currentScenario === 'open-support-feedback-ui' ||
    currentScenario === 'idle'
  ) {
    return currentScenario
  }
  return 'idle'
}

function formatCorporateEgressFailure(failure: CorporateRuntimeEgressFailure): string {
  const attempt = failure.attempt
  const lines = [
    failure.kind === 'destination-mismatch'
      ? 'Corporate egress destination mismatch'
      : 'Unexpected Corporate egress',
    `Scenario: ${attempt.scenario}`,
    `Process: ${attempt.process.kind}`,
    `Source: ${attempt.source}`,
    `Category: ${attempt.category}`
  ]
  if (attempt.capability) {
    lines.push(`Capability: ${attempt.capability}`)
  }
  if (attempt.destination) {
    lines.push(`Destination: ${attempt.destination.normalized}`)
  }
  lines.push(`Expected: ${failure.expected}`)
  lines.push(`Initiator: ${attempt.initiatedBy?.kind ?? 'missing'}`)
  return lines.join('\n')
}

function appendRuntimeEgressAttempt(attempt: RuntimeEgressAttempt): void {
  const logPath = process.env[CORPORATE_RUNTIME_EGRESS_LOG_PATH_ENV]
  if (!logPath) {
    return
  }
  mkdirSync(dirname(logPath), { recursive: true })
  appendFileSync(logPath, `${JSON.stringify(toJsonRecord(attempt))}\n`, 'utf8')
}

function readRuntimeEgressScenario(): string {
  const logPath = process.env[CORPORATE_RUNTIME_EGRESS_LOG_PATH_ENV]
  if (logPath) {
    return readCorporateRuntimeEgressScenario(logPath, currentScenario)
  }
  return currentScenario
}

function toJsonRecord(attempt: RuntimeEgressAttempt): RuntimeEgressJsonRecord {
  return {
    ...attempt,
    decision: {
      status: attempt.decision.status,
      reason: attempt.decision.reason
    }
  }
}

function parseRuntimeDestination(destination: string | URL): URL | null {
  if (destination instanceof URL) {
    return destination
  }
  try {
    return new URL(destination.trim())
  } catch {
    return null
  }
}

function normalizeRuntimePolicyDestination(destination: string | URL | null | undefined): string | null {
  if (!destination) {
    return null
  }
  const parsed = parseRuntimeDestination(destination)
  if (!parsed) {
    return null
  }
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
}

function resolveDestinationPort(parsed: URL): number | null {
  if (parsed.port) {
    return Number.parseInt(parsed.port, 10)
  }
  switch (parsed.protocol.toLowerCase()) {
    case 'http:':
    case 'ws:':
      return 80
    case 'https:':
    case 'wss:':
      return 443
    case 'ssh:':
    case 'git+ssh:':
      return 22
    default:
      return null
  }
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.startsWith('127.')
  )
}
