import { describe, expect, it } from 'vitest'
import {
  assertNoUnexpectedCorporateEgress,
  createRuntimeEgressAttempt,
  formatCorporateEgressFailures,
  normalizeRuntimeEgressDestination
} from './corporate-runtime-egress-observer'

describe('Corporate runtime egress observer', () => {
  it('normalizes destinations without query strings, credentials, or paths', () => {
    expect(
      normalizeRuntimeEgressDestination('https://token:secret@api.example.com:8443/path?q=secret')
    ).toEqual({
      scheme: 'https',
      hostname: 'api.example.com',
      port: 8443,
      normalized: 'https://api.example.com:8443',
      loopback: false
    })
  })

  it('treats loopback sentinel destinations as local rather than unexpected Internet egress', () => {
    const attempt = createRuntimeEgressAttempt({
      scenario: 'plugin-kill-list',
      processKind: 'main',
      source: 'plugin-kill-list-service',
      category: 'administrator-configured-egress',
      capability: 'plugin-kill-list',
      destination: 'http://127.0.0.1:49152/kill-list?token=secret',
      initiatedBy: { kind: 'administrator-configuration' }
    })

    expect(attempt.destination).toMatchObject({
      normalized: 'http://127.0.0.1:49152',
      loopback: true
    })
    expect(assertNoUnexpectedCorporateEgress([attempt])).toEqual([])
  })

  it('reports deterministic safe diagnostics for unexpected automatic Internet egress', () => {
    const attempt = createRuntimeEgressAttempt({
      scenario: 'cold-start',
      processKind: 'main',
      source: 'telemetry',
      category: 'automatic-app-owned-egress',
      capability: 'telemetry-posthog',
      destination: 'https://telemetry.example.com/capture?api_key=secret',
      initiatedBy: { kind: 'app-lifecycle', lifecycleState: 'cold-start' }
    })

    const failures = assertNoUnexpectedCorporateEgress([attempt])

    expect(failures).toHaveLength(1)
    expect(formatCorporateEgressFailures(failures)).toContain(
      [
        'Unexpected Corporate egress',
        'Scenario: cold-start',
        'Process: main',
        'Source: telemetry',
        'Category: automatic-app-owned-egress',
        'Capability: telemetry-posthog',
        'Destination: https://telemetry.example.com:443',
        'Expected: 0 automatic Internet attempts'
      ].join('\n')
    )
    expect(formatCorporateEgressFailures(failures)).not.toContain('api_key')
  })

  it('fails representative forbidden legacy destinations without contacting them', () => {
    const attempts = [
      'https://api.onorca.dev/v1/health',
      'https://github.com/stablyai/orca/issues',
      'https://github.com/stablyai/orca-plugins/releases',
      'https://us.i.posthog.com/capture',
      'https://discord.gg/orca_build',
      'https://x.com/orca_build'
    ].map((destination) =>
      createRuntimeEgressAttempt({
        scenario: 'synthetic-forbidden',
        processKind: 'main',
        source: 'synthetic-forbidden-destination',
        category: 'administrator-configured-egress',
        capability: 'synthetic.forbidden-destination',
        destination,
        initiatedBy: { kind: 'administrator-configuration' }
      })
    )
    const failures = assertNoUnexpectedCorporateEgress(attempts)

    expect(failures.map((failure) => failure.attempt.destination?.normalized)).toEqual([
      'https://api.onorca.dev:443',
      'https://github.com:443',
      'https://github.com:443',
      'https://us.i.posthog.com:443',
      'https://discord.gg:443',
      'https://x.com:443'
    ])
  })

  it('fails attempts that do not carry initiator attribution', () => {
    const attempt = {
      ...createRuntimeEgressAttempt({
        scenario: 'synthetic-forbidden',
        processKind: 'main',
        source: 'synthetic-missing-attribution',
        category: 'administrator-configured-egress',
        capability: 'synthetic.missing-attribution',
        destination: 'https://unexpected.example.test/path',
        initiatedBy: { kind: 'administrator-configuration' }
      }),
      initiatedBy: undefined
    } as never

    expect(assertNoUnexpectedCorporateEgress([attempt])).toMatchObject([
      { kind: 'missing-attribution', expected: 'attributed initiator for every observed egress attempt' }
    ])
  })
})
