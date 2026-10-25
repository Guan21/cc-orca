import test from 'node:test'
import assert from 'node:assert/strict'
import { describeStatus } from '../src/status.mjs'

test('ready state is reported', () => {
  assert.equal(describeStatus('ready'), 'Ready for observation')
})

test('unknown state is not treated as success', () => {
  assert.equal(describeStatus('no-source'), 'Unknown')
})
