export type AssignmentSummary = {
  runId: string
  projectId: string | null
  projectLabel: string | null
  status: 'unassigned' | 'user_declared' | 'needs_reconfirmation' | 'revoked' | 'unavailable'
  revision: number
}

type AssignmentContext = 'personal-local' | 'corporate' | 'remote' | 'ssh' | 'wsl' | 'paired'

export type AssignmentSelection = {
  context: AssignmentContext
  generation: number
  runId: string | null
  projectId: string | null
  summary: AssignmentSummary | null
}

export function createAssignmentSelection(): AssignmentSelection {
  return {
    context: 'personal-local',
    generation: 0,
    runId: null,
    projectId: null,
    summary: null
  }
}

// Presentation only; Main must independently authorize every read and confirmation.
export function selectAssignment(
  state: AssignmentSelection,
  runId: string | null,
  projectId: string | null,
  context: AssignmentContext = state.context
): AssignmentSelection {
  return {
    context,
    generation: state.generation + 1,
    runId: context === 'personal-local' ? runId : null,
    projectId: context === 'personal-local' ? projectId : null,
    summary: null
  }
}

// Every refresh needs its own generation; catalog changes do not advance ledger revisions.
export function beginAssignmentRead(state: AssignmentSelection): AssignmentSelection {
  return selectAssignment(state, state.runId, state.projectId)
}

export function receiveAssignment(
  state: AssignmentSelection,
  generation: number,
  response: AssignmentSummary
): AssignmentSelection {
  if (
    state.context !== 'personal-local' ||
    generation !== state.generation ||
    !state.runId ||
    response.runId !== state.runId ||
    !Number.isSafeInteger(response.revision) ||
    response.revision < 0 ||
    response.revision === Number.MAX_SAFE_INTEGER ||
    response.revision < (state.summary?.revision ?? 0)
  ) {
    return state
  }
  return {
    ...state,
    summary: {
      runId: response.runId,
      projectId: response.projectId,
      projectLabel: response.projectLabel,
      status: response.status,
      revision: response.revision
    }
  }
}

export function assignmentIntent(state: AssignmentSelection, action: 'assign' | 'revoke') {
  const current = state.summary
  if (
    state.context !== 'personal-local' ||
    !state.runId ||
    !current ||
    current.status === 'unavailable'
  ) {
    return null
  }
  const projectId = action === 'revoke' ? current.projectId : state.projectId
  if (!projectId) {
    return null
  }
  if (action === 'revoke' && !['user_declared', 'needs_reconfirmation'].includes(current.status)) {
    return null
  }
  if (
    action === 'assign' &&
    current.status === 'user_declared' &&
    current.projectId === projectId
  ) {
    return null
  }
  return { action, runId: state.runId, projectId, expectedRevision: current.revision }
}
