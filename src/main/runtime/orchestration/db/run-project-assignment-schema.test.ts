import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from '../db'
import { RunProjectAssignmentLedger } from './run-project-assignment-ledger'
import { installRunProjectAssignmentSchema } from './run-project-assignment-schema'

describe('assignment schema integrity and restart', () => {
  const databases = new Set<OrchestrationDb>()
  const directories: string[] = []
  afterEach(() => {
    for (const db of databases) {
      db.close()
    }
    databases.clear()
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  function open(path = ':memory:') {
    const db = new OrchestrationDb(path)
    databases.add(db)
    return db
  }
  function command(db: OrchestrationDb) {
    return {
      requestId: 'request',
      runId: db.createRun({
        objective: 'private',
        coordinatorHandle: 'term',
        coordinatorPaneKey: 'pane'
      }).id,
      projectId: 'project',
      action: 'assign' as const,
      applicationSessionId: 'session',
      expectedRevision: 0
    }
  }

  it.each(['sequence', 'request_id', 'run_revision'])(
    'rejects INSERT OR REPLACE conflicts on %s without deleting history',
    (conflict) => {
      const db = open()
      installRunProjectAssignmentSchema(db.db)
      db.db.pragma('recursive_triggers = OFF')
      const ledger = new RunProjectAssignmentLedger(db.db)
      const input = command(db)
      const first = ledger.append(input)
      expect(() =>
        db.db
          .prepare(`INSERT OR REPLACE INTO run_project_assignment_log
            (sequence, request_id, run_id, project_id, action, application_session_id,
             revision, supersedes_revision) VALUES (?, ?, ?, ?, 'assign', 'session', ?, ?)`)
          .run(
            conflict === 'sequence' ? first.sequence : first.sequence + 1,
            conflict === 'request_id' ? input.requestId : 'different-request',
            input.runId,
            'replacement-project',
            conflict === 'run_revision' ? 1 : 2,
            conflict === 'run_revision' ? 0 : 1
          )
      ).toThrow(/append-only/)
      expect(ledger.history({ runId: input.runId, limit: 100 })).toEqual([first])
    }
  )

  it('survives closing every connection and reopening without backfilling existing Runs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-assignment-restart-'))
    directories.push(directory)
    const path = join(directory, 'orchestration.db')
    const original = open(path)
    const input = command(original)
    const unassigned = command(original)
    const version = original.db.pragma('user_version', { simple: true })
    installRunProjectAssignmentSchema(original.db)
    const receipt = new RunProjectAssignmentLedger(original.db).append(input)
    original.close()
    databases.delete(original)

    const reopened = open(path)
    const ledger = new RunProjectAssignmentLedger(reopened.db)
    expect(ledger.current(input.runId)).toEqual(receipt)
    expect(ledger.append(input)).toEqual(receipt)
    expect(ledger.current(unassigned.runId)).toBeUndefined()
    expect(ledger.current('run_legacy_local')).toBeUndefined()
    expect(reopened.db.pragma('user_version', { simple: true })).toBe(version)
    expect(reopened.getRun(input.runId)).not.toHaveProperty('project_id')
    const next = ledger.append({ ...input, requestId: 'after-restart', expectedRevision: 1 })
    expect(next.revision).toBe(2)
    expect(next.sequence).toBeGreaterThan(receipt.sequence)
  })
})
