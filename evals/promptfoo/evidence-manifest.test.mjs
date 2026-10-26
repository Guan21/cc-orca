import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildEvidenceManifest, sha256 } from './write-evidence-manifest.mjs'

const SOURCE = {
  repository: 'Guan21/cc-orca',
  pullRequestNumber: '195',
  headSha: 'a'.repeat(40),
  runId: '123',
  runAttempt: '1',
  stepOutcome: 'success'
}

describe('promptfoo CI evidence manifest', () => {
  it('labels results synthetic and unverified even after a successful run', () => {
    const m = buildEvidenceManifest({
      source: SOURCE,
      configBytes: Buffer.from('providers: [echo]'),
      reports: {
        'results.json': Buffer.from('{"results":[]}'),
        'results.junit.xml': Buffer.from('<testsuites/>')
      }
    })
    assert.equal(m.kind, 'synthetic_pipeline_smoke_only')
    assert.equal(m.authority, 'unverified_ci_artifact')
    assert.equal(m.source.headShaClaim, SOURCE.headSha)
    assert.equal(m.evaluator.provider, 'echo')
    assert.equal(m.artifacts['results.json'].sha256, sha256(Buffer.from('{"results":[]}')))
    assert.equal(m.artifacts['results.junit.xml'].present, true)
    assert.equal(m.claims.realAgentTested, false)
    assert.equal(m.claims.policyEnforced, false)
    assert.equal(m.claims.taskOutcomeVerified, false)
  })

  it('retains missing output as missing rather than PASS', () => {
    const m = buildEvidenceManifest({
      source: { ...SOURCE, stepOutcome: 'failure' },
      configBytes: Buffer.from('fixture'),
      reports: {}
    })
    assert.equal(m.evaluationStepOutcome, 'failure')
    assert.deepEqual(m.artifacts['results.json'], { present: false })
    assert.deepEqual(m.artifacts['results.junit.xml'], { present: false })
    assert.equal(m.authority, 'unverified_ci_artifact')
  })

  it('does not interpret GitHub context metadata as an authenticated grant', () => {
    const m = buildEvidenceManifest({
      source: { ...SOURCE, repository: 'untrusted/claimed-repo', headSha: 'old-sha' },
      configBytes: Buffer.from('fixture'),
      reports: {}
    })
    assert.equal(m.source.repository, 'untrusted/claimed-repo')
    assert.equal(m.source.headShaClaim, 'old-sha')
    assert.equal(m.authority, 'unverified_ci_artifact')
  })
})
