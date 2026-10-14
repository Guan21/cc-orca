import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from './db'
import { SCHEMA_VERSION } from './db/contract-constants'

describe('Run creation final transaction without Project authority', () => {
  const databases: OrchestrationDb[] = []
  const directories: string[] = []
  const params = {
    objective: 'creation boundary',
    coordinatorHandle: 'term_coordinator',
    coordinatorPaneKey: 'tab-coordinator:11111111-1111-4111-8111-111111111111'
  }

  afterEach(() => {
    vi.restoreAllMocks()
    for (const db of databases.splice(0)) {
      db.close()
    }
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  function open(path: string): OrchestrationDb {
    const db = new OrchestrationDb(path)
    databases.push(db)
    return db
  }

  function pair() {
    const directory = mkdtempSync(join(tmpdir(), 'orca-run-creation-'))
    directories.push(directory)
    const path = join(directory, 'orchestration.db')
    return { writer: open(path), reader: open(path), path }
  }

  it('keeps both the new Run and coordinator routing invisible until final COMMIT', () => {
    const { writer, reader } = pair()
    const prior = writer.createRun(params)
    const remember = writer.rememberRunCoordinatorHandle.bind(writer)
    let observed = false
    vi.spyOn(writer, 'rememberRunCoordinatorHandle').mockImplementation((id, handle) => {
      remember(id, handle)
      observed = true
      expect(writer.db.isTransaction).toBe(true)
      expect(writer.getRun(id)).toBeDefined()
      expect(reader.getRun(id)).toBeUndefined()
      expect(reader.getCurrentRunForPane(params.coordinatorPaneKey)?.id).toBe(prior.id)
      expect(
        reader.db.prepare('SELECT 1 FROM run_coordinator_handles WHERE run_id = ?').get(id)
      ).toBeUndefined()
    })

    const created = writer.createRun(params)
    expect(observed).toBe(true)
    expect(writer.db.isTransaction).toBe(false)
    expect(reader.getRun(created.id)).toEqual(created)
    expect(reader.getCurrentRunForPane(params.coordinatorPaneKey)?.id).toBe(created.id)
    expect(reader.getRun(prior.id)?.coordinator_pane_key).toBeNull()
    expect(
      reader.db
        .prepare('SELECT terminal_handle FROM run_coordinator_handles WHERE run_id = ?')
        .get(created.id)
    ).toEqual({ terminal_handle: params.coordinatorHandle })
  })

  it('rolls back prior consumer fencing, Run insertion and routing together on a late SQL failure', () => {
    const { writer, reader } = pair()
    const prior = writer.createRun(params)
    const before = reader.listRuns()
    writer.db.exec(`CREATE TEMP TRIGGER reject_coordinator BEFORE INSERT ON run_coordinator_handles
      BEGIN SELECT RAISE(ABORT, 'late creation failure'); END;`)

    expect(() => writer.createRun(params)).toThrow('late creation failure')
    expect(writer.db.isTransaction).toBe(false)
    expect(reader.listRuns()).toEqual(before)
    expect(reader.getRun(prior.id)).toEqual(prior)
    expect(writer.getRun(prior.id)).toEqual(prior)
    expect(reader.getCurrentRunForPane(params.coordinatorPaneKey)?.id).toBe(prior.id)
    expect(
      reader.db.prepare('SELECT COUNT(*) AS count FROM run_coordinator_handles').get()
    ).toEqual({ count: 1 })
  })

  it('refuses nesting rather than returning a Run from a releasable savepoint', () => {
    const { writer, reader } = pair()
    writer.db.exec('BEGIN IMMEDIATE')
    try {
      expect(() => writer.createRun(params)).toThrow(/transaction/i)
      expect(writer.db.isTransaction).toBe(true)
      expect(reader.listRuns().runs.filter((run) => run.legacy === 0)).toEqual([])
    } finally {
      writer.db.exec('ROLLBACK')
    }
  })

  it('reopens current work and adopts legacy work without schema changes or inferred source fields', () => {
    const { writer, path } = pair()
    const run = writer.createRun(params)
    const task = writer.createTask({ runId: run.id, spec: 'retained current task' })
    const legacy = writer.createTask({ runId: 'run_legacy_local', spec: 'retained legacy task' })
    const schema = writer.db
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
    const reopened = open(path)

    expect(reopened.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    expect(
      reopened.db
        .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
    ).toEqual(schema)
    expect(reopened.getRun(run.id)).toEqual(run)
    expect(reopened.getRun('run_legacy_local')?.legacy).toBe(1)
    expect(reopened.getTask(task.id)).toEqual(task)
    const adopted = reopened.getLegacyAdoption()!
    expect(adopted.adopted_run_id).toEqual(expect.any(String))
    expect(reopened.getTask(legacy.id)).toEqual({ ...legacy, run_id: adopted.adopted_run_id })
    expect(reopened.getRun(adopted.adopted_run_id)).not.toHaveProperty('project_id')
    expect(reopened.updateTaskStatus(task.id, 'completed')?.status).toBe('completed')
    expect(reopened.updateTaskStatus(legacy.id, 'completed')?.status).toBe('completed')
    expect(reopened.getRun(run.id)).not.toHaveProperty('project_id')
    expect(open(path).getLegacyAdoption()).toEqual(adopted)
  })
})
