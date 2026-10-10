import React, { useMemo, useState } from 'react'
import { AlertTriangle, FolderKanban, Loader2, SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { ProjectMapTaskDetail, lifecycleLabel } from './ProjectMapTaskDetail'
import { translate } from '@/i18n/i18n'
import type {
  ProjectStateSnapshot,
  ProjectTaskState
} from '../../../../shared/project-state/project-state'
import type { ChangeImpactSignal } from '../../../../shared/change-impact/change-impact'

type ProjectMapPageProps = {
  projectId?: string
  snapshot?: ProjectStateSnapshot
  impactSignals?: readonly ChangeImpactSignal[]
  state?: 'ready' | 'loading' | 'error'
  errorMessage?: string
}

const EMPTY_SIGNALS: readonly ChangeImpactSignal[] = []

function taskSelectionKey(task: ProjectTaskState): string {
  return JSON.stringify([task.projectId, task.taskId])
}

function Metric({ label, count }: { label: string; count: number }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xl font-semibold">{count}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

export function ProjectMapPage({
  snapshot: suppliedSnapshot,
  projectId = suppliedSnapshot?.projectId,
  impactSignals = EMPTY_SIGNALS,
  state = 'ready',
  errorMessage
}: ProjectMapPageProps): React.JSX.Element {
  useTranslation()
  const snapshot =
    suppliedSnapshot?.projectId === projectId &&
    suppliedSnapshot?.tasks.every((task) => task.projectId === projectId)
      ? suppliedSnapshot
      : undefined
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const tasks = snapshot?.tasks ?? []
  const candidates = useMemo(() => {
    if (!snapshot) {
      return []
    }
    const knownTasks = new Set(snapshot.tasks.map((task) => task.taskId))
    return impactSignals
      .filter(
        (signal) =>
          signal.projectId === snapshot.projectId &&
          signal.signalType === 'potential_file_overlap' &&
          signal.taskIds.length >= 2 &&
          signal.taskIds.every((id) => knownTasks.has(id))
      )
      .sort((a, b) => (a.signalId < b.signalId ? -1 : a.signalId > b.signalId ? 1 : 0))
  }, [snapshot, impactSignals])
  const selected = tasks.find((task) => taskSelectionKey(task) === selectedKey) ?? tasks[0]

  let message: string | undefined
  if (state === 'loading') {
    message = translate('auto.components.projectMap.loading', 'Loading Project Map...')
  } else if (state === 'error') {
    message =
      errorMessage ??
      translate('auto.components.projectMap.error', 'Project Map state could not be loaded.')
  } else if (!snapshot) {
    message = translate(
      'auto.components.projectMap.unavailable',
      'No authorized project-state source is connected. Nothing is shown as live team state.'
    )
  } else if (tasks.length === 0) {
    message = translate(
      'auto.components.projectMap.empty',
      'No task observations are available for this project.'
    )
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-background p-5 text-foreground md:p-6">
      <header className="mb-4 flex shrink-0 items-start gap-3">
        <FolderKanban className="mt-1 size-6 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold">
            {translate('auto.components.projectMap.title', 'DevCrew Project Map')}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate(
              'auto.components.projectMap.subtitle',
              'Observed project state, not live presence or verified conflicts.'
            )}
          </p>
        </div>
      </header>

      {message ? (
        <section
          role={state === 'error' ? 'alert' : 'status'}
          className="flex min-h-48 flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground"
        >
          {state === 'loading' ? (
            <Loader2 className="size-6 animate-spin" />
          ) : state === 'error' ? (
            <AlertTriangle className="size-6" />
          ) : (
            <SearchX className="size-6" />
          )}
          {message}
        </section>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {translate('auto.components.projectMap.project', 'Project')}: {snapshot?.projectId}
          </p>
          <section
            aria-label={translate('auto.components.projectMap.overview', 'Project overview')}
            className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4"
          >
            <Metric
              label={translate('auto.components.projectMap.tasks', 'Observed tasks')}
              count={snapshot?.summary.total ?? 0}
            />
            <Metric
              label={translate('auto.components.projectMap.started', 'Started (observed)')}
              count={snapshot?.summary.started ?? 0}
            />
            <Metric
              label={translate('auto.components.projectMap.unknown', 'Unknown lifecycle')}
              count={snapshot?.summary.unknown ?? 0}
            />
            <Metric
              label={translate(
                'auto.components.projectMap.lifecycleCompleted',
                'Completed (observed)'
              )}
              count={snapshot?.summary.completed ?? 0}
            />
            <Metric
              label={translate(
                'auto.components.projectMap.tasksFailedRuns',
                'Tasks with observed failed runs'
              )}
              count={snapshot?.summary.withFailedRuns ?? 0}
            />
            <Metric
              label={translate(
                'auto.components.projectMap.tasksFailedTests',
                'Tasks with observed failed tests'
              )}
              count={snapshot?.summary.withFailedTests ?? 0}
            />
            <Metric
              label={translate(
                'auto.components.projectMap.tasksPendingReviews',
                'Tasks with pending review observations'
              )}
              count={snapshot?.summary.withRequestedReviews ?? 0}
            />
          </section>
          <section className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-lg border border-border lg:grid-cols-2">
            <div
              aria-label={translate('auto.components.projectMap.taskList', 'Project tasks')}
              className="min-h-0 overflow-auto scrollbar-sleek border-b border-border lg:border-b-0 lg:border-r"
            >
              {tasks.map((task) => (
                <button
                  key={taskSelectionKey(task)}
                  type="button"
                  aria-pressed={selected?.taskNodeId === task.taskNodeId}
                  data-current={selected?.taskNodeId === task.taskNodeId}
                  onClick={() => setSelectedKey(taskSelectionKey(task))}
                  className={cn(
                    'flex w-full flex-col gap-1 border-b border-border p-4 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                    selected?.taskNodeId === task.taskNodeId && 'bg-accent'
                  )}
                >
                  <span className="font-medium">{task.taskId}</span>
                  <span className="text-xs text-muted-foreground">
                    {lifecycleLabel(task.lifecycle)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {translate('auto.components.projectMap.runs', 'Runs')}: {task.runs.length}
                    {' · '}
                    {translate(
                      'auto.components.projectMap.reviewRequested',
                      'Reviews requested'
                    )}:{' '}
                    {task.reviews.requested}
                    {' · '}
                    {translate(
                      'auto.components.projectMap.completedReviews',
                      'Completed reviews'
                    )}:{' '}
                    {task.reviews.completed}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {translate('auto.components.projectMap.tests', 'Test observations')}:{' '}
                    {task.testResults.passed + task.testResults.failed + task.testResults.skipped}
                    {' · '}
                    {translate('auto.components.projectMap.failed', 'Failed')}:{' '}
                    {task.testResults.failed}
                  </span>
                  <span className="break-all text-xs text-muted-foreground">
                    {translate(
                      'auto.components.projectMap.lastObserved',
                      'Last recorded observation'
                    )}
                    :{' '}
                    {task.lastObservedAt ||
                      translate(
                        'auto.components.projectMap.noObservation',
                        'No supported observation'
                      )}
                  </span>
                </button>
              ))}
            </div>
            <div
              aria-label={translate('auto.components.projectMap.taskEvidence', 'Task evidence')}
              className="min-h-0 overflow-auto scrollbar-sleek p-4"
            >
              {selected ? <ProjectMapTaskDetail task={selected} candidates={candidates} /> : null}
            </div>
          </section>
        </>
      )}
    </main>
  )
}

export default ProjectMapPage
