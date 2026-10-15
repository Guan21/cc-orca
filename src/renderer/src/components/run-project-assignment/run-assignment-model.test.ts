import { describe, expect, it } from 'vitest'
import {
  assignmentIntent,
  beginAssignmentRead,
  createAssignmentSelection,
  receiveAssignment,
  selectAssignment,
  type AssignmentSummary
} from './run-assignment-model'

const summary: AssignmentSummary = {
  runId: 'run-a',
  projectId: 'project-a',
  projectLabel: 'Project A',
  status: 'user_declared',
  revision: 3
}

function loaded() {
  const state = selectAssignment(createAssignmentSelection(), 'run-a', 'project-b')
  return receiveAssignment(state, state.generation, summary)
}

describe('unmounted Run assignment presentation model', () => {
  it('starts with explicit empty selections and no mutation intent', () => {
    const state = createAssignmentSelection()
    expect(state.runId).toBeNull()
    expect(state.projectId).toBeNull()
    expect(assignmentIntent(state, 'assign')).toBeNull()
  })

  it('distinguishes initial assignment, reassignment and revocation', () => {
    const state = loaded()
    expect(assignmentIntent(state, 'assign')).toEqual({
      action: 'assign',
      runId: 'run-a',
      projectId: 'project-b',
      expectedRevision: 3
    })
    expect(assignmentIntent(state, 'revoke')).toEqual({
      action: 'revoke',
      runId: 'run-a',
      projectId: 'project-a',
      expectedRevision: 3
    })
    const empty = selectAssignment(state, 'run-a', 'project-b')
    const initial = receiveAssignment(empty, empty.generation, {
      ...summary,
      projectId: null,
      projectLabel: null,
      revision: 0,
      status: 'unassigned'
    })
    expect(assignmentIntent(initial, 'assign')?.expectedRevision).toBe(0)
    expect(assignmentIntent(initial, 'revoke')).toBeNull()
  })

  it('requires another read after switching Project and ignores late results', () => {
    const old = loaded()
    const next = selectAssignment(old, 'run-a', 'project-c')
    expect(next.summary).toBeNull()
    expect(receiveAssignment(next, old.generation, summary)).toBe(next)
    expect(assignmentIntent(next, 'assign')).toBeNull()
  })

  it('fences Run and Project selection ABA and navigation resets', () => {
    const old = loaded()
    const away = selectAssignment(old, 'run-b', 'project-b')
    const back = selectAssignment(away, 'run-a', 'project-b')
    expect(receiveAssignment(back, old.generation, summary)).toBe(back)
    const reloaded = selectAssignment(back, 'run-a', 'project-b')
    expect(receiveAssignment(reloaded, back.generation, summary)).toBe(reloaded)
  })

  it('rejects a different Run response even in the current selection generation', () => {
    const state = loaded()
    expect(receiveAssignment(state, state.generation, { ...summary, runId: 'run-b' })).toBe(state)
  })

  it('does not let an older revision overwrite newer confirmed state', () => {
    const state = loaded()
    expect(receiveAssignment(state, state.generation, { ...summary, revision: 2 })).toBe(state)
  })

  it('ignores a late same-revision read after catalog invalidation and reconfirmation', () => {
    const old = loaded()
    const refreshed = beginAssignmentRead(old)
    expect(refreshed.summary).toBeNull()
    const current = receiveAssignment(refreshed, refreshed.generation, {
      ...summary,
      projectLabel: null,
      status: 'needs_reconfirmation'
    })
    expect(receiveAssignment(current, old.generation, summary)).toBe(current)
    expect(current.summary?.projectLabel).toBeNull()
    expect(current.summary?.status).toBe('needs_reconfirmation')
  })

  it('clears old labels and actions before a redacted unavailable refresh', () => {
    const old = loaded()
    const refreshed = beginAssignmentRead(old)
    expect(assignmentIntent(refreshed, 'assign')).toBeNull()
    const unavailable = receiveAssignment(refreshed, refreshed.generation, {
      runId: 'run-a',
      projectId: null,
      projectLabel: null,
      revision: 0,
      status: 'unavailable'
    })
    expect(unavailable.summary?.status).toBe('unavailable')
    expect(unavailable.summary?.projectLabel).toBeNull()
    expect(assignmentIntent(unavailable, 'revoke')).toBeNull()
    expect(receiveAssignment(unavailable, old.generation, summary)).toBe(unavailable)
  })

  it('offers reconfirmation for historical declarations without promoting them', () => {
    const state = selectAssignment(loaded(), 'run-a', 'project-a')
    const historical = receiveAssignment(state, state.generation, {
      ...summary,
      status: 'needs_reconfirmation'
    })
    expect(historical.summary?.status).toBe('needs_reconfirmation')
    expect(assignmentIntent(historical, 'assign')?.expectedRevision).toBe(3)
    const current = receiveAssignment(state, state.generation, summary)
    expect(assignmentIntent(current, 'assign')).toBeNull()
  })

  it('allows revocation of a missing Project without displaying its old label', () => {
    const state = loaded()
    const missing = receiveAssignment(state, state.generation, {
      ...summary,
      projectLabel: null,
      status: 'needs_reconfirmation'
    })
    expect(missing.summary?.projectLabel).toBeNull()
    expect(assignmentIntent(missing, 'revoke')?.projectId).toBe('project-a')
    expect(assignmentIntent(selectAssignment(missing, 'run-a', null), 'assign')).toBeNull()
  })

  it('keeps revoked and unavailable distinct and never optimistically commits', () => {
    const state = loaded()
    assignmentIntent(state, 'assign')
    expect(state.summary).toEqual(summary)
    const revoked = receiveAssignment(state, state.generation, { ...summary, status: 'revoked' })
    expect(revoked.summary?.status).toBe('revoked')
    expect(assignmentIntent(revoked, 'revoke')).toBeNull()
    expect(assignmentIntent(revoked, 'assign')).not.toBeNull()
    const unavailable = receiveAssignment(state, state.generation, {
      ...summary,
      status: 'unavailable',
      projectId: null,
      projectLabel: null
    })
    expect(unavailable.summary?.status).toBe('unavailable')
    expect(assignmentIntent(unavailable, 'assign')).toBeNull()
    expect(assignmentIntent(unavailable, 'revoke')).toBeNull()
  })

  it.each(['corporate', 'remote', 'ssh', 'wsl', 'paired'] as const)(
    'clears presentation state for %s contexts (not an authorization check)',
    (context) => {
      const old = loaded()
      const state = selectAssignment(old, 'run-a', 'project-b', context)
      expect(state.runId).toBeNull()
      expect(state.projectId).toBeNull()
      expect(receiveAssignment(state, state.generation, summary)).toBe(state)
      expect(assignmentIntent(state, 'assign')).toBeNull()
      expect(assignmentIntent(state, 'revoke')).toBeNull()
    }
  )

  it('projects only display fields instead of retaining internal ledger data', () => {
    const state = loaded()
    const response = {
      ...summary,
      requestId: 'private',
      applicationSessionId: 'private',
      objective: 'secret',
      task: 'secret',
      path: 'secret',
      logs: ['secret']
    }
    const received = receiveAssignment(state, state.generation, response)
    expect(received.summary).toEqual(summary)
    expect(JSON.stringify(received)).not.toMatch(/private|secret/)
    response.projectLabel = 'Changed after delivery'
    expect(received.summary?.projectLabel).toBe('Project A')
  })

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER])(
    'rejects unusable revision %s',
    (revision) => {
      const state = loaded()
      expect(receiveAssignment(state, state.generation, { ...summary, revision })).toBe(state)
    }
  )
})
