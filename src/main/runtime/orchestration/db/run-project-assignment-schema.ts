import type Database from '../../../sqlite/sync-database'

// Intentionally absent from production migrations pending schema and security review (#139).
export function installRunProjectAssignmentSchema(db: Database.Database): void {
  if (db.isTransaction) {
    throw new Error('Assignment schema requires an outermost transaction')
  }
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS run_project_assignment_log (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL UNIQUE,
      run_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('assign', 'revoke')),
      provenance TEXT NOT NULL DEFAULT 'user_declared' CHECK (provenance = 'user_declared'),
      application_session_id TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      supersedes_revision INTEGER NOT NULL CHECK (supersedes_revision = revision - 1),
      schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (run_id, revision)
    );
    CREATE TRIGGER IF NOT EXISTS run_project_assignment_no_replace
      BEFORE INSERT ON run_project_assignment_log
      WHEN EXISTS (SELECT 1 FROM run_project_assignment_log WHERE sequence = NEW.sequence)
        OR EXISTS (SELECT 1 FROM run_project_assignment_log WHERE request_id = NEW.request_id)
        OR EXISTS (SELECT 1 FROM run_project_assignment_log
          WHERE run_id = NEW.run_id AND revision = NEW.revision)
      BEGIN SELECT RAISE(ABORT, 'Assignment journal is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS run_project_assignment_no_update
      BEFORE UPDATE ON run_project_assignment_log BEGIN
      SELECT RAISE(ABORT, 'Assignment journal is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS run_project_assignment_no_delete
      BEFORE DELETE ON run_project_assignment_log BEGIN
      SELECT RAISE(ABORT, 'Assignment journal is append-only'); END;`)
    db.exec('COMMIT')
  } catch (error) {
    if (db.isTransaction) {
      db.exec('ROLLBACK')
    }
    throw error
  }
}
