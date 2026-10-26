import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validateSmokeResults } from './validate-smoke-results.mjs'

const report = (successes, failures, errors = 0) => ({
  results: { stats: { successes, failures, errors } }
})

describe('promptfoo synthetic CI gate', () => {
  it('accepts exactly four passing synthetic assertions', () => {
    assert.doesNotThrow(() => validateSmokeResults(report(4, 0)))
  })

  it('rejects an eval with failed or errored tests', () => {
    assert.throws(() => validateSmokeResults(report(3, 1)), /smoke rejected/)
    assert.throws(() => validateSmokeResults(report(4, 0, 1)), /smoke rejected/)
  })

  it('rejects missing results, partial or zero-test output', () => {
    assert.throws(() => validateSmokeResults(null), /smoke rejected/)
    assert.throws(() => validateSmokeResults({}), /smoke rejected/)
    assert.throws(() => validateSmokeResults(report(0, 0)), /smoke rejected/)
    assert.throws(() => validateSmokeResults(report(3, 0)), /smoke rejected/)
  })
})
