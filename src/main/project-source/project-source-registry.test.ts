import { describe, expect, it } from 'vitest'
import { ProjectSourceRegistry } from './project-source-registry'
import { createSourceFixture, fixtureScope } from './project-source-test-fixtures'

describe('Main source registry', () => {
  it('rejects ambiguous catalogs and missing Main namespace or policy', () => {
    const f = createSourceFixture()
    const options = {
      installationId: 'installation',
      sessionId: 'session',
      policyEpoch: 1,
      maxRegistrations: 1,
      catalog: [f.binding],
      principals: ['person']
    }
    expect(
      () => new ProjectSourceRegistry({ ...options, catalog: [f.binding, f.binding] })
    ).toThrow('Ambiguous')
    expect(() => new ProjectSourceRegistry({ ...options, installationId: '' })).toThrow('namespace')
    expect(() => new ProjectSourceRegistry({ ...options, sessionId: '*' })).toThrow('namespace')
    expect(() => new ProjectSourceRegistry({ ...options, policyEpoch: 0 })).toThrow('namespace')
  })
  it('accepts only catalog-owned immutable native personal bindings', () => {
    const f = createSourceFixture()
    const record = f.registry.resolve(f.producer, f.scope)
    expect(record?.scope).toEqual(f.scope)
    expect(Object.isFrozen(record?.scope)).toBe(true)
    expect(f.registry.resolve(Symbol('producer'), f.scope)).toBeNull()
    expect(f.registry.resolvePrincipal(Symbol('principal'))).toBeNull()
  })

  it.each([
    ['projectId', 'other'],
    ['repositoryId', 'other'],
    ['workspaceId', 'other'],
    ['worktreeId', 'unknown'],
    ['installationId', 'other'],
    ['sessionId', 'other'],
    ['executionRealm', 'wsl:Ubuntu'],
    ['executionHostId', 'ssh:remote'],
    ['executionHostId', 'runtime:remote'],
    ['setupId', 'other'],
    ['producerIncarnation', 'other'],
    ['registrationRevision', 2],
    ['policyEpoch', 2],
    ['kind', 'folder-workspace'],
    ['worktreeId', null],
    ['projectId', '*']
  ])('denies mismatched %s=%s', (field, value) => {
    const f = createSourceFixture()
    expect(
      f.registry.resolve(f.producer, { ...f.scope, [field]: value } as typeof f.scope)
    ).toBeNull()
    expect(
      f.registry.register({ ...f.binding, scope: { ...f.scope, [field]: value } as typeof f.scope })
    ).toBeNull()
  })

  it('supports exact folder workspaces without giving null wildcard meaning', () => {
    const f = createSourceFixture({ kind: 'folder-workspace', worktreeId: null })
    expect(f.registry.resolve(f.producer, f.scope)).not.toBeNull()
    expect(f.registry.resolve(f.producer, fixtureScope())).toBeNull()
  })

  it('denies corporate and unknown catalog entries and enforces registration budget', () => {
    const f = createSourceFixture()
    expect(f.registry.register({ ...f.binding, sourceKind: 'corporate' })).toBeNull()
    expect(f.registry.register({ ...f.binding, producerId: 'unknown' })).toBeNull()
    const other = { ...f.binding, sourceId: 'other' }
    const r = new ProjectSourceRegistry({
      installationId: 'installation',
      sessionId: 'session',
      policyEpoch: 1,
      maxRegistrations: 1,
      catalog: [f.binding, other],
      principals: ['person']
    })
    expect(r.register(f.binding)).not.toBeNull()
    expect(r.register(other)).toBeNull()
  })

  it('does not trust corporate, WSL or remote records even in the injected catalog', () => {
    const f = createSourceFixture()
    const unsupported = [
      { ...f.binding, sourceKind: 'corporate' as const },
      { ...f.binding, scope: { ...f.scope, executionRealm: 'wsl:Ubuntu' as const } },
      { ...f.binding, scope: { ...f.scope, executionHostId: 'ssh:remote' as const } },
      { ...f.binding, scope: { ...f.scope, executionHostId: 'runtime:remote' as const } }
    ]
    for (const binding of unsupported) {
      const registry = new ProjectSourceRegistry({
        installationId: 'installation',
        sessionId: 'session',
        policyEpoch: 1,
        maxRegistrations: 1,
        catalog: [binding],
        principals: ['person']
      })
      expect(registry.register(binding)).toBeNull()
    }
  })

  it('replacement revision and incarnation invalidate the previous registered identity', () => {
    const f = createSourceFixture()
    const registry = new ProjectSourceRegistry({
      installationId: 'installation',
      sessionId: 'session',
      policyEpoch: 1,
      maxRegistrations: 1,
      catalog: [f.binding],
      principals: ['person']
    })
    const old = registry.register(f.binding)!
    const previousScope = registry.resolve(old)!.scope
    const current = registry.register(f.binding)!
    expect(registry.resolve(old)).toBeNull()
    expect(registry.resolve(current, f.scope)).toBeNull()
    expect(registry.resolve(current)?.scope.producerIncarnation).not.toBe(
      previousScope.producerIncarnation
    )
    expect(registry.resolve(current)?.scope.registrationRevision).toBe(
      previousScope.registrationRevision + 1
    )
  })

  it.each(['restart', 'policy', 'session'] as const)(
    'invalidates stale handles on %s',
    (change) => {
      const f = createSourceFixture()
      const invalidated: symbol[] = []
      f.registry.onInvalidation((handle) => invalidated.push(handle))
      if (change === 'restart') {
        f.registry.register(f.binding)
      }
      if (change === 'policy') {
        f.registry.setPolicyEpoch(2)
      }
      if (change === 'session') {
        f.registry.invalidateSession()
      }
      expect(f.registry.resolve(f.producer)).toBeNull()
      expect(invalidated).toContain(f.producer)
    }
  )
})
