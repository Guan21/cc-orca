import type {
  ProjectSourcePermission,
  ProjectSourceScope
} from '../../shared/project-source/project-source-access'
import { ProjectSourceLeases, type TrustedProjectSourceLease } from './project-source-leases'
import { ProjectSourceRegistry, type TrustedSourceBinding } from './project-source-registry'

/** Test-only authority. Never import this fixture from runtime code. */
export function fixtureScope(overrides: Partial<ProjectSourceScope> = {}): ProjectSourceScope {
  return {
    installationId: 'installation',
    sessionId: 'session',
    executionRealm: 'native',
    setupId: 'setup',
    producerIncarnation: 'incarnation',
    registrationRevision: 1,
    policyEpoch: 1,
    projectId: 'project',
    repositoryId: 'repository',
    workspaceId: 'workspace',
    executionHostId: 'local',
    kind: 'git-worktree',
    worktreeId: 'worktree',
    ...overrides
  } as ProjectSourceScope
}

export function createSourceFixture(overrides: Partial<ProjectSourceScope> = {}) {
  const scope = Object.freeze(fixtureScope(overrides))
  const binding: TrustedSourceBinding = Object.freeze({
    producerId: 'producer',
    sourceId: 'source',
    eventSourceName: 'fixture',
    sourceKind: 'personal',
    scope
  })
  const registry = new ProjectSourceRegistry({
    installationId: 'installation',
    sessionId: 'session',
    policyEpoch: 1,
    maxRegistrations: 2,
    catalog: [binding],
    principals: ['person']
  })
  let time = 0
  let records: readonly TrustedProjectSourceLease[] = []
  const leases = new ProjectSourceLeases(registry, {
    clock: () => time,
    leaseDurationMs: 100,
    maxOperations: 128,
    trustedLeaseRecords: () => records
  })
  const fixture = {
    scope,
    binding,
    registry,
    leases,
    producer: registry.register(binding)!,
    principal: registry.principal('person')!,
    setTime(value: number) {
      time = value
    },
    restart() {
      fixture.producer = registry.register(binding)!
      fixture.scope = registry.resolve(fixture.producer)!.scope
    },
    grant(permissions: readonly ProjectSourcePermission[]) {
      if (records.length > 0) {
        registry.invalidate(fixture.producer)
        fixture.restart()
      }
      records = [
        Object.freeze({
          id: 'lease',
          generation: Symbol('test lease generation'),
          producer: fixture.producer,
          principal: fixture.principal,
          scope: fixture.scope,
          permissions: Object.freeze([...permissions]),
          issuedAt: time
        })
      ]
      return records[0]
    }
  }
  fixture.scope = registry.resolve(fixture.producer)!.scope
  return fixture
}
