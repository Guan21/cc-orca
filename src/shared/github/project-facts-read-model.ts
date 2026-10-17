/**
 * #116 V1 G1: PURE / UNWIRED GitHub factual snapshot projection.
 * Matching IDs and parsing never authenticate a Project reader, GitHub
 * principal, agent, Task, Run, or native operation. Main must enforce this.
 */
export const GITHUB_FACT_SNAPSHOT_VERSION = 1 as const
const MAX_FACTS = 100
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export type GitHubRepoKey = Readonly<{
  host: string
  id: number
  owner: string
  name: string
}>

export type GitHubProjectFactScope = Readonly<{
  projectId: string
  bindingRevision: number
  repository: GitHubRepoKey
}>

const CHECK_CONCLUSIONS = [
  'success', 'failure', 'neutral', 'cancelled', 'timed_out',
  'action_required', 'skipped'
] as const

type CheckConclusion = (typeof CHECK_CONCLUSIONS)[number] | null

export type GitHubFact =
  | Readonly<{
      kind: 'pull_request'
      number: number
      headSha: string
      state: 'open' | 'closed' | 'merged'
      updatedAt: string
    }>
  | Readonly<{ kind: 'commit'; sha: string }>
  | Readonly<{
      kind: 'check_run'
      id: number
      headSha: string
      status: 'queued' | 'in_progress' | 'completed'
      conclusion: CheckConclusion
    }>

export type GitHubFactSnapshot = Readonly<{
  version: typeof GITHUB_FACT_SNAPSHOT_VERSION
  projectId: string
  bindingRevision: number
  repository: GitHubRepoKey
  fetchedAt: string
  facts: readonly GitHubFact[]
  attestation: 'not_verified_by_projection'
  agentExecution: 'unknown'
  taskCompletion: 'unknown'
}>

export type GitHubFactProjectionResult =
  | { status: 'ready' | 'empty'; snapshot: GitHubFactSnapshot }
  | { status: 'unavailable' | 'invalid' | 'scope_mismatch' | 'stale' }

function plain(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    return false
  }
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) => Object.hasOwn(descriptor, 'value')
  )
}

function fields(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Object.keys(value).every((key) => keys.includes(key))
}

function bounded(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= limit && value.trim() === value && ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function revision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function sha(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)
}

function timestamp(value: unknown, atMost: number): value is string {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && parsed <= atMost
}

function repo(value: unknown): value is GitHubRepoKey {
  return fields(value, ['host', 'id', 'owner', 'name']) &&
    bounded(value.host, 128) && /^[a-z0-9.-]+$/i.test(value.host) &&
    positive(value.id) &&
    bounded(value.owner, 100) && /^[a-z0-9-]+$/i.test(value.owner) &&
    bounded(value.name, 100) && /^[a-z0-9._-]+$/i.test(value.name)
}

function scope(value: unknown): value is GitHubProjectFactScope {
  return fields(value, ['projectId', 'bindingRevision', 'repository']) &&
    bounded(value.projectId, 160) && revision(value.bindingRevision) &&
    repo(value.repository)
}

function sameScope(left: GitHubProjectFactScope, right: GitHubProjectFactScope): boolean {
  return left.projectId === right.projectId &&
    left.bindingRevision === right.bindingRevision &&
    left.repository.id === right.repository.id &&
    left.repository.host.toLowerCase() === right.repository.host.toLowerCase() &&
    left.repository.owner.toLowerCase() === right.repository.owner.toLowerCase() &&
    left.repository.name.toLowerCase() === right.repository.name.toLowerCase()
}

function validConclusion(value: unknown): value is CheckConclusion {
  return value === null ||
    (typeof value === 'string' && CHECK_CONCLUSIONS.some((candidate) => candidate === value))
}

function parseFact(value: unknown, fetchedAtMs: number): GitHubFact | null {
  if (!plain(value)) {
    return null
  }
  if (value.kind === 'pull_request' &&
      fields(value, ['kind', 'number', 'headSha', 'state', 'updatedAt']) &&
      positive(value.number) && sha(value.headSha) &&
      (value.state === 'open' || value.state === 'closed' || value.state === 'merged') &&
      timestamp(value.updatedAt, fetchedAtMs)) {
    return {
      kind: 'pull_request', number: value.number, headSha: value.headSha.toLowerCase(),
      state: value.state, updatedAt: value.updatedAt
    }
  }
  if (value.kind === 'commit' && fields(value, ['kind', 'sha']) && sha(value.sha)) {
    return { kind: 'commit', sha: value.sha.toLowerCase() }
  }
  if (value.kind === 'check_run' &&
      fields(value, ['kind', 'id', 'headSha', 'status', 'conclusion']) &&
      positive(value.id) && sha(value.headSha) &&
      (value.status === 'queued' || value.status === 'in_progress' ||
        value.status === 'completed') &&
      validConclusion(value.conclusion) &&
      (value.status === 'completed' || value.conclusion === null)) {
    return {
      kind: 'check_run', id: value.id, headSha: value.headSha.toLowerCase(),
      status: value.status, conclusion: value.conclusion
    }
  }
  return null
}

function keyOf(fact: GitHubFact): string {
  if (fact.kind === 'pull_request') {
    return `pr:${fact.number}`
  }
  if (fact.kind === 'check_run') {
    return `check:${fact.id}`
  }
  return `commit:${fact.sha}`
}

/** No I/O; untrusted content can never become a native execution claim. */
export function projectGitHubFacts(
  input: unknown,
  expectedScope: GitHubProjectFactScope,
  nowMs: number,
  maxAgeMs: number
): GitHubFactProjectionResult {
  if (!scope(expectedScope) || !Number.isFinite(nowMs) ||
      !Number.isFinite(maxAgeMs) || maxAgeMs <= 0 || maxAgeMs > MAX_AGE_MS) {
    return { status: 'invalid' }
  }
  if (input === null || input === undefined) {
    return { status: 'unavailable' }
  }
  if (!fields(input, ['version', 'projectId', 'bindingRevision', 'repository',
    'fetchedAt', 'facts']) ||
      input.version !== GITHUB_FACT_SNAPSHOT_VERSION ||
      !scope({ projectId: input.projectId, bindingRevision: input.bindingRevision,
        repository: input.repository })) {
    return { status: 'invalid' }
  }
  const actualScope: GitHubProjectFactScope = {
    projectId: input.projectId as string,
    bindingRevision: input.bindingRevision as number,
    repository: input.repository as GitHubRepoKey
  }
  if (!sameScope(actualScope, expectedScope)) {
    return { status: 'scope_mismatch' }
  }
  if (!timestamp(input.fetchedAt, nowMs) || !Array.isArray(input.facts) ||
      input.facts.length > MAX_FACTS) {
    return { status: 'invalid' }
  }
  const fetchedAtMs = Date.parse(input.fetchedAt)
  if (nowMs - fetchedAtMs > maxAgeMs) {
    return { status: 'stale' }
  }

  const facts: GitHubFact[] = []
  const keys = new Map<string, string>()
  for (const candidate of input.facts) {
    const fact = parseFact(candidate, fetchedAtMs)
    if (!fact) {
    return { status: 'invalid' }
  }
    const key = keyOf(fact)
    const serialized = JSON.stringify(fact)
    const previous = keys.get(key)
    if (previous !== undefined && previous !== serialized) {
    return { status: 'invalid' }
  }
    if (previous === undefined) {
      keys.set(key, serialized)
      facts.push(fact)
    }
  }
  facts.sort((a, b) => keyOf(a).localeCompare(keyOf(b)))
  return {
    status: facts.length === 0 ? 'empty' : 'ready',
    snapshot: {
      version: GITHUB_FACT_SNAPSHOT_VERSION,
      projectId: expectedScope.projectId,
      bindingRevision: expectedScope.bindingRevision,
      repository: { ...expectedScope.repository },
      fetchedAt: input.fetchedAt,
      facts,
      attestation: 'not_verified_by_projection',
      agentExecution: 'unknown',
      taskCompletion: 'unknown'
    }
  }
}
