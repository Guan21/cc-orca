import React from 'react'
import { translate } from '@/i18n/i18n'
import type { ChangeImpactViewModel } from './change-impact-presentation'

/** Receives only validated adapter output, never raw evidence payloads. */
export function ChangeImpactDetail({
  candidate,
  id
}: {
  candidate: ChangeImpactViewModel
  id?: string
}): React.JSX.Element {
  const lifecycleLabels = {
    unknown: translate('auto.components.changeImpact.lifecycle.unknown', 'Unknown'),
    started: translate('auto.components.changeImpact.lifecycle.started', 'Started (observed)'),
    completed: translate('auto.components.changeImpact.lifecycle.completed', 'Completed (observed)')
  }
  return (
    <section
      id={id}
      aria-label={translate('auto.components.changeImpact.selected', 'Selected change impact')}
      className="space-y-3 rounded-lg border border-border bg-card p-3 text-card-foreground"
    >
      <h3 className="font-semibold">
        {translate('auto.components.changeImpact.overlap', 'Potential file overlap')}
      </h3>
      <p className="break-all font-mono text-xs">{candidate.signalId}</p>
      <div className="space-y-1">
        <h4 className="font-medium">
          {translate('auto.components.changeImpact.files', 'Affected files')}
        </h4>
        <ul className="space-y-1 break-all font-mono text-xs">
          {candidate.affectedFiles.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      </div>
      <div className="space-y-2">
        <h4 className="font-medium">
          {translate(
            'auto.components.changeImpact.tasks',
            'Participating tasks and supporting evidence'
          )}
        </h4>
        <ul className="space-y-3">
          {candidate.tasks.map((task) => (
            <li key={task.taskId} className="space-y-1 break-all">
              <p>
                {translate('auto.components.changeImpact.task', 'Task')} {task.taskId}
              </p>
              <p className="text-xs text-muted-foreground">{lifecycleLabels[task.lifecycle]}</p>
              <p className="text-xs">
                {translate(
                  'auto.components.changeImpact.relationships',
                  'CHANGED relationship IDs'
                )}
                : <span className="font-mono">{task.relationshipIds.join(', ')}</span>
              </p>
              <p className="text-xs">
                {translate('auto.components.changeImpact.evidence', 'Evidence references')}:{' '}
                <span className="font-mono">{task.evidenceRefs.join(', ')}</span>
              </p>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-1">
        <h4 className="font-medium">
          {translate(
            'auto.components.changeImpact.explanation',
            'Why this candidate was generated'
          )}
        </h4>
        <p className="text-xs">{candidate.explanation}</p>
      </div>
      <div className="space-y-1">
        <h4 className="font-medium">
          {translate('auto.components.changeImpact.limits', 'Observation limitations')}
        </h4>
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {candidate.observationLimitations.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
