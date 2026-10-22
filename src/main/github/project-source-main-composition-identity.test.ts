import { describe, expect, it } from 'vitest'
import type { GitHubFact } from '../../shared/github/project-facts-read-model'
import { setup } from './__fixtures__/selected-pr-source-composition'
import { HEAD, NOW, deferred, head, ready } from './__fixtures__/selected-pr-head-provider'

const IDENTITY_PATHS = [
  'document.profile',
  'document.executionRealm',
  'document.installationId',
  'document.windowId',
  'document.webContentsId',
  'document.frameProcessId',
  'document.frameRoutingId',
  'document.documentId',
  'document.sessionPartition',
  'document.principalId',
  'document.credentialGeneration',
  'binding.projectId',
  'binding.workspaceKind',
  'binding.workspaceId',
  'binding.hostSetupId',
  'binding.executionHostId',
  'binding.repository.host',
  'binding.repository.id',
  'binding.repository.nodeId',
  'binding.repository.owner',
  'binding.repository.name',
  'binding.prNumber',
  'bindingRevision',
  'selectionRevision',
  'grantRevision',
  'sessionIncarnation'
]

describe('#169 composition identity and predecessor fence integration', () => {
  it.each(IDENTITY_PATHS)(
    'rejects post-await %s replacement even without lifecycle notification',
    async (path) => {
      const f = await setup()
      f.readProjection.mockImplementation(async () => {
        const changed = structuredClone(f.getCurrent())
        const keys = path.split('.')
        let parent = changed as unknown as Record<string, unknown>
        for (const key of keys.slice(0, -1)) {
          parent = parent[key] as Record<string, unknown>
        }
        const key = keys.at(-1)!
        parent[key] =
          typeof parent[key] === 'number' ? parent[key] + 1 : `${String(parent[key])}-replacement`
        f.setCurrent(changed)
        return ready()
      })
      expect((await f.run()).status).not.toBe('delivered')
      expect(f.send).not.toHaveBeenCalled()
    }
  )

  it.each(['head', 'repository', 'pr', 'selection', 'old', 'future', 'version'] as const)(
    'keeps Task B %s evidence validation inside the real registry operation',
    async (field) => {
      const f = await setup()
      f.readEvidence.mockImplementation(async () => {
        const value = head(f.getCurrent())
        if (field === 'head') {
          value.headSha = 'not-a-sha'
        }
        if (field === 'repository') {
          value.binding.repository.nodeId = 'OTHER'
        }
        if (field === 'pr') {
          value.binding.prNumber += 1
        }
        if (field === 'selection') {
          value.selectionRevision += 1
        }
        if (field === 'old') {
          value.observedAtMs = NOW - 300_001
        }
        if (field === 'future') {
          value.observedAtMs = NOW + 1
        }
        if (field === 'version') {
          value.version = 2 as never
        }
        return value
      })
      expect((await f.run()).status).not.toBe('delivered')
      expect(f.readProjection).not.toHaveBeenCalled()
      expect(f.send).not.toHaveBeenCalled()
    }
  )

  it('returns incomplete for unavailable projection and keeps missing Checks unknown', async () => {
    const unavailable = await setup()
    unavailable.readProjection.mockResolvedValue({ status: 'unavailable', error: 'private' })
    expect(await unavailable.run()).toEqual({ status: 'incomplete' })
    expect(unavailable.send).not.toHaveBeenCalled()
    const f = await setup()
    f.readProjection.mockImplementation(async () => ({
      ...ready(),
      snapshot: {
        ...ready().snapshot,
        bindingRevision: f.getCurrent().bindingRevision,
        facts: ready().snapshot.facts.filter((fact) => fact.kind !== 'check_run')
      }
    }))
    expect(await f.run()).toEqual({ status: 'delivered' })
    expect(f.send.mock.calls[0][0]).toMatchObject({
      headSha: HEAD,
      snapshot: {
        attestation: 'not_verified_by_projection',
        agentExecution: 'unknown',
        taskCompletion: 'unknown'
      }
    })
    expect(
      f.send.mock.calls[0][0].snapshot.facts.some((fact: GitHubFact) => fact.kind === 'check_run')
    ).toBe(false)
  })

  it('treats offline readiness as a preflight, never current-principal or grant authority', async () => {
    const f = await setup()
    f.readCurrent.mockReturnValue(null as never)
    expect(f.composition.readiness()).toEqual({ status: 'offline_ready' })
    expect(await f.run()).toEqual({ status: 'denied' })
    expect(f.readProjection).not.toHaveBeenCalled()
    const revoked = await setup()
    revoked.registry.retireAll()
    expect(revoked.composition.readiness()).toEqual({ status: 'offline_ready' })
    expect(await revoked.run()).toEqual({ status: 'denied' })
  })

  it('does not publish a late old result after a newer grant delivers', async () => {
    const f = await setup()
    const pending = deferred<unknown>()
    const entered = deferred<boolean>()
    f.readProjection.mockImplementationOnce(async () => {
      entered.resolve(true)
      return pending.promise
    })
    const old = f.run()
    await entered.promise
    f.change('worktree')
    expect((await old).status).not.toBe('delivered')
    f.registry.select(f.getCurrent().document, f.getCurrent().binding)
    await f.registry.requestGrant(() => f.getCurrent().document)
    expect(await f.run()).toEqual({ status: 'delivered' })
    pending.resolve(ready())
    await new Promise((resolve) => setImmediate(resolve))
    expect(f.send).toHaveBeenCalledOnce()
  })
})
