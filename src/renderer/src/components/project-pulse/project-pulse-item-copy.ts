import { translate } from '@/i18n/i18n'

export function capitalize(value: string): string {
  const trimmed = value.trim()
  return trimmed ? `${trimmed.slice(0, 1).toUpperCase()}${trimmed.slice(1)}` : ''
}

export function providerLabel(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'github') {
    return 'GitHub'
  }
  if (normalized === 'gitlab') {
    return 'GitLab'
  }
  return capitalize(normalized)
}

export function taskLabel(taskId: string | undefined): string {
  return taskId ? `task #${taskId.replace(/^#/, '')}` : 'task'
}

export function prLabel(pullRequestId: string | undefined): string {
  return pullRequestId ? `PR #${pullRequestId.replace(/^#/, '')}` : 'PR'
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

function tr(key: string, fallback: string): string {
  return translate(key, fallback)
}

function tr1(key: string, fallback: string, value0: string | number): string {
  return translate(key, fallback, { value0 })
}

function tr2(
  key: string,
  fallback: string,
  value0: string | number,
  value1: string | number
): string {
  return translate(key, fallback, { value0, value1 })
}

export function taskStartedTitle(label: string, hasTaskId: boolean): string {
  return hasTaskId
    ? tr1('auto.components.projectPulse.item.startedTaskWithId', 'Started {{value0}}', label)
    : tr('auto.components.projectPulse.item.startedTask', 'Started task')
}

export function taskCompletedTitle(label: string, hasTaskId: boolean): string {
  return hasTaskId
    ? tr1('auto.components.projectPulse.item.completedTaskWithId', 'Completed {{value0}}', label)
    : tr('auto.components.projectPulse.item.completedTask', 'Completed task')
}

export function taskWorkStartedSummary(): string {
  return tr('auto.components.projectPulse.item.taskWorkStarted', 'Task work started.')
}

export function taskCompletedSummary(): string {
  return tr('auto.components.projectPulse.item.taskCompleted', 'Task completed.')
}

export function agentStartedTitle(label: string): string {
  return tr1('auto.components.projectPulse.item.agentStarted', '{{value0}} started', label)
}

export function agentCompletedTitle(label: string): string {
  return tr1('auto.components.projectPulse.item.agentCompleted', '{{value0}} completed', label)
}

export function agentFailedTitle(label: string): string {
  return tr1('auto.components.projectPulse.item.agentFailed', '{{value0}} failed', label)
}

export function agentStartedSummary(agentId: string): string {
  return tr1(
    'auto.components.projectPulse.item.agentStartedSummary',
    'Agent {{value0}} started work.',
    agentId
  )
}

export function agentCompletedSummary(agentId: string): string {
  return tr1(
    'auto.components.projectPulse.item.agentCompletedSummary',
    'Agent {{value0}} completed work.',
    agentId
  )
}

export function agentFailedSummary(agentId: string): string {
  return tr1(
    'auto.components.projectPulse.item.agentFailedSummary',
    'Agent {{value0}} failed.',
    agentId
  )
}

export function fileChangedTitle(path: string): string {
  return tr1('auto.components.projectPulse.item.fileChanged', '{{value0}} changed', path)
}

export function fileChangedSummary(changeType: string): string {
  return tr1(
    'auto.components.projectPulse.item.fileChangeSummary',
    '{{value0}} file.',
    capitalize(changeType)
  )
}

export function fileRenamedSummary(oldPath: string): string {
  return tr1(
    'auto.components.projectPulse.item.fileRenamedFrom',
    'Renamed from {{value0}}.',
    oldPath
  )
}

export function commitCreatedTitle(sha: string): string {
  return tr1(
    'auto.components.projectPulse.item.commitCreated',
    'Commit {{value0}} created',
    shortSha(sha)
  )
}

export function commitCreatedSummary(): string {
  return tr('auto.components.projectPulse.item.commitCreatedSummary', 'Commit created.')
}

export function pullRequestCreatedTitle(pullRequestId: string): string {
  return tr1(
    'auto.components.projectPulse.item.prCreated',
    '{{value0}} created',
    prLabel(pullRequestId)
  )
}

export function pullRequestCreatedSummary(provider: string): string {
  return tr1(
    'auto.components.projectPulse.item.prCreatedSummary',
    '{{value0}} pull request created.',
    providerLabel(provider) ?? 'Provider'
  )
}

export function reviewRequestedTitle(pullRequestId: string | undefined): string {
  return tr1(
    'auto.components.projectPulse.item.reviewRequested',
    'Review requested for {{value0}}',
    prLabel(pullRequestId)
  )
}

export function reviewRequestedSummary(provider: string): string {
  return tr1(
    'auto.components.projectPulse.item.reviewRequestedSummary',
    '{{value0}} review requested.',
    providerLabel(provider) ?? 'Provider'
  )
}

export function reviewCompletedTitle(pullRequestId: string | undefined): string {
  return tr1(
    'auto.components.projectPulse.item.reviewCompleted',
    'Review completed for {{value0}}',
    prLabel(pullRequestId)
  )
}

export function reviewCompletedSummary(provider: string): string {
  return tr1(
    'auto.components.projectPulse.item.reviewCompletedSummary',
    '{{value0}} review completed.',
    providerLabel(provider) ?? 'Provider'
  )
}

export function testCountSummary(passed: number | undefined, failed: number | undefined): string {
  return tr2(
    'auto.components.projectPulse.item.testCountSummary',
    '{{value0}} passed, {{value1}} failed',
    passed ?? 0,
    failed ?? 0
  )
}

export function testRunCompletedSummary(): string {
  return tr('auto.components.projectPulse.item.testRunCompletedSummary', 'Test run completed.')
}

export function testsCompletedTitle(status: 'passed' | 'failed' | 'skipped'): string {
  if (status === 'failed') {
    return tr('auto.components.projectPulse.item.testsFailed', 'Tests failed')
  }
  if (status === 'skipped') {
    return tr('auto.components.projectPulse.item.testsSkipped', 'Tests skipped')
  }
  return tr('auto.components.projectPulse.item.testsPassed', 'Tests passed')
}
