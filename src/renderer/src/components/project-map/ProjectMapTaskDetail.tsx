import type React from 'react'
import { translate } from '@/i18n/i18n'
import type { ProjectTaskState } from '../../../../shared/project-state/project-state'

export function lifecycleLabel(lifecycle: ProjectTaskState['lifecycle']): string {
  switch (lifecycle) {
    case 'unknown':
      return translate('auto.components.projectMap.lifecycleUnknown', 'Unknown')
    case 'started':
      return translate('auto.components.projectMap.lifecycleStarted', 'Started (observed)')
    case 'completed':
      return translate('auto.components.projectMap.lifecycleCompleted', 'Completed (observed)')
  }
}

export function ProjectMapTaskDetail({ task }: { task: ProjectTaskState }): React.JSX.Element {
  const tests = task.testResults
  const reviews = task.reviews
  return (
    <div className="space-y-4 break-words text-sm">
      <h2 className="font-semibold">{task.taskId}</h2>
      <p>
        {translate('auto.components.projectMap.lifecycle', 'Task lifecycle')}:{' '}
        {lifecycleLabel(task.lifecycle)}
      </p>
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.projectMap.lifecycleHint',
          'Lifecycle follows the latest supported lifecycle observation. Started does not mean currently online.'
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {translate('auto.components.projectMap.lastObserved', 'Last recorded observation')}:{' '}
        {task.lastObservedAt ||
          translate('auto.components.projectMap.noObservation', 'No supported observation')}
      </p>
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.projectMap.unknownFields',
          'Owner, blockers, module, dependencies and next action: unavailable without authoritative evidence.'
        )}
      </p>
      <section
        aria-label={translate('auto.components.projectMap.agentRuns', 'Agent run observations')}
      >
        <h3 className="font-medium">
          {translate('auto.components.projectMap.agentRuns', 'Agent run observations')}
        </h3>
        {task.runs.length ? (
          <ul className="space-y-2">
            {task.runs.map((run) => (
              <li key={run.runId} className="rounded-md border border-border p-2">
                <p className="break-all font-mono text-xs">{run.runId}</p>
                <p>
                  {run.status === 'failed'
                    ? translate('auto.components.projectMap.runFailed', 'Failed (observed)')
                    : lifecycleLabel(run.status)}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  {translate('auto.components.projectMap.agents', 'Observed agent IDs')}:{' '}
                  {run.agentNodeIds.length
                    ? run.agentNodeIds.join(', ')
                    : translate(
                        'auto.components.projectMap.noAgent',
                        'No supported agent observation'
                      )}
                </p>
                <Evidence ids={run.evidenceRefs} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            {translate('auto.components.projectMap.noRuns', 'No supported run observation')}
          </p>
        )}
      </section>
      <section aria-label={translate('auto.components.projectMap.tests', 'Test observations')}>
        <h3 className="font-medium">
          {translate('auto.components.projectMap.tests', 'Test observations')}
        </h3>
        {tests.passed + tests.failed + tests.skipped ? (
          <p className="text-xs">
            {translate('auto.components.projectMap.passed', 'Passed')}: {tests.passed}
            {' · '}
            {translate('auto.components.projectMap.failed', 'Failed')}: {tests.failed}
            {' · '}
            {translate('auto.components.projectMap.skipped', 'Skipped')}: {tests.skipped}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {translate('auto.components.projectMap.noTests', 'No supported test observation')}
          </p>
        )}
      </section>
      <section aria-label={translate('auto.components.projectMap.reviews', 'Review observations')}>
        <h3 className="font-medium">
          {translate('auto.components.projectMap.reviews', 'Review observations')}
        </h3>
        {reviews.requested + reviews.completed ? (
          <p className="text-xs">
            {translate('auto.components.projectMap.requested', 'Requested')}: {reviews.requested}
            {' · '}
            {translate('auto.components.projectMap.completed', 'Completed')}: {reviews.completed}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {translate('auto.components.projectMap.noReviews', 'No supported review observation')}
          </p>
        )}
      </section>
      <section>
        <h3 className="font-medium">
          {translate('auto.components.projectMap.files', 'Changed files')}
        </h3>
        {task.changedFiles.length ? (
          <ul className="list-disc break-all pl-5 font-mono text-xs">
            {task.changedFiles.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            {translate('auto.components.projectMap.noFiles', 'No attributed file observations')}
          </p>
        )}
      </section>
      <Evidence ids={task.evidenceRefs} />
    </div>
  )
}

function Evidence({ ids }: { ids: readonly string[] }): React.JSX.Element {
  return ids.length ? (
    <details>
      <summary className="cursor-pointer text-xs">
        {translate('auto.components.projectMap.evidence', 'Supporting evidence IDs')}
      </summary>
      <ul className="mt-2 list-disc break-all pl-5 text-xs">
        {ids.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
    </details>
  ) : (
    <p className="text-xs text-muted-foreground">
      {translate('auto.components.projectMap.noEvidence', 'No supported evidence reference')}
    </p>
  )
}
