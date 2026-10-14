import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from './db'

describe('Project Map source limitations of committed orchestration records', () => {
  const databases: OrchestrationDb[] = []
  const directories: string[] = []

  afterEach(() => {
    vi.useRealTimers()
    for (const database of databases.splice(0)) {
      database.close()
    }
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  function createDatabase(path = ':memory:'): OrchestrationDb {
    const database = new OrchestrationDb(path)
    databases.push(database)
    return database
  }

  function createPair(): [OrchestrationDb, OrchestrationDb] {
    const directory = mkdtempSync(join(tmpdir(), 'orca-project-source-facts-'))
    directories.push(directory)
    const path = join(directory, 'orchestration.db')
    return [createDatabase(path), createDatabase(path)]
  }

  it('does not expose a returned nested completion to a reader when the outer writer rolls back', () => {
    const [writer, reader] = createPair()
    const task = writer.createTask({ runId: 'run_legacy_local', spec: 'rollback boundary' })

    writer.db.exec('BEGIN IMMEDIATE')
    try {
      expect(writer.updateTaskStatus(task.id, 'completed')?.status).toBe('completed')
      expect(writer.db.isTransaction).toBe(true)
      expect(reader.getTask(task.id)?.status).toBe('ready')
    } finally {
      writer.db.exec('ROLLBACK')
    }

    expect(writer.getTask(task.id)).toMatchObject({ status: 'ready', completed_at: null })
    expect(reader.getTask(task.id)).toMatchObject({ status: 'ready', completed_at: null })
  })

  it('makes a nested completion visible to another connection only after outer commit', () => {
    const [writer, reader] = createPair()
    const task = writer.createTask({ runId: 'run_legacy_local', spec: 'commit boundary' })

    writer.db.exec('BEGIN IMMEDIATE')
    try {
      writer.updateTaskStatus(task.id, 'completed')
      expect(reader.getTask(task.id)?.status).toBe('ready')
      writer.db.exec('COMMIT')
    } finally {
      if (writer.db.isTransaction) {
        writer.db.exec('ROLLBACK')
      }
    }

    expect(reader.getTask(task.id)?.status).toBe('completed')
  })

  it('distinguishes a status no-op from a same-status result write without inventing a completion', () => {
    const database = createDatabase()
    const task = database.createTask({ runId: 'run_legacy_local', spec: 'same-status writes' })
    database.updateTaskStatus(task.id, 'completed')
    database.db.exec(`
      CREATE TEMP TABLE task_write_probe (task_id TEXT);
      CREATE TEMP TRIGGER observe_task_write AFTER UPDATE ON tasks
      BEGIN
        INSERT INTO task_write_probe (task_id) VALUES (NEW.id);
      END;
    `)
    const writes = (): unknown =>
      database.db.prepare('SELECT COUNT(*) AS count FROM task_write_probe').get()

    database.updateTaskStatus(task.id, 'completed')
    expect(writes()).toEqual({ count: 0 })

    database.updateTaskStatus(task.id, 'completed', 'result correction')
    expect(writes()).toEqual({ count: 1 })
    expect(database.getTask(task.id)).toMatchObject({
      status: 'completed',
      result: 'result correction'
    })
  })

  it('cannot distinguish completion replay from reopen and recompletion using the Task projection', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const database = createDatabase()
    const task = database.createTask({ runId: 'run_legacy_local', spec: 'mutable projection' })
    const firstCompletion = database.updateTaskStatus(task.id, 'completed')

    database.updateTaskStatus(task.id, 'ready')
    const secondCompletion = database.updateTaskStatus(task.id, 'completed')

    expect(secondCompletion).toEqual(firstCompletion)
    expect(database.listTasks({ runId: task.run_id })).toEqual([secondCompletion])
  })

  it('retains Task membership while rebinding a coordinator without establishing Project scope', () => {
    const database = createDatabase()
    const run = database.createRun({
      objective: 'coordinator ownership is not project identity',
      coordinatorHandle: 'term_first',
      coordinatorPaneKey: 'tab_first:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    })
    const task = database.createTask({ runId: run.id, spec: 'retained task' })

    const rebound = database.bindRun({
      runId: run.id,
      coordinatorHandle: 'term_second',
      coordinatorPaneKey: 'tab_second:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    })

    expect(rebound).toMatchObject({
      id: run.id,
      coordinator_handle: 'term_second',
      consumer_generation: run.consumer_generation + 1
    })
    expect(database.getTask(task.id)).toEqual(task)
    const columns = database.db.prepare('PRAGMA table_info(runs)').all() as { name: string }[]
    for (const name of [
      'project_id',
      'project_host_setup_id',
      'repository_id',
      'worktree_id',
      'execution_host_id'
    ]) {
      expect(columns.map((column) => column.name)).not.toContain(name)
    }
  })
})
