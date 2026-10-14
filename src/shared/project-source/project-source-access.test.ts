import { describe, expect, it } from 'vitest'
import { taskLifecycleDevelopmentEventFixture } from '../development-event-fixtures'
import type { ProjectSourceAccessRequest, ProjectSourceGrant } from './project-source-access'
import { admitProjectSourceReplay, decideProjectSourceAccess } from './project-source-access'

const scope = {
  projectId: 'project-a',
  repositoryId: 'repo-a',
  workspaceId: 'workspace-a',
  worktreeId: 'worktree-a',
  executionHostId: 'local'
} as const

const request: ProjectSourceAccessRequest = {
  principalId: 'user-a',
  producerId: 'verified-producer-a',
  sourceId: 'approved-local-replay',
  eventSourceName: 'devcrew.fixture',
  scope,
  permission: 'read-snapshot'
}

const grant: ProjectSourceGrant = {
  principalId: request.principalId,
  producerId: request.producerId,
  sourceId: request.sourceId,
  eventSourceName: request.eventSourceName,
  scope,
  permissions: ['read-snapshot', 'ingest-event']
}

describe('#116 source access policy', () => {
  it('denies by default, even when a request has a plausible project and producer', () => {
    expect(decideProjectSourceAccess(request, [])).toEqual({
      allowed: false,
      reason: 'not_authorized'
    })
  })

  it('allows only an exact, policy-granted principal/producer/source/scope/permission', () => {
    expect(decideProjectSourceAccess(request, [grant])).toEqual({ allowed: true })
  })

  it.each([
    [{ principalId: 'user-b' }, 'different reader'],
    [{ producerId: 'different-producer' }, 'different authenticated producer'],
    [{ sourceId: 'other-source' }, 'different registered source'],
    [{ eventSourceName: 'untrusted.fixture' }, 'different event source label'],
    [{ permission: 'ingest-event' as const }, 'operation denied by read-only grant']
  ] as const)('rejects %s (%s)', (patch, _description) => {
    const readOnlyGrant: ProjectSourceGrant = { ...grant, permissions: ['read-snapshot'] }
    expect(decideProjectSourceAccess({ ...request, ...patch }, [readOnlyGrant])).toEqual({
      allowed: false,
      reason: 'not_authorized'
    })
  })

  it.each([
    [{ projectId: 'project-b' }, 'different project'],
    [{ repositoryId: 'repo-b' }, 'different repository'],
    [{ workspaceId: 'workspace-b' }, 'different workspace'],
    [{ worktreeId: 'worktree-b' }, 'different worktree'],
    [{ executionHostId: 'ssh:host-b' }, 'same IDs on SSH'],
    [{ executionHostId: 'runtime:env-b' }, 'same IDs on runtime host'],
    [{ workspaceId: null }, 'explicit repo-wide scope'],
    [{ worktreeId: null }, 'explicit all-worktrees scope']
  ] as const)('rejects %s (%s) without matching exact scope grant', (patch, _description) => {
    const changed = { ...request, scope: { ...scope, ...patch } } as ProjectSourceAccessRequest
    expect(decideProjectSourceAccess(changed, [grant])).toEqual({
      allowed: false,
      reason: 'not_authorized'
    })
  })

  it('does not turn an SSH grant into an all-host grant', () => {
    const remoteScope = { ...scope, executionHostId: 'ssh:target-a' as const }
    const remoteGrant: ProjectSourceGrant = { ...grant, scope: remoteScope }
    expect(
      decideProjectSourceAccess({ ...request, scope: { ...remoteScope, executionHostId: 'local' } }, [
        remoteGrant
      ])
    ).toEqual({ allowed: false, reason: 'not_authorized' })
  })

  it.each([
    { projectId: '' },
    { repositoryId: ' repo-a ' },
    { workspaceId: undefined },
    { worktreeId: undefined },
    { executionHostId: 'all' },
    { executionHostId: 'ssh:' },
    { executionHostId: 'unexpected' }
  ])('fails closed on incomplete or ambiguous identities: %s', (patch) => {
    const badScope = { ...scope, ...patch } as ProjectSourceAccessRequest['scope']
    expect(decideProjectSourceAccess({ ...request, scope: badScope }, [grant])).toEqual({
      allowed: false,
      reason: 'invalid_identity'
    })
  })

  it('ignores malformed or unrecognized grants instead of elevating authority', () => {
    const bad: ProjectSourceGrant = {
      ...grant,
      scope: { ...scope, executionHostId: 'all' as never }
    }
    expect(decideProjectSourceAccess(request, [bad])).toEqual({
      allowed: false,
      reason: 'not_authorized'
    })
    expect(decideProjectSourceAccess(request, [{ ...grant, permissions: ['admin' as never] }])).toEqual(
      { allowed: false, reason: 'not_authorized' }
    )
  })

  it('does not infer read permission from an ingestion-only grant', () => {
    const ingestOnly: ProjectSourceGrant = { ...grant, permissions: ['ingest-event'] }
    expect(decideProjectSourceAccess(request, [ingestOnly]).allowed).toBe(false)
    expect(
      decideProjectSourceAccess({ ...request, permission: 'ingest-event' }, [ingestOnly])
    ).toEqual({ allowed: true })
  })
})

describe('#116 replay admission boundary', () => {
  const ingestionIdentity: Omit<ProjectSourceAccessRequest, 'permission'> = {
    principalId: request.principalId,
    producerId: request.producerId,
    sourceId: request.sourceId,
    eventSourceName: request.eventSourceName,
    scope
  }
  const event = taskLifecycleDevelopmentEventFixture({ projectId: 'project-a' })

  it('denies replay even if events claim a recognized source but no grant exists', () => {
    expect(admitProjectSourceReplay([event], ingestionIdentity, [])).toEqual({
      allowed: false,
      reason: 'not_authorized'
    })
  })

  it('accepts valid, exactly scoped input and an explicitly authorized empty replay', () => {
    expect(admitProjectSourceReplay([event], ingestionIdentity, [grant])).toEqual({
      allowed: true,
      events: [event]
    })
    expect(admitProjectSourceReplay([], ingestionIdentity, [grant])).toEqual({
      allowed: true,
      events: []
    })
  })

  it('atomically denies project collisions and payload source spoofing', () => {
    const otherProject = { ...event, eventId: 'second', projectId: 'project-b' }
    const otherSource = { ...event, eventId: 'second', source: 'untrusted-source' }
    expect(admitProjectSourceReplay([event, otherProject], ingestionIdentity, [grant])).toEqual({
      allowed: false,
      reason: 'source_mismatch'
    })
    expect(admitProjectSourceReplay([event, otherSource], ingestionIdentity, [grant])).toEqual({
      allowed: false,
      reason: 'source_mismatch'
    })
  })

  it('does not project a partially invalid replay', () => {
    expect(admitProjectSourceReplay([event, { projectId: 'project-a' }], ingestionIdentity, [grant])).toEqual({
      allowed: false,
      reason: 'invalid_events'
    })
    expect(admitProjectSourceReplay({ events: [event] }, ingestionIdentity, [grant])).toEqual({
      allowed: false,
      reason: 'invalid_events'
    })
  })

  it('does not mistake an event.source string for verified producer identity', () => {
    expect(
      admitProjectSourceReplay(
        [event],
        { ...ingestionIdentity, producerId: 'unverified-producer' },
        [grant]
      )
    ).toEqual({ allowed: false, reason: 'not_authorized' })
  })

  it('requires an ingestion grant and will not reuse read-only permission', () => {
    const readOnly: ProjectSourceGrant = { ...grant, permissions: ['read-snapshot'] }
    expect(admitProjectSourceReplay([event], ingestionIdentity, [readOnly])).toEqual({
      allowed: false,
      reason: 'not_authorized'
    })
  })
})
