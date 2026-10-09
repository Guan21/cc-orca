import { useMemo, useState } from 'react'
import { AlertTriangle, FolderKanban, Loader2, SearchX } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { ProjectStateSnapshot, ProjectTaskState } from '../../../../shared/project-state/project-state'
import type { ChangeImpactSignal } from '../../../../shared/change-impact/change-impact'

type ProjectMapPageProps = {
  snapshot?: ProjectStateSnapshot
  impactSignals?: readonly ChangeImpactSignal[]
  state?: 'ready' | 'loading' | 'error'
  errorMessage?: string
}

const lifecycleLabels = {
  unknown: 'Unknown',
  started: 'Started (observed)',
  completed: 'Completed (observed)'
} as const

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
  snapshot,
  impactSignals = [],
  state = 'ready',
  errorMessage
}: ProjectMapPageProps): React.JSX.Element {
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
          <section className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label={translate('auto.components.projectMap.tasks', 'Observed tasks')} count={tasks.length} />
            <Metric
              label={translate('auto.components.projectMap.started', 'Started (observed)')}
              count={snapshot?.summary.started ?? 0}
            />
            <Metric
              label={translate('auto.components.projectMap.unknown', 'Unknown lifecycle')}
              count={snapshot?.summary.unknown ?? 0}
            />
            <Metric
              label={translate('auto.components.projectMap.overlap', 'Historical overlap candidates')}
              count={candidates.length}
            />
          </section>
          <section className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-lg border border-border lg:grid-cols-2">
            <div aria-label="Project tasks" className="min-h-0 overflow-auto border-b border-border lg:border-b-0 lg:border-r">
              {tasks.map((task) => (
                <button
                  key={taskSelectionKey(task)}
                  type="button"
                  aria-pressed={selected?.taskNodeId === task.taskNodeId}
                  onClick={() => setSelectedKey(taskSelectionKey(task))}
                  className="flex w-full flex-col gap-1 border-b border-border p-4 text-left text-sm hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="font-medium">{task.taskId}</span>
                  <span className="text-xs text-muted-foreground">{lifecycleLabels[task.lifecycle]}</span>
                  <span className="text-xs text-muted-foreground">
                    {translate('auto.components.projectMap.runs', 'Runs')}: {task.runs.length}
                    {' · '}
                    {translate('auto.components.projectMap.reviewRequested', 'Reviews requested')}: {task.reviews.requested}
                  </span>
                </button>
              ))}
            </div>
            <div aria-label="Task evidence" className="min-h-0 overflow-auto p-4">
              {selected ? (
                <div className="space-y-4 text-sm">
                  <h2 className="font-semibold">{selected.taskId}</h2>
                  <p className="text-xs text-muted-foreground">
                    {translate('auto.components.projectMap.lastObserved', 'Last recorded observation')}:
                    {' '}{selected.lastObservedAt}
                  </p>
                  <p>
                    {translate('auto.components.projectMap.lifecycle', 'Task lifecycle')}:
                    {' '}{lifecycleLabels[selected.lifecycle]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {translate(
                      'auto.components.projectMap.unknownFields',
                      'Owner, blockers, module, dependencies and next action: unavailable without authoritative evidence.'
                    )}
                  </p>
                  <div>
                    <h3 className="font-medium">
                      {translate('auto.components.projectMap.observations', 'Observed results')}
                    </h3>
                    <p>{translate('auto.components.projectMap.failedTests', 'Failed test results')}: {selected.testResults.failed}</p>
                    <p>{translate('auto.components.projectMap.failedRuns', 'Failed runs')}: {selected.runs.filter((run) => run.status === 'failed').length}</p>
                    <p>{translate('auto.components.projectMap.completedReviews', 'Completed reviews')}: {selected.reviews.completed}</p>
                  </div>
                  <div>
                    <h3 className="font-medium">
                      {translate('auto.components.projectMap.files', 'Changed files')}
                    </h3>
                    {selected.changedFiles.length ? (
                      <ul className="list-disc break-all pl-5">
                        {selected.changedFiles.map((file) => <li key={file}>{file}</li>)}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">
                        {translate('auto.components.projectMap.noFiles', 'No attributed file observations')}
                      </p>
                    )}
                  </div>
                  {candidates.filter((signal) => signal.taskIds.includes(selected.taskId)).map((signal) => (
                    <div key={signal.signalId} className="rounded-md border border-border p-3">
                      <h3 className="font-medium">
                        {translate('auto.components.projectMap.candidate', 'Potential file overlap (historical)')}
                      </h3>
                      <p className="break-all text-xs text-muted-foreground">{signal.affectedFiles.join(', ')}</p>
                      <p className="text-xs">
                        {translate('auto.components.projectMap.relatedTasks', 'Tasks')}: {signal.taskIds.join(', ')}
                      </p>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs">
                          {translate('auto.components.projectMap.overlapEvidence', 'Per-task relationship evidence')}
                        </summary>
                        {signal.taskEvidence.map((entry) => (
                          <p key={entry.taskNodeId} className="mt-2 break-all text-xs">
                            {entry.taskId}: {entry.evidenceRefs.join(', ')}
                          </p>
                        ))}
                      </details>
                    </div>
                  ))}
                  <details>
                    <summary className="cursor-pointer text-xs">
                      {translate('auto.components.projectMap.evidence', 'Supporting evidence IDs')}
                    </summary>
                    <ul className="mt-2 list-disc break-all pl-5 text-xs">
                      {selected.evidenceRefs.map((id) => <li key={id}>{id}</li>)}
                    </ul>
                  </details>
                </div>
              ) : null}
            </div>
          </section>
        </>
      )}
    </main>
  )
}

export default ProjectMapPage
