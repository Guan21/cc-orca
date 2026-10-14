import { describe, expect, it } from 'vitest'
import { taskLifecycleDevelopmentEventFixture } from '../../shared/development-event-fixtures'
import { parseBoundedSourceBatch, type SourceBatchLimits } from './project-source-batch'

const limits: SourceBatchLimits = {
  maxEvents: 4,
  maxBatchBytes: 4096,
  maxEventBytes: 1024,
  maxDepth: 8,
  maxEntries: 100
}
const observation = {
  incarnation: 'incarnation-a',
  sequence: 1,
  event: taskLifecycleDevelopmentEventFixture({ projectId: 'project-a' })
}
const encode = (value: unknown) => JSON.stringify(value)

describe('bounded Main source batch parsing', () => {
  it('accepts a bounded v1 envelope and empty replay', () => {
    expect(parseBoundedSourceBatch(encode([observation]), limits)).toEqual([observation])
    expect(parseBoundedSourceBatch('[]', limits)).toEqual([])
  })

  it.each([
    '{',
    '{}',
    encode([{}]),
    encode([{ ...observation, sequence: 0 }]),
    encode([{ ...observation, sequence: 1.5 }]),
    encode([{ ...observation, incarnation: '' }]),
    encode([{ ...observation, grant: 'forged' }]),
    encode([{ ...observation, event: { projectId: 'project-a' } }]),
    encode(Array.from({ length: 5 }, () => observation))
  ])('rejects malformed schema, authority additions and count overflow: %s', (raw) => {
    expect(parseBoundedSourceBatch(raw, limits)).toBeNull()
  })

  it('rejects raw arrays, accessors and cyclic objects without touching them', () => {
    let touched = false
    const hostile = {
      get event() {
        touched = true
        throw new Error('must not read')
      }
    }
    const cycle: unknown[] = []
    cycle.push(cycle)
    for (const raw of [[observation], hostile, cycle, null]) {
      expect(parseBoundedSourceBatch(raw, limits)).toBeNull()
    }
    expect(touched).toBe(false)
  })

  it('checks UTF-8 bytes before parsing and bounds each event', () => {
    expect(parseBoundedSourceBatch(' '.repeat(4097), limits)).toBeNull()
    const large = {
      ...observation,
      event: { ...observation.event, payload: { title: '界'.repeat(400) } }
    }
    expect(parseBoundedSourceBatch(encode([large]), limits)).toBeNull()
    expect(
      parseBoundedSourceBatch(encode([observation]), { ...limits, maxBatchBytes: 1 })
    ).toBeNull()
  })

  it('rejects excessive depth and entry count before recursive v1 parsing', () => {
    const deep = `${'['.repeat(9)}0${']'.repeat(9)}`
    expect(parseBoundedSourceBatch(deep, limits)).toBeNull()
    expect(parseBoundedSourceBatch(encode([observation]), { ...limits, maxEntries: 2 })).toBeNull()
    const metadata = { nested: { nested: { nested: { nested: { nested: 1 } } } } }
    const event = { ...observation.event, payload: { ...observation.event.payload, metadata } }
    expect(parseBoundedSourceBatch(encode([{ ...observation, event }]), limits)).toBeNull()
  })

  it('ignores delimiters inside escaped JSON strings during depth preflight', () => {
    const event = { ...observation.event, payload: { title: '[{\\"}]' } }
    expect(parseBoundedSourceBatch(encode([{ ...observation, event }]), limits)).not.toBeNull()
  })

  it('rejects non-finite, nonpositive and fractional construction budgets', () => {
    for (const invalid of [0, -1, 1.5, Infinity, Number.NaN]) {
      expect(() => parseBoundedSourceBatch('[]', { ...limits, maxEvents: invalid })).toThrow()
    }
    for (const key of Object.keys(limits)) {
      const incomplete = { ...limits } as Record<string, unknown>
      delete incomplete[key]
      expect(() => parseBoundedSourceBatch('[]', incomplete as never)).toThrow()
    }
  })
})
