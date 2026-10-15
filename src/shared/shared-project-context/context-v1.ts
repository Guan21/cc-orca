/**
 * #143 Shared Project Context v1 — portable DATA, never authority.
 *
 * This contract deliberately supports manual, unverified inputs only. A future
 * authenticated producer must use a separately reviewed/versioned contract.
 * Valid JSON is not proof of source identity, consent or task completion.
 */
export const SHARED_CONTEXT_V1_MAX_BYTES = 32 * 1024

export type ContextProvider = 'claude-code' | 'codex' | 'human' | 'other'

export type SharedContextV1 = {
  schemaVersion: 1
  kind: 'project-context' | 'handoff'
  contextId: string
  projectId: string
  taskId: string | null
  revision: number
  generatedAt: string
  expiresAt: string
  /** No authenticated Project Map activity is available to this manual contract. */
  projectStateSource: 'unavailable'
  source: {
    provider: ContextProvider
    runId: string | null
    provenance: 'manual_unverified'
  }
  targetProvider: ContextProvider | null
  content: {
    goal: string
    completedClaims: string[]
    decisions: string[]
    relevantFiles: string[]
    evidenceRefs: string[]
    risks: string[]
    remainingWork: string[]
    nextAction: string
  }
}

export type SharedContextParseResult =
  | { ok: true; value: SharedContextV1 }
  | { ok: false; reason: 'invalid_json' | 'invalid_contract' | 'unsupported_version' | 'oversized' | 'expired' }

const MAX_ITEMS = 32
const MAX_SUMMARY_CHARS = 1024
const MAX_ITEM_CHARS = 512
const BIDI = /[\u202a-\u202e\u2066-\u2069]/

function unsafeCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code < 32 || code === 127 || BIDI.test(char)) {
      return true
    }
  }
  return false
}
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/
const PROVIDERS: readonly string[] = ['claude-code', 'codex', 'human', 'other']

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key))
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

function nullableId(value: unknown): value is string | null {
  return value === null || identifier(value)
}

function provider(value: unknown): value is ContextProvider {
  return typeof value === 'string' && PROVIDERS.includes(value)
}

function text(value: unknown, maxChars: number, allowEmpty = false): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxChars &&
    (allowEmpty || value.length > 0) &&
    value === value.trim() &&
    !unsafeCharacters(value)
  )
}

function list(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_ITEMS &&
    value.every((entry) => text(entry, MAX_ITEM_CHARS))
  )
}

function safeRelativeFile(value: unknown): boolean {
  if (!text(value, MAX_ITEM_CHARS) || typeof value !== 'string') {
    return false
  }
  if (value.startsWith('/') || value.startsWith('~') || value.includes('\\')) {
    return false
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    return false
  }
  const parts = value.split('/')
  return parts.every((part) => part !== '' && part !== '.' && part !== '..')
}

function utcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) {
    return false
  }
  const ms = Date.parse(value)
  return Number.isFinite(ms) && new Date(ms).toISOString() === value
}

function validContent(value: unknown): boolean {
  if (!record(value) || !exactKeys(value, [
    'goal', 'completedClaims', 'decisions', 'relevantFiles', 'evidenceRefs',
    'risks', 'remainingWork', 'nextAction'
  ])) {
    return false
  }

  return (
    text(value.goal, MAX_SUMMARY_CHARS) &&
    list(value.completedClaims) &&
    list(value.decisions) &&
    list(value.relevantFiles) &&
    value.relevantFiles.every(safeRelativeFile) &&
    list(value.evidenceRefs) &&
    list(value.risks) &&
    list(value.remainingWork) &&
    text(value.nextAction, MAX_SUMMARY_CHARS, true)
  )
}

function validContract(value: Record<string, unknown>): value is SharedContextV1 {
  if (!exactKeys(value, [
    'schemaVersion', 'kind', 'contextId', 'projectId', 'taskId', 'revision',
    'generatedAt', 'expiresAt', 'projectStateSource', 'source', 'targetProvider', 'content'
  ])) return false

  if (!record(value.source) || !exactKeys(value.source, ['provider', 'runId', 'provenance'])) {
    return false
  }

  return (
    value.schemaVersion === 1 &&
    (value.kind === 'project-context' || value.kind === 'handoff') &&
    identifier(value.contextId) &&
    identifier(value.projectId) &&
    nullableId(value.taskId) &&
    Number.isSafeInteger(value.revision) &&
    (value.revision as number) >= 0 &&
    utcTimestamp(value.generatedAt) &&
    utcTimestamp(value.expiresAt) &&
    Date.parse(value.expiresAt as string) > Date.parse(value.generatedAt as string) &&
    value.projectStateSource === 'unavailable' &&
    provider(value.source.provider) &&
    nullableId(value.source.runId) &&
    value.source.provenance === 'manual_unverified' &&
    (value.targetProvider === null || provider(value.targetProvider)) &&
    (value.kind !== 'handoff' ||
      (identifier(value.taskId) && provider(value.targetProvider))) &&
    (value.kind !== 'project-context' || value.targetProvider === null) &&
    validContent(value.content) &&
    (value.kind !== 'handoff' ||
      (record(value.content) && text(value.content.nextAction, MAX_SUMMARY_CHARS)))
  )
}

/** Validates shape, bounded size and freshness. Never authenticates file contents. */
export function parseSharedContextV1(
  raw: unknown,
  nowMs: number = Date.now()
): SharedContextParseResult {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(raw)
  } catch {
    return { ok: false, reason: 'invalid_contract' }
  }
  if (serialized === undefined) {
    return { ok: false, reason: 'invalid_contract' }
  }
  if (new TextEncoder().encode(serialized).byteLength > SHARED_CONTEXT_V1_MAX_BYTES) {
    return { ok: false, reason: 'oversized' }
  }
  if (!record(raw)) {
    return { ok: false, reason: 'invalid_contract' }
  }
  if (raw.schemaVersion !== 1) {
    return { ok: false, reason: 'unsupported_version' }
  }
  if (!validContract(raw)) {
    return { ok: false, reason: 'invalid_contract' }
  }
  if (!Number.isFinite(nowMs) || Date.parse(raw.expiresAt) <= nowMs) {
    return { ok: false, reason: 'expired' }
  }
  return { ok: true, value: raw }
}

/** Parse a file, with a size check before JSON parsing to bound resource usage. */
export function parseSharedContextJsonV1(
  json: string,
  nowMs: number = Date.now()
): SharedContextParseResult {
  if (typeof json !== 'string') {
    return { ok: false, reason: 'invalid_json' }
  }
  if (new TextEncoder().encode(json).byteLength > SHARED_CONTEXT_V1_MAX_BYTES) {
    return { ok: false, reason: 'oversized' }
  }
  try {
    return parseSharedContextV1(JSON.parse(json) as unknown, nowMs)
  } catch {
    return { ok: false, reason: 'invalid_json' }
  }
}
