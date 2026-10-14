import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../../../orca-runtime'
import { OrchestrationDb } from '../../../../orchestration/db'
import { createRootDispatch } from '../../../../orchestration/db/root-dispatch-test-fixture'
import { ORCHESTRATION_RUN_METHODS } from './runs'

describe('Run creation Project authority boundary (#136)', () => {
  const databases: OrchestrationDb[] = []
  const pane = { tabId: 'tab-coordinator', leafId: '11111111-1111-4111-8111-111111111111' }

  afterEach(() => {
    vi.restoreAllMocks()
    for (const db of databases.splice(0)) {
      db.close()
    }
  })

  function setup(
    worktreeId = 'repository::checkout',
    connectionId: string | null = null,
    isWsl = false
  ) {
    const db = new OrchestrationDb(':memory:')
    databases.push(db)
    const runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
    const handle = runtime.preAllocateHandleForPty('pty-coordinator')
    runtime.registerPty(
      'pty-coordinator',
      worktreeId,
      connectionId,
      {
        ...pane,
        incarnationId: 'process-first'
      },
      isWsl
    )
    return { db, runtime, handle }
  }

  async function call(runtime: OrcaRuntimeService, name: string, params: Record<string, unknown>) {
    const method = ORCHESTRATION_RUN_METHODS.find((entry) => entry.name === name)!
    return (await method.handler(method.params!.parse(params), { runtime })) as {
      run: { id: string; consumer_generation: number }
    }
  }

  it.each([
    {
      name: 'native routing',
      worktree: 'repository::checkout',
      connection: null,
      wsl: false,
      host: { kind: 'local', hostId: 'local' }
    },
    {
      name: 'SSH execution',
      worktree: 'repository::checkout',
      connection: 'remote',
      wsl: false,
      host: { kind: 'ssh', targetId: 'remote' }
    },
    {
      name: 'WSL without distro proof',
      worktree: 'repository::checkout',
      connection: null,
      wsl: true,
      host: null
    },
    {
      name: 'folder workspace',
      worktree: 'folder:folder-one',
      connection: null,
      wsl: false,
      host: { kind: 'local', hostId: 'local' }
    },
    {
      name: 'floating workspace',
      worktree: '',
      connection: null,
      wsl: false,
      host: { kind: 'local', hostId: 'local' }
    }
  ])(
    'accepts an unbound Run for $name without converting launch routing into Project identity',
    async ({ worktree, connection, wsl, host }) => {
      const { db, runtime, handle } = setup(worktree, connection, wsl)
      const authority = runtime.getOrchestrationDispatchAuthority(handle)
      if (host) {
        expect(authority).toMatchObject({
          worktreeId: worktree,
          processIncarnation: 'pty-coordinator:process-first',
          runtimeId: runtime.getRuntimeId(),
          hostScope: host
        })
      } else {
        expect(authority).toBeNull()
      }

      const created = await call(runtime, 'orchestration.runCreate', {
        objective: 'coordinate without source authority',
        from: handle,
        projectId: 'forged-project',
        projectHostSetupId: 'forged-setup',
        repositoryId: 'forged-repository',
        executionRealm: 'native',
        ownershipRevision: 100,
        sourceBinding: { status: 'PROVEN' }
      })
      expect(db.getRun(created.run.id)).toEqual({
        id: created.run.id,
        objective: 'coordinate without source authority',
        home_database: 'this_database',
        coordinator_handle: handle,
        coordinator_pane_key: `${pane.tabId}:${pane.leafId}`,
        consumer_generation: 1,
        legacy: 0,
        created_at: expect.any(String),
        updated_at: expect.any(String)
      })
      expect(created.run).not.toHaveProperty('sourceBinding')
      const task = db.createTask({ runId: created.run.id, spec: 'unbound Runs remain usable' })
      expect(db.updateTaskStatus(task.id, 'completed')?.status).toBe('completed')
    }
  )

  it('does not turn a pane reused by another workspace and process into ownership of retained Tasks', async () => {
    const { db, runtime, handle } = setup('repo-a::checkout-a')
    const created = await call(runtime, 'orchestration.runCreate', {
      objective: 'retain work',
      from: handle
    })
    const task = db.createTask({ runId: created.run.id, spec: 'work from first coordinator' })
    const worker = runtime.preAllocateHandleForPty('pty-worker')
    runtime.registerPty('pty-worker', 'repo-b::checkout-b', 'host-b', {
      tabId: 'tab-worker',
      leafId: '22222222-2222-4222-8222-222222222222',
      incarnationId: 'worker-first'
    })
    const dispatch = createRootDispatch(db, task.id, worker)
    expect(runtime.getOrchestrationDispatchAuthority(worker)).toMatchObject({
      worktreeId: 'repo-b::checkout-b',
      hostScope: { kind: 'ssh', targetId: 'host-b' }
    })

    runtime.registerPty('pty-coordinator', 'repo-c::checkout-c', null, {
      ...pane,
      incarnationId: 'process-replacement'
    })
    const replacement = runtime.preAllocateHandleForPty('pty-coordinator')
    expect(runtime.getTerminalProcessIncarnation(replacement)).toBe(
      'pty-coordinator:process-replacement'
    )
    const rebound = await call(runtime, 'orchestration.runUse', {
      id: created.run.id,
      from: replacement
    })

    expect(rebound.run.consumer_generation).toBe(2)
    expect(db.getTask(task.id)?.run_id).toBe(created.run.id)
    expect(db.getDispatchContextById(dispatch.id)?.run_id).toBe(created.run.id)
    expect(db.getRun(created.run.id)).not.toHaveProperty('project_id')
  })

  it('does not publish Run success effects when the final creation transaction fails', async () => {
    const { db, runtime, handle } = setup()
    const prior = await call(runtime, 'orchestration.runCreate', {
      objective: 'prior',
      from: handle
    })
    const cancel = vi.spyOn(runtime, 'cancelMessageWaiters')
    db.db.exec(`CREATE TEMP TRIGGER reject_run_coordinator BEFORE INSERT ON run_coordinator_handles
      BEGIN SELECT RAISE(ABORT, 'coordinator receipt failure'); END;`)

    await expect(
      call(runtime, 'orchestration.runCreate', { objective: 'rollback', from: handle })
    ).rejects.toThrow('coordinator receipt failure')
    expect(cancel).not.toHaveBeenCalled()
    expect(db.getCurrentRunForPane(`${pane.tabId}:${pane.leafId}`)?.id).toBe(prior.run.id)
    expect(db.listRuns().runs.filter((run) => run.legacy === 0)).toHaveLength(1)
  })

  it('does not derive a runtime namespace or Project binding for a retained Run after runtime replacement', async () => {
    const { db, runtime, handle } = setup()
    const created = await call(runtime, 'orchestration.runCreate', {
      objective: 'survive runtime replacement',
      from: handle
    })
    const retained = db.getRun(created.run.id)
    const replacement = new OrcaRuntimeService()
    replacement.setOrchestrationDb(db)
    const nextHandle = replacement.preAllocateHandleForPty('pty-restored')
    replacement.registerPty('pty-restored', 'other-repository::checkout', null, {
      ...pane,
      incarnationId: 'restored-process'
    })

    expect(replacement.getRuntimeId()).not.toBe(runtime.getRuntimeId())
    expect(await call(replacement, 'orchestration.runCurrent', { from: nextHandle })).toMatchObject(
      {
        run: { id: created.run.id }
      }
    )
    expect(db.getRun(created.run.id)).toEqual(retained)
    expect(retained).not.toHaveProperty('runtime_id')
    expect(retained).not.toHaveProperty('project_id')
  })
})
