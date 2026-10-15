import type Database from '../../../sqlite/sync-database'

export type RunProjectAssignmentCommand = {
  requestId: string
  runId: string
  projectId: string
  action: 'assign' | 'revoke'
  applicationSessionId: string
  expectedRevision: number
}

export type RunProjectAssignmentRecord = {
  sequence: number
  requestId: string
  runId: string
  projectId: string
  action: 'assign' | 'revoke'
  provenance: 'user_declared'
  applicationSessionId: string
  revision: number
  supersedesRevision: number
  schemaVersion: 1
  createdAt: string
}

const COLUMNS = `sequence, request_id AS requestId, run_id AS runId, project_id AS projectId,
  action, provenance, application_session_id AS applicationSessionId, revision,
  supersedes_revision AS supersedesRevision, schema_version AS schemaVersion, created_at AS createdAt`

function identifier(value: string, name: string): void {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 256 ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    throw new Error(`Invalid ${name}`)
  }
}

function counter(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${name}`)
  }
}

// Storage only: neither a session pseudonym nor a Project reference proves consent or execution.
export class RunProjectAssignmentLedger {
  constructor(private readonly db: Database.Database) {}

  // Duplicate requests return their historical receipt, never a claim that it remains current.
  append(command: RunProjectAssignmentCommand): RunProjectAssignmentRecord {
    for (const key of ['requestId', 'runId', 'projectId', 'applicationSessionId'] as const) {
      identifier(command[key], key)
    }
    counter(command.expectedRevision, 'revision')
    if (command.expectedRevision === Number.MAX_SAFE_INTEGER) {
      throw new Error('Invalid revision')
    }
    if (command.action !== 'assign' && command.action !== 'revoke') {
      throw new Error('Invalid action')
    }
    if (this.db.isTransaction) {
      throw new Error('Assignment requires an outermost transaction')
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const run = this.db
        .prepare('SELECT legacy, home_database FROM runs WHERE id = ?')
        .get(command.runId)
      if (!run || run.legacy !== 0 || run.home_database !== 'this_database') {
        throw new Error('Run must exist in the same local database and be non-legacy')
      }
      const duplicate = this.db
        .prepare(`SELECT ${COLUMNS} FROM run_project_assignment_log WHERE request_id = ?`)
        .get(command.requestId) as RunProjectAssignmentRecord | undefined
      let result: RunProjectAssignmentRecord
      if (duplicate) {
        if (
          duplicate.runId !== command.runId ||
          duplicate.projectId !== command.projectId ||
          duplicate.action !== command.action ||
          duplicate.applicationSessionId !== command.applicationSessionId ||
          duplicate.supersedesRevision !== command.expectedRevision
        ) {
          throw new Error('Conflicting assignment request ID')
        }
        result = duplicate
      } else {
        const previous = this.current(command.runId)
        if ((previous?.revision ?? 0) !== command.expectedRevision) {
          throw new Error('Assignment revision conflict')
        }
        if (
          command.action === 'revoke' &&
          (previous?.action !== 'assign' || previous.projectId !== command.projectId)
        ) {
          throw new Error('Revoke must name the current assignment')
        }
        this.db
          .prepare(`INSERT INTO run_project_assignment_log
          (request_id, run_id, project_id, action, application_session_id, revision, supersedes_revision)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(
            command.requestId,
            command.runId,
            command.projectId,
            command.action,
            command.applicationSessionId,
            command.expectedRevision + 1,
            command.expectedRevision
          )
        result = this.current(command.runId)!
      }
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      if (this.db.isTransaction) {
        this.db.exec('ROLLBACK')
      }
      throw error
    }
  }

  // Latest journal state includes revocation; it is not a validated current catalog association.
  current(runId: string): RunProjectAssignmentRecord | undefined {
    identifier(runId, 'runId')
    return this.db
      .prepare(`SELECT ${COLUMNS} FROM run_project_assignment_log
      WHERE run_id = ? ORDER BY revision DESC LIMIT 1`)
      .get(runId) as RunProjectAssignmentRecord | undefined
  }

  history(params: {
    runId: string
    afterSequence?: number
    limit: number
  }): RunProjectAssignmentRecord[] {
    identifier(params.runId, 'runId')
    const after = params.afterSequence ?? 0
    counter(after, 'sequence')
    if (!Number.isSafeInteger(params.limit) || params.limit < 1 || params.limit > 100) {
      throw new Error('Invalid history limit')
    }
    return this.db
      .prepare(`SELECT ${COLUMNS} FROM run_project_assignment_log
      WHERE run_id = ? AND sequence > ? ORDER BY revision LIMIT ?`)
      .all(params.runId, after, params.limit) as RunProjectAssignmentRecord[]
  }
}
