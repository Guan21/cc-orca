import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from '../db'
import { RunProjectAssignmentLedger } from './run-project-assignment-ledger'
import { installRunProjectAssignmentSchema } from './run-project-assignment-schema'

describe('inert user-declared Run assignment storage', () => {
  const databases: OrchestrationDb[] = []
  const directories: string[] = []
  afterEach(() => {
    vi.restoreAllMocks()
    for (const db of databases.splice(0)) {
      db.close()
    }
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  function open(path = ':memory:') {
    const db = new OrchestrationDb(path)
    databases.push(db)
    return db
  }
  function fixture() {
    const directory = mkdtempSync(join(tmpdir(), 'orca-assignment-'))
    directories.push(directory)
    const path = join(directory, 'orchestration.db')
    const writer = open(path)
    const version = writer.db.pragma('user_version', { simple: true })
    installRunProjectAssignmentSchema(writer.db)
    const reader = open(path)
    const run = writer.createRun({
      objective: 'private objective',
      coordinatorHandle: 'term',
      coordinatorPaneKey: 'pane'
    })
    const command = {
      requestId: 'request-1',
      runId: run.id,
      projectId: 'project-a',
      action: 'assign' as const,
      applicationSessionId: 'session-a',
      expectedRevision: 0
    }
    return {
      path,
      writer,
      reader,
      version,
      run,
      command,
      ledger: new RunProjectAssignmentLedger(writer.db),
      observed: new RunProjectAssignmentLedger(reader.db)
    }
  }

  it('does not install storage through normal database construction', () => {
    const db = open()
    expect(
      db.db
        .prepare("SELECT name FROM sqlite_master WHERE name = 'run_project_assignment_log'")
        .get()
    ).toBeUndefined()
    new RunProjectAssignmentLedger(db.db)
    expect(
      db.db
        .prepare("SELECT name FROM sqlite_master WHERE name = 'run_project_assignment_log'")
        .get()
    ).toBeUndefined()
  })

  it('persists append-only declarations, revocation and ABA revisions without activity authority', () => {
    const { ledger, command, writer, version, path } = fixture()
    const first = ledger.append(command)
    const second = ledger.append({
      ...command,
      requestId: 'request-2',
      projectId: 'project-b',
      expectedRevision: 1
    })
    const third = ledger.append({ ...command, requestId: 'request-3', expectedRevision: 2 })
    const revoked = ledger.append({
      ...command,
      requestId: 'request-4',
      action: 'revoke',
      expectedRevision: 3
    })
    expect([first.revision, second.revision, third.revision, revoked.revision]).toEqual([
      1, 2, 3, 4
    ])
    expect(first.sequence).toBeLessThan(second.sequence)
    expect(second.sequence).toBeLessThan(third.sequence)
    expect(revoked).toMatchObject({
      action: 'revoke',
      provenance: 'user_declared',
      supersedesRevision: 3,
      schemaVersion: 1
    })
    expect(ledger.append(command)).toEqual(first)
    expect(ledger.current(command.runId)).toEqual(revoked)
    expect(new RunProjectAssignmentLedger(open(path).db).current(command.runId)).toEqual(revoked)
    expect(writer.db.pragma('user_version', { simple: true })).toBe(version)
    expect(writer.getRun(command.runId)).not.toHaveProperty('project_id')
    expect(() => writer.db.exec('DELETE FROM run_project_assignment_log')).toThrow(/append-only/)
    expect(() =>
      writer.db.exec("UPDATE run_project_assignment_log SET project_id = 'forged'")
    ).toThrow(/append-only/)
  })

  it('replays only content-identical requests and rejects stale or conflicting writes', () => {
    const { ledger, command } = fixture()
    const first = ledger.append(command)
    expect(ledger.append(command)).toEqual(first)
    for (const change of [
      { projectId: 'other' },
      { applicationSessionId: 'other' },
      { expectedRevision: 1 },
      { action: 'revoke' as const }
    ]) {
      expect(() => ledger.append({ ...command, ...change })).toThrow(/request/i)
    }
    expect(() => ledger.append({ ...command, requestId: 'stale' })).toThrow(/revision/i)
    expect(() =>
      ledger.append({
        ...command,
        requestId: 'wrong-project',
        action: 'revoke',
        projectId: 'other',
        expectedRevision: 1
      })
    ).toThrow(/current assignment/i)
    expect(ledger.history({ runId: command.runId, limit: 100 })).toEqual([first])
  })

  it('checks local existing Runs in the same database without granting catalog authority', () => {
    const { writer, ledger, command } = fixture()
    expect(() => ledger.append({ ...command, runId: 'absent' })).toThrow(/Run/)
    expect(() => ledger.append({ ...command, runId: 'run_legacy_local' })).toThrow(/Run/)
    writer.db.prepare("UPDATE runs SET home_database = 'foreign' WHERE id = ?").run(command.runId)
    expect(() => ledger.append(command)).toThrow(/Run/)
    writer.db
      .prepare("UPDATE runs SET home_database = 'this_database' WHERE id = ?")
      .run(command.runId)
    expect(ledger.append(command).projectId).toBe('project-a')
    // Catalog absence/deletion is deliberately not SQLite authority; consumers must revalidate it.
    expect(ledger.current(command.runId)?.provenance).toBe('user_declared')
  })

  it('keeps changes invisible until final commit and rolls back a failed commit', () => {
    const { writer, ledger, observed, command } = fixture()
    const exec = writer.db.exec.bind(writer.db)
    let sawCommit = false
    vi.spyOn(writer.db, 'exec').mockImplementation((sql) => {
      if (sql === 'COMMIT') {
        sawCommit = true
        expect(observed.current(command.runId)).toBeUndefined()
        throw new Error('commit failed')
      }
      exec(sql)
    })
    expect(() => ledger.append(command)).toThrow('commit failed')
    expect(sawCommit).toBe(true)
    expect(writer.db.isTransaction).toBe(false)
    expect(observed.current(command.runId)).toBeUndefined()
    vi.restoreAllMocks()
    expect(observed.current(command.runId)).toBeUndefined()
    expect(ledger.append(command)).toEqual(observed.current(command.runId))
  })

  it('serializes two writers with CAS and refuses enclosing transactions', () => {
    const { writer, ledger, observed, command } = fixture()
    ledger.append(command)
    expect(() => observed.append({ ...command, requestId: 'competing' })).toThrow(/revision/i)
    writer.db.exec('BEGIN IMMEDIATE')
    try {
      expect(() => ledger.append({ ...command, requestId: 'nested', expectedRevision: 1 })).toThrow(
        /transaction/i
      )
      expect(writer.db.isTransaction).toBe(true)
    } finally {
      writer.db.exec('ROLLBACK')
    }
  })

  it('retains the previous declaration after a SQL abort and leaves failed request IDs reusable', () => {
    const { writer, ledger, observed, command } = fixture()
    const previous = ledger.append(command)
    writer.db
      .exec(`CREATE TEMP TRIGGER reject_assignment BEFORE INSERT ON run_project_assignment_log
      BEGIN SELECT RAISE(ABORT, 'assignment insert failed'); END;`)
    const next = { ...command, requestId: 'retry', projectId: 'project-b', expectedRevision: 1 }
    expect(() => ledger.append(next)).toThrow('assignment insert failed')
    expect(writer.db.isTransaction).toBe(false)
    expect(observed.current(command.runId)).toEqual(previous)
    writer.db.exec('DROP TRIGGER reject_assignment')
    expect(ledger.append(next).revision).toBe(2)
    expect(ledger.history({ runId: command.runId, limit: 100 })).toHaveLength(2)
  })

  it('keeps explicit schema installation idempotent and rejects nested migration', () => {
    const { writer, ledger, command, version } = fixture()
    const previous = ledger.append(command)
    installRunProjectAssignmentSchema(writer.db)
    expect(ledger.current(command.runId)).toEqual(previous)
    expect(writer.db.pragma('user_version', { simple: true })).toBe(version)
    writer.db.exec('BEGIN IMMEDIATE')
    try {
      expect(() => installRunProjectAssignmentSchema(writer.db)).toThrow(/transaction/i)
      expect(writer.db.isTransaction).toBe(true)
    } finally {
      writer.db.exec('ROLLBACK')
    }
  })

  it('rejects deleted Runs while retaining their declarations as history', () => {
    const { writer, ledger, command } = fixture()
    const previous = ledger.append(command)
    writer.db.prepare('DELETE FROM runs WHERE id = ?').run(command.runId)
    expect(() => ledger.append({ ...command, requestId: 'deleted', expectedRevision: 1 })).toThrow(
      /Run/
    )
    expect(() => ledger.append(command)).toThrow(/Run/)
    expect(ledger.history({ runId: command.runId, limit: 100 })).toEqual([previous])
  })

  it('rejects an overlapping writer then rechecks CAS on retry after lock release', () => {
    const { writer, reader, ledger, observed, command } = fixture()
    ledger.append(command)
    reader.db.pragma('busy_timeout = 1')
    writer.db.exec('BEGIN IMMEDIATE')
    try {
      expect(() => observed.append({ ...command, requestId: 'locked' })).toThrow(/locked|busy/i)
      expect(reader.db.isTransaction).toBe(false)
    } finally {
      writer.db.exec('COMMIT')
    }
    expect(() => observed.append({ ...command, requestId: 'locked' })).toThrow(/revision/i)
    expect(observed.append({ ...command, requestId: 'locked', expectedRevision: 1 }).revision).toBe(
      2
    )
  })

  it('bounds and scopes history by Run and sequence without leaking Run contents', () => {
    const { writer, ledger, command } = fixture()
    const first = ledger.append(command)
    const other = writer.createRun({
      objective: 'secret',
      coordinatorHandle: 'other',
      coordinatorPaneKey: 'other'
    })
    ledger.append({ ...command, runId: other.id, requestId: 'other' })
    const second = ledger.append({ ...command, requestId: 'second', expectedRevision: 1 })
    expect(ledger.history({ runId: command.runId, limit: 1 })).toEqual([first])
    expect(
      ledger.history({ runId: command.runId, afterSequence: first.sequence, limit: 1 })
    ).toEqual([second])
    expect(JSON.stringify(ledger.history({ runId: command.runId, limit: 100 }))).not.toMatch(
      /objective|secret|private objective/
    )
    for (const limit of [0, -1, 101, Number.NaN, 1.5]) {
      expect(() => ledger.history({ runId: command.runId, limit })).toThrow(/limit/i)
    }
    for (const expectedRevision of [-1, Number.NaN, 1.5]) {
      expect(() => ledger.append({ ...command, expectedRevision })).toThrow(/revision/i)
    }
    expect(() => ledger.append({ ...command, projectId: 'x'.repeat(257) })).toThrow(/projectId/)
    for (const projectId of ['', '   ', 'project\u0000', 'project\n', 'project\u007f']) {
      expect(() => ledger.append({ ...command, projectId })).toThrow(/projectId/)
    }
  })
})
