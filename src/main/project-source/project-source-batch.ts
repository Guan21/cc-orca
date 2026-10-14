import { Buffer } from 'node:buffer'
import { parseDevelopmentEvent } from '../../shared/development-event-schema'
import type { DevelopmentEvent } from '../../shared/development-event-types'

export type SourceBatchLimits = {
  readonly maxEvents: number
  readonly maxBatchBytes: number
  readonly maxEventBytes: number
  readonly maxDepth: number
  readonly maxEntries: number
}

export type SourceObservation = {
  readonly incarnation: string
  readonly sequence: number
  readonly event: DevelopmentEvent
}

export function assertSourceLimits(limits: SourceBatchLimits): void {
  assertPositiveSourceBudgets(
    limits.maxEvents,
    limits.maxBatchBytes,
    limits.maxEventBytes,
    limits.maxDepth,
    limits.maxEntries
  )
}

export function assertPositiveSourceBudgets(...values: readonly number[]): void {
  if (values.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error('Source limits must be positive safe integers')
  }
}

// Lexical budgets precede JSON.parse and the recursive v1 metadata schema.
function withinJsonBudgets(raw: string, limits: SourceBatchLimits): boolean {
  let depth = 0
  let entries = 0
  let count = 1
  let quoted = false
  let escaped = false
  for (const character of raw) {
    if (quoted) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        quoted = false
      }
      continue
    }
    if (character === '"') {
      quoted = true
    } else if (character === '[' || character === '{') {
      depth += 1
      entries += 1
    } else if (character === ']' || character === '}') {
      depth -= 1
    } else if (character === ',' || character === ':') {
      entries += 1
      if (character === ',' && depth === 1) {
        count += 1
      }
    }
    if (
      depth < 0 ||
      depth > limits.maxDepth ||
      entries > limits.maxEntries ||
      count > limits.maxEvents
    ) {
      return false
    }
  }
  return !quoted && depth === 0
}

/** Authenticated callers still supply only bounded JSON, never arbitrary objects/accessors. */
export function parseBoundedSourceBatch(
  raw: unknown,
  limits: SourceBatchLimits
): SourceObservation[] | null {
  assertSourceLimits(limits)
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > limits.maxBatchBytes) {
    return null
  }
  if (!withinJsonBudgets(raw, limits)) {
    return null
  }
  let batch: unknown
  try {
    batch = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(batch) || batch.length > limits.maxEvents) {
    return null
  }
  const observations: SourceObservation[] = []
  for (const rawObservation of batch) {
    if (!rawObservation || typeof rawObservation !== 'object' || Array.isArray(rawObservation)) {
      return null
    }
    const observation = rawObservation as Record<string, unknown>
    if (Object.keys(observation).sort().join(',') !== 'event,incarnation,sequence') {
      return null
    }
    if (
      typeof observation.incarnation !== 'string' ||
      !observation.incarnation.trim() ||
      observation.incarnation !== observation.incarnation.trim()
    ) {
      return null
    }
    if (
      typeof observation.sequence !== 'number' ||
      !Number.isSafeInteger(observation.sequence) ||
      observation.sequence <= 0
    ) {
      return null
    }
    if (Buffer.byteLength(JSON.stringify(observation), 'utf8') > limits.maxEventBytes) {
      return null
    }
    const parsed = parseDevelopmentEvent(observation.event)
    if (!parsed.ok) {
      return null
    }
    observations.push({
      incarnation: observation.incarnation,
      sequence: observation.sequence,
      event: parsed.value
    })
  }
  return observations
}
