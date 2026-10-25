/** #191 G2-C3: an inert, data-only IPC view contract; never an authority token. */
import { projectGitHubFacts, type GitHubFactSnapshot } from './project-facts-read-model'

export type SelectedPrViewFacts = Readonly<{
  revision: number
  packet: Readonly<{
    version: 1
    projectId: string
    prNumber: number
    headSha: string
    snapshot: GitHubFactSnapshot
  }>
}>
export type SelectedPrViewClear = Readonly<{ revision: number }>

const MAX_AGE_MS = 5 * 60_000
const hex = (x: unknown): x is string =>
  typeof x === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(x)
const safeRevision = (x: unknown): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= 0
const positive = (x: unknown): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x > 0

/** Accessor-backed, exotic or extended envelopes never cross the preload boundary. */
function fields(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const proto: unknown = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) {
    return false
  }
  const properties = Object.getOwnPropertyDescriptors(value)
  return Object.keys(properties).every((key) =>
    keys.includes(key) && Object.hasOwn(properties[key], 'value')
  )
}

export function readSelectedPrViewClear(input: unknown): SelectedPrViewClear | null {
  try {
    if (!fields(input, ['revision']) || !safeRevision(input.revision)) {
      return null
    }
    return { revision: input.revision }
  } catch {
    return null
  }
}

/** Re-project a private v1 packet to an allowlisted G1 fact set, never raw API text. */
export function readSelectedPrViewFacts(
  input: unknown,
  nowMs: number
): SelectedPrViewFacts | null {
  try {
    if (
      !fields(input, ['revision', 'packet']) ||
      !safeRevision(input.revision) ||
      !fields(input.packet, ['version', 'projectId', 'prNumber', 'headSha', 'snapshot'])
    ) {
      return null
    }
    const { packet } = input
    if (
      packet.version !== 1 ||
      typeof packet.projectId !== 'string' ||
      !positive(packet.prNumber) ||
      !hex(packet.headSha) ||
      !fields(packet.snapshot, [
        'version', 'projectId', 'bindingRevision', 'repository', 'fetchedAt',
        'facts', 'attestation', 'agentExecution', 'taskCompletion'
      ])
    ) {
      return null
    }
    const s = packet.snapshot
    if (
      s.version !== 1 ||
      s.projectId !== packet.projectId ||
      s.attestation !== 'not_verified_by_projection' ||
      s.agentExecution !== 'unknown' ||
      s.taskCompletion !== 'unknown'
    ) {
      return null
    }
    const projected = projectGitHubFacts(
      {
        version: s.version,
        projectId: s.projectId,
        bindingRevision: s.bindingRevision,
        repository: s.repository,
        fetchedAt: s.fetchedAt,
        facts: s.facts
      },
      {
        projectId: s.projectId as string,
        bindingRevision: s.bindingRevision as number,
        repository: s.repository as GitHubFactSnapshot['repository']
      },
      nowMs,
      MAX_AGE_MS
    )
    if (projected.status !== 'ready') {
      return null
    }
    const facts = projected.snapshot.facts
    const prs = facts.filter((fact) => fact.kind === 'pull_request')
    const commits = facts.filter((fact) => fact.kind === 'commit')
    const normalizedHead = packet.headSha.toLowerCase()
    if (
      prs.length !== 1 ||
      prs[0].number !== packet.prNumber ||
      prs[0].headSha !== normalizedHead ||
      commits.length !== 1 ||
      commits[0].sha !== normalizedHead ||
      facts.some((fact) => fact.kind === 'check_run' && fact.headSha !== normalizedHead)
    ) {
      return null
    }
    return {
      revision: input.revision,
      packet: {
        version: 1,
        projectId: packet.projectId,
        prNumber: packet.prNumber,
        headSha: normalizedHead,
        snapshot: projected.snapshot
      }
    }
  } catch {
    return null
  }
}
