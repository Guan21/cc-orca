import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultPersistedState } from '../../../shared/constants'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { canonicalWorktreeIdentity } from '../../../shared/worktree/identity'
import { composeWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import { mergeWorktreeMetaForWrite } from './worktree-meta-write-normalization'
import * as metadata from './worktree-identity-metadata'
import { MetadataLineageOperations } from './metadata-lineage-operations'

const { save } = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('./write-scheduling', () => ({ scheduleSave: save }))

const WORKTREE = 'repo::/workspace/repo'

function fixture() {
  const runtime = { state: getDefaultPersistedState('/test') }
  const scheduling = {} as never
  function add(instanceId: string, hostId: ExecutionHostId = 'local', lastActivityAt = 0) {
    const key = canonicalWorktreeIdentity({
      worktreeId: WORKTREE,
      instanceId,
      executionHostId: hostId
    })
    const meta = mergeWorktreeMetaForWrite(undefined, { instanceId, hostId, lastActivityAt })
    runtime.state.worktreeMetaByIdentity ??= {}
    runtime.state.worktreeIdentityAliases ??= {}
    runtime.state.worktreeMetaByIdentity[key] = meta
    const alias = composeWorktreeHostIdentity(hostId, WORKTREE)
    runtime.state.worktreeIdentityAliases[alias] ??= []
    runtime.state.worktreeIdentityAliases[alias].push(key)
    return { key, meta, alias }
  }
  return {
    runtime,
    scheduling,
    add,
    strict: (host: ExecutionHostId = 'local') =>
      metadata.getUnambiguousWorktreeMetaForHost(runtime, scheduling, WORKTREE, host)
  }
}

describe('unambiguous host-qualified worktree metadata', () => {
  beforeEach(() => save.mockReset())

  it('returns the one matching canonical identity through the Store domain method', () => {
    const { runtime, scheduling, add } = fixture()
    const { meta } = add('instance-a')
    const operations = new MetadataLineageOperations(runtime, scheduling, {} as never)
    expect(operations.getUnambiguousWorktreeMetaForHost(WORKTREE, 'local')).toBe(meta)
    expect(save).not.toHaveBeenCalled()
  })

  it('denies competing same-host aliases while preserving newest-winner listing behavior', () => {
    const { runtime, scheduling, add, strict } = fixture()
    add('instance-a', 'local', 1)
    const newest = add('instance-b', 'local', 2)
    expect(metadata.getWorktreeMetaForHost(runtime, scheduling, WORKTREE, 'local')).toBe(
      newest.meta
    )
    expect(strict()).toBeUndefined()
  })

  it('isolates native and remote identities at the same locator', () => {
    const { add, strict } = fixture()
    const native = add('native')
    const remote = add('remote', 'ssh:server')
    expect(strict()).toBe(native.meta)
    expect(strict('ssh:server')).toBe(remote.meta)
  })

  it('denies a dangling alias without repairing it from legacy metadata', () => {
    const { runtime, add, strict } = fixture()
    const { key, meta } = add('instance-a')
    runtime.state.worktreeMeta[WORKTREE] = meta
    delete runtime.state.worktreeMetaByIdentity![key]
    expect(strict()).toBeUndefined()
    expect(save).not.toHaveBeenCalled()
  })

  it.each(['instanceId', 'hostId'] as const)('denies a changed canonical %s field', (field) => {
    const { add, strict } = fixture()
    const { meta } = add('instance-a')
    if (field === 'instanceId') {
      meta.instanceId = 'instance-b'
    } else {
      meta.hostId = 'ssh:server'
    }
    expect(strict()).toBeUndefined()
  })

  it('denies legacy instance replacement while an old canonical alias remains', () => {
    const { runtime, add, strict } = fixture()
    add('old')
    runtime.state.worktreeMeta[WORKTREE] = mergeWorktreeMetaForWrite(undefined, {
      instanceId: 'new',
      hostId: 'local'
    })
    expect(strict()).toBeUndefined()
  })

  it('migrates legacy identity through the existing schema and schedules invalidation', () => {
    const { runtime, strict } = fixture()
    runtime.state.worktreeMeta[WORKTREE] = mergeWorktreeMetaForWrite(undefined, {
      instanceId: 'legacy',
      hostId: 'local'
    })
    expect(strict()?.instanceId).toBe('legacy')
    expect(save).toHaveBeenCalledOnce()
    expect(strict()?.instanceId).toBe('legacy')
    expect(save).toHaveBeenCalledOnce()
  })

  it('denies missing, empty and duplicate aliases', () => {
    const { runtime, add, strict } = fixture()
    expect(strict()).toBeUndefined()
    const { alias, key } = add('instance-a')
    runtime.state.worktreeIdentityAliases![alias] = []
    expect(strict()).toBeUndefined()
    runtime.state.worktreeIdentityAliases![alias] = [key, key]
    expect(strict()).toBeUndefined()
  })
})
