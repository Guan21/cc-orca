import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  formatViolations,
  loadCorporateEndpointPolicy,
  runCorporateForbiddenEndpointScan,
  scanCorporateEndpointText
} from './corporate-forbidden-endpoint-scanner.mjs'

const policyPath = join(process.cwd(), 'config/corporate-forbidden-endpoints.json')

function tempRepo() {
  const root = mkdtempSync(join(tmpdir(), 'orca-corporate-endpoint-scan-'))
  return {
    root,
    write(relativePath, contents) {
      const path = join(root, ...relativePath.split('/'))
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, contents, 'utf8')
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true })
    }
  }
}

function writeBaselineSet(repo, { baselineViolations, ceilingViolations = baselineViolations }) {
  repo.write(
    'config/corporate-forbidden-endpoint-baseline.json',
    JSON.stringify({
      version: 1,
      issue: '#90',
      violations: baselineViolations
    })
  )
  repo.write(
    'config/corporate-forbidden-endpoint-baseline-ceiling.json',
    JSON.stringify({
      version: 1,
      issue: '#91',
      violations: ceilingViolations
    })
  )
}

const knownLegacyViolation = {
  ruleId: 'legacy-onorca-domain',
  file: 'src/main/legacy.ts',
  line: 1,
  match: 'https://share.onorca.dev'
}

const newLegacyViolation = {
  ruleId: 'legacy-onorca-domain',
  file: 'src/main/new.ts',
  line: 1,
  match: 'https://login.onorca.dev'
}

describe('corporate forbidden endpoint scanner', () => {
  it('flags a direct forbidden URL', () => {
    const policy = loadCorporateEndpointPolicy(policyPath)
    const violations = scanCorporateEndpointText({
      policy,
      relativePath: 'src/main/example.ts',
      source: 'const url = "https://login.onorca.dev/oauth"'
    })

    expect(violations).toMatchObject([
      {
        file: 'src/main/example.ts',
        line: 1,
        match: 'https://login.onorca.dev/oauth',
        ruleId: 'legacy-onorca-domain',
        severity: 'forbidden'
      }
    ])
  })

  it('declares #91 rules as a static projection of the #89 forbidden legacy category', () => {
    const policy = loadCorporateEndpointPolicy(policyPath)

    expect(policy.contract).toMatchObject({
      semanticContract: 'src/shared/network/corporate-network-contract.ts',
      scannerRole: 'static-regression-projection',
      legacyViolationCategory: 'forbidden-legacy-implicit-dependency'
    })
    expect(policy.rules.map((rule) => rule.contractCategory)).toEqual(
      policy.rules.map(() => 'forbidden-legacy-implicit-dependency')
    )
  })

  it('flags a forbidden host without a protocol', () => {
    const policy = loadCorporateEndpointPolicy(policyPath)
    const violations = scanCorporateEndpointText({
      policy,
      relativePath: 'src/shared/example.ts',
      source: 'export const host = "login.onorca.dev"'
    })

    expect(violations.map((violation) => violation.match)).toEqual(['login.onorca.dev'])
  })

  it('flags legacy GitHub infrastructure without globally blocking GitHub', () => {
    const policy = loadCorporateEndpointPolicy(policyPath)

    expect(
      scanCorporateEndpointText({
        policy,
        relativePath: 'src/main/example.ts',
        source: 'https://github.com/stablyai/orca'
      })
    ).toMatchObject([{ ruleId: 'legacy-stablyai-orca-repository' }])

    expect(
      scanCorporateEndpointText({
        policy,
        relativePath: 'src/main/example.ts',
        source: 'https://github.com/company/internal-repo'
      })
    ).toEqual([])
  })

  it('flags legacy public destinations covered by the #89 contract', () => {
    const policy = loadCorporateEndpointPolicy(policyPath)

    expect(
      scanCorporateEndpointText({
        policy,
        relativePath: 'src/main/example.ts',
        source: 'https://eu.i.posthog.com/capture'
      })
    ).toMatchObject([{ ruleId: 'legacy-posthog-ingest' }])

    expect(
      scanCorporateEndpointText({
        policy,
        relativePath: 'src/main/example.ts',
        source: 'https://twitter.com/orca_build'
      })
    ).toMatchObject([{ ruleId: 'legacy-twitter-profile' }])
  })

  it('allows administrator-configurable placeholders with no embedded forbidden fallback', () => {
    const policy = loadCorporateEndpointPolicy(policyPath)

    expect(
      scanCorporateEndpointText({
        policy,
        relativePath: 'src/main/example.ts',
        source: 'const marketplace = process.env.DEVCREW_PLUGIN_MARKETPLACE_URL'
      })
    ).toEqual([])
  })

  it('scans representative packaged resources', () => {
    const repo = tempRepo()
    try {
      repo.write(
        'resources/plugins/launch/example-plugin/orca-plugin.json',
        JSON.stringify({ homepage: 'https://relay.onorca.dev/plugin' })
      )
      const result = runCorporateForbiddenEndpointScan({
        cwd: repo.root,
        policyPath,
        useBaseline: false
      })

      expect(result.exitCode).toBe(1)
      expect(result.violations).toMatchObject([
        {
          file: 'resources/plugins/launch/example-plugin/orca-plugin.json',
          ruleId: 'legacy-onorca-domain',
          severity: 'forbidden'
        }
      ])
    } finally {
      repo.cleanup()
    }
  })

  it('reports rule, file, line, match, and reason', () => {
    const policy = loadCorporateEndpointPolicy(policyPath)
    const [violation] = scanCorporateEndpointText({
      policy,
      relativePath: 'src/main/example.ts',
      source: 'const url = "https://share.onorca.dev/a/report"'
    })

    const report = formatViolations([violation])

    expect(report).toContain('Corporate forbidden endpoint detected')
    expect(report).toContain('Rule: legacy-onorca-domain')
    expect(report).toContain('File: src/main/example.ts:1')
    expect(report).toContain('Match: https://share.onorca.dev/a/report')
    expect(report).toContain('Reason: Corporate runtime must not implicitly depend on legacy Orca cloud infrastructure.')
  })

  it('keeps scanner fixtures available without making the repository scan fail', () => {
    const repo = tempRepo()
    try {
      repo.write('config/scripts/__fixtures__/forbidden-resource.json', '{"url":"https://login.onorca.dev"}')
      repo.write('src/main/clean.ts', 'export const host = process.env.DEVCREW_PLUGIN_MARKETPLACE_URL')
      const result = runCorporateForbiddenEndpointScan({
        cwd: repo.root,
        policyPath,
        useBaseline: false
      })

      expect(result.exitCode).toBe(0)
      expect(result.violations).toEqual([])
    } finally {
      repo.cleanup()
    }
  })

  it('does not treat the semantic #89 contract source as runtime endpoint debt', () => {
    const repo = tempRepo()
    try {
      repo.write(
        'src/shared/network/corporate-network-contract.ts',
        'const legacyDestination = "https://login.onorca.dev"'
      )
      const result = runCorporateForbiddenEndpointScan({
        cwd: repo.root,
        policyPath,
        useBaseline: false
      })

      expect(result.exitCode).toBe(0)
      expect(result.violations).toEqual([])
    } finally {
      repo.cleanup()
    }
  })

  it('passes a clean Corporate source tree', () => {
    const repo = tempRepo()
    try {
      repo.write('src/main/clean.ts', 'export const url = "https://github.com/company/internal-repo"')
      repo.write('src/shared/config.ts', 'export const marketplace = process.env.DEVCREW_PLUGIN_MARKETPLACE_URL')
      const result = runCorporateForbiddenEndpointScan({
        cwd: repo.root,
        policyPath,
        useBaseline: false
      })

      expect(result.exitCode).toBe(0)
      expect(result.violations).toEqual([])
    } finally {
      repo.cleanup()
    }
  })

  it('passes a known violation already present in the #90 baseline', () => {
    const repo = tempRepo()
    try {
      repo.write('src/main/legacy.ts', 'export const url = "https://share.onorca.dev"')
      writeBaselineSet(repo, { baselineViolations: [knownLegacyViolation] })

      const result = runCorporateForbiddenEndpointScan({
        cwd: repo.root,
        policyPath,
        useBaseline: true
      })

      expect(result.exitCode).toBe(0)
      expect(result.baselined).toHaveLength(1)
      expect(result.violations).toEqual([])
    } finally {
      repo.cleanup()
    }
  })

  it('supports reducing the #90 baseline after code removes a known violation', () => {
    const repo = tempRepo()
    try {
      repo.write('src/main/clean.ts', 'export const url = "https://github.com/company/internal-repo"')
      writeBaselineSet(repo, {
        baselineViolations: [],
        ceilingViolations: [knownLegacyViolation]
      })

      const result = runCorporateForbiddenEndpointScan({
        cwd: repo.root,
        policyPath,
        useBaseline: true
      })

      expect(result.exitCode).toBe(0)
      expect(result.baselined).toEqual([])
      expect(result.violations).toEqual([])
    } finally {
      repo.cleanup()
    }
  })

  it('fails on a new forbidden violation while allowing exact known baseline entries', () => {
    const repo = tempRepo()
    try {
      repo.write('src/main/legacy.ts', 'export const url = "https://share.onorca.dev"')
      repo.write('src/main/new.ts', 'export const url = "https://login.onorca.dev"')
      writeBaselineSet(repo, { baselineViolations: [knownLegacyViolation] })

      const result = runCorporateForbiddenEndpointScan({
        cwd: repo.root,
        policyPath,
        useBaseline: true
      })

      expect(result.exitCode).toBe(1)
      expect(result.baselined).toHaveLength(1)
      expect(result.violations).toMatchObject([
        {
          file: 'src/main/new.ts',
          match: 'https://login.onorca.dev'
        }
      ])
    } finally {
      repo.cleanup()
    }
  })

  it('rejects adding a new forbidden violation to the baseline ceiling bypass', () => {
    const repo = tempRepo()
    try {
      repo.write('src/main/legacy.ts', 'export const url = "https://share.onorca.dev"')
      repo.write('src/main/new.ts', 'export const url = "https://login.onorca.dev"')
      writeBaselineSet(repo, {
        baselineViolations: [knownLegacyViolation, newLegacyViolation],
        ceilingViolations: [knownLegacyViolation]
      })

      const result = runCorporateForbiddenEndpointScan({
        cwd: repo.root,
        policyPath,
        useBaseline: true
      })

      expect(result.exitCode).toBe(1)
      expect(result.baselineExpansion).toMatchObject([newLegacyViolation])
      expect(result.violations).toEqual([])
    } finally {
      repo.cleanup()
    }
  })
})
