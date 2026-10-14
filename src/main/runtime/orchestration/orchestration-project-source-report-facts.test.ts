import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from './db'
import { createRootDispatch } from './db/root-dispatch-test-fixture'

describe('existing accepted worker-report facts as a Project Map source candidate', () => {
  const databases: OrchestrationDb[] = []
  const directories: string[] = []

  afterEach(() => {
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

  function reportFixture(database: OrchestrationDb) {
    const task = database.createTask({ runId: 'run_legacy_local', spec: 'private task spec' })
    const dispatch = createRootDispatch(database, task.id, 'term_worker')
    return {
      task,
      dispatch,
      report: {
        taskId: task.id,
        dispatchId: dispatch.id,
        outcome: 'succeeded' as const,
        result: 'private worker assertion, not verified execution evidence',
        observation: {
          id: 'report_first',
          authorityId: 'synthetic-worker-report-observer',
          homeReceivedAt: 1
        }
      }
    }
  }

  it.each(['COMMIT', 'ROLLBACK'] as const)(
    'keeps the minimal accepted report fact atomic with Task state through outer %s',
    (finish) => {
      const directory = mkdtempSync(join(tmpdir(), 'orca-project-report-facts-'))
      directories.push(directory)
      const path = join(directory, 'orchestration.db')
      const writer = createDatabase(path)
      const reader = createDatabase(path)
      const { task, dispatch, report } = reportFixture(writer)

      writer.db.exec('BEGIN IMMEDIATE')
      try {
        expect(writer.settleWorkerReport(report)).toMatchObject({
          action: 'settled',
          duplicate: false
        })
        expect(writer.db.isTransaction).toBe(true)
        const facts = writer.getAttemptObservationFacts(dispatch.id)
        expect(facts).toHaveLength(1)
        expect(facts[0]).toMatchObject({
          taskId: task.id,
          authorityClock: 'home',
          facet: 'worker_report',
          payload: { status: 'accepted', outcome: 'succeeded', reportId: 'report_first' }
        })
        expect(JSON.stringify(facts)).not.toContain(report.result)
        expect(JSON.stringify(facts)).not.toContain(task.spec)
        expect(reader.getAttemptObservationFacts(dispatch.id)).toEqual([])
        expect(reader.getTask(task.id)?.status).toBe('dispatched')
        writer.db.exec(finish)
      } finally {
        if (writer.db.isTransaction) {
          writer.db.exec('ROLLBACK')
        }
      }

      expect(reader.getAttemptObservationFacts(dispatch.id)).toHaveLength(
        finish === 'COMMIT' ? 1 : 0
      )
      expect(reader.getTask(task.id)?.status).toBe(finish === 'COMMIT' ? 'completed' : 'dispatched')
    }
  )

  it('deduplicates identical observation IDs but accepts a new report fact for an already completed Task', () => {
    const database = createDatabase()
    const { task, dispatch, report } = reportFixture(database)
    database.settleWorkerReport(report)
    const completedTask = database.getTask(task.id)

    expect(database.settleWorkerReport(report)).toMatchObject({ duplicate: true })
    expect(database.getAttemptObservationFacts(dispatch.id)).toHaveLength(1)
    expect(
      database.settleWorkerReport({
        ...report,
        observation: { ...report.observation, id: 'report_second', homeReceivedAt: 2 }
      })
    ).toMatchObject({ duplicate: true })

    expect(database.getAttemptObservationFacts(dispatch.id).map((fact) => fact.sequence)).toEqual([
      0, 1
    ])
    expect(database.getTask(task.id)).toEqual(completedTask)
  })

  it('rejects conflicting replay of an accepted report observation without changing committed state', () => {
    const database = createDatabase()
    const { task, dispatch, report } = reportFixture(database)
    database.settleWorkerReport(report)
    const completedTask = database.getTask(task.id)
    const facts = database.getAttemptObservationFacts(dispatch.id)

    expect(() =>
      database.settleWorkerReport({
        ...report,
        observation: { ...report.observation, authorityId: 'different-observer' }
      })
    ).toThrowError(expect.objectContaining({ code: 'observation_replay_conflict' }))

    expect(database.getAttemptObservationFacts(dispatch.id)).toEqual(facts)
    expect(database.getTask(task.id)).toEqual(completedTask)
    expect(database.db.isTransaction).toBe(false)
  })

  it('records no accepted-report fact for a direct task status update', () => {
    const database = createDatabase()
    const { task, dispatch } = reportFixture(database)

    database.updateTaskStatus(task.id, 'completed', 'manual status assertion')

    expect(database.getTask(task.id)?.status).toBe('completed')
    expect(database.getAttemptObservationFacts(dispatch.id)).toEqual([])
  })
})
