import { z } from 'zod'
import {
  DEVELOPMENT_EVENT_TYPES,
  DEVELOPMENT_EVENT_VERSION,
  type DevelopmentEvent,
  type DevelopmentEventType
} from './development-event-types'

export { DEVELOPMENT_EVENT_TYPES, DEVELOPMENT_EVENT_VERSION }
export type { DevelopmentEvent, DevelopmentEventType }

const nonEmptyString = z.string().trim().min(1)

const isoTimestamp = z
  .string()
  .refine(
    (value) =>
      value.trim() === value &&
      /\d{4}-\d{2}-\d{2}T/.test(value) &&
      !Number.isNaN(Date.parse(value)),
    'Invalid ISO timestamp'
  )

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema)
  ])
)

const metadataSchema = z.record(z.string(), jsonValueSchema)

const taskLifecyclePayloadSchema = z
  .object({
    title: nonEmptyString.optional(),
    result: z.string().optional(),
    metadata: metadataSchema.optional()
  })
  .strict()

const agentPayloadSchema = z
  .object({
    agentId: nonEmptyString,
    status: z.enum(['started', 'completed', 'failed']).optional(),
    errorMessage: z.string().optional(),
    metadata: metadataSchema.optional()
  })
  .strict()

const fileChangedPayloadSchema = z
  .object({
    path: nonEmptyString,
    changeType: z.enum(['added', 'modified', 'deleted', 'renamed']),
    oldPath: nonEmptyString.optional(),
    metadata: metadataSchema.optional()
  })
  .strict()

const commitCreatedPayloadSchema = z
  .object({
    sha: nonEmptyString,
    message: z.string().optional(),
    branch: nonEmptyString.optional(),
    metadata: metadataSchema.optional()
  })
  .strict()

const pullRequestCreatedPayloadSchema = z
  .object({
    provider: nonEmptyString,
    pullRequestId: nonEmptyString,
    url: z.url(),
    title: z.string().optional(),
    metadata: metadataSchema.optional()
  })
  .strict()

const reviewPayloadSchema = z
  .object({
    provider: nonEmptyString,
    reviewId: nonEmptyString,
    status: z.enum(['requested', 'completed']),
    pullRequestId: nonEmptyString.optional(),
    metadata: metadataSchema.optional()
  })
  .strict()

const testCompletedPayloadSchema = z
  .object({
    status: z.enum(['passed', 'failed', 'skipped']),
    suite: nonEmptyString.optional(),
    passed: z.number().int().nonnegative().optional(),
    failed: z.number().int().nonnegative().optional(),
    skipped: z.number().int().nonnegative().optional(),
    metadata: metadataSchema.optional()
  })
  .strict()

const actorSchema = z
  .object({
    type: z.enum(['human', 'agent', 'system']),
    id: nonEmptyString,
    provider: nonEmptyString.optional()
  })
  .strict()

function eventSchema<TType extends DevelopmentEventType, TPayload extends z.ZodTypeAny>(
  eventType: TType,
  payload: TPayload
) {
  return z
    .object({
      version: z.literal(DEVELOPMENT_EVENT_VERSION),
      eventId: nonEmptyString,
      eventType: z.literal(eventType),
      occurredAt: isoTimestamp,
      projectId: nonEmptyString,
      taskId: nonEmptyString.optional(),
      sessionId: nonEmptyString.optional(),
      actor: actorSchema,
      source: nonEmptyString,
      payload
    })
    .strict()
}

export const developmentEventSchema = z.discriminatedUnion('eventType', [
  eventSchema('task.started', taskLifecyclePayloadSchema),
  eventSchema('task.completed', taskLifecyclePayloadSchema),
  eventSchema('agent.started', agentPayloadSchema),
  eventSchema('agent.completed', agentPayloadSchema),
  eventSchema('agent.failed', agentPayloadSchema),
  eventSchema('file.changed', fileChangedPayloadSchema),
  eventSchema('commit.created', commitCreatedPayloadSchema),
  eventSchema('pull_request.created', pullRequestCreatedPayloadSchema),
  eventSchema('review.requested', reviewPayloadSchema),
  eventSchema('review.completed', reviewPayloadSchema),
  eventSchema('test.completed', testCompletedPayloadSchema)
]) satisfies z.ZodType<DevelopmentEvent>

export type ParseDevelopmentEventResult =
  | { ok: true; value: DevelopmentEvent }
  | { ok: false; error: string }

export type ParseDevelopmentEventReplayResult =
  | { ok: true; events: DevelopmentEvent[] }
  | { ok: false; index: number; error: string }

function describeDevelopmentEventError(error: z.ZodError): string {
  const issue = error.issues[0]
  const path = issue?.path.join('.') || '<root>'
  return `${path}: ${issue?.message ?? 'invalid DevelopmentEvent v1'}`
}

export function parseDevelopmentEvent(raw: unknown): ParseDevelopmentEventResult {
  const result = developmentEventSchema.safeParse(raw)
  if (result.success) {
    return { ok: true, value: result.data }
  }
  return { ok: false, error: describeDevelopmentEventError(result.error) }
}

export function assertDevelopmentEvent(raw: unknown): DevelopmentEvent {
  const result = parseDevelopmentEvent(raw)
  if (result.ok) {
    return result.value
  }
  throw new Error(`Invalid DevelopmentEvent v1: ${result.error}`)
}

export function serializeDevelopmentEvent(event: unknown): string {
  return JSON.stringify(assertDevelopmentEvent(event))
}

// Replay preserves persisted input order; v1 does not infer global ordering.
export function parseDevelopmentEventReplay(raw: unknown): ParseDevelopmentEventReplayResult {
  if (!Array.isArray(raw)) {
    return { ok: false, index: -1, error: '<root>: replay payload must be an array' }
  }
  const events: DevelopmentEvent[] = []
  for (let index = 0; index < raw.length; index += 1) {
    const result = parseDevelopmentEvent(raw[index])
    if (!result.ok) {
      return { ok: false, index, error: result.error }
    }
    events.push(result.value)
  }
  return { ok: true, events }
}
