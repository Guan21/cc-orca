import React, { useId, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import type { ChangeImpactSignal } from '../../../../shared/change-impact/change-impact'
import type { ProjectStateSnapshot } from '../../../../shared/project-state/project-state'
import { toChangeImpactViewModels } from './change-impact-presentation'
import { ChangeImpactDetail } from './ChangeImpactDetail'

export type ChangeImpactSectionProps = {
  /** The caller must authorize this project before providing observations. */
  projectId: string
  signals: readonly ChangeImpactSignal[]
  snapshot?: ProjectStateSnapshot
}

export function ChangeImpactSection({
  projectId,
  signals,
  snapshot
}: ChangeImpactSectionProps): React.JSX.Element {
  const headingId = useId()
  const detailId = useId()
  const [selection, setSelection] = useState<{ projectId: string; signalId: string } | null>(null)
  const candidates = toChangeImpactViewModels(projectId, signals, snapshot)
  const selected =
    candidates.find(
      (candidate) => selection?.projectId === projectId && candidate.signalId === selection.signalId
    ) ?? candidates[0]

  return (
    <section aria-labelledby={headingId} className="space-y-3 text-sm text-foreground">
      <header className="space-y-1">
        <h2 id={headingId} className="font-semibold">
          {translate('auto.components.changeImpact.title', 'Change Impact')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.changeImpact.historical',
            'Historical observations; review suggested. Tasks may have completed and observations may be stale.'
          )}
        </p>
      </header>
      {selected ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ul
            aria-label={translate('auto.components.changeImpact.candidates', 'Overlap candidates')}
            className="space-y-1"
          >
            {candidates.map((candidate) => (
              <li key={candidate.signalId}>
                <Button
                  type="button"
                  variant="ghost"
                  aria-pressed={candidate.signalId === selected.signalId}
                  aria-controls={detailId}
                  data-current={candidate.signalId === selected.signalId}
                  className="h-auto w-full flex-col items-start whitespace-normal p-3 text-left data-[current=true]:bg-accent data-[current=true]:text-accent-foreground"
                  onClick={() => setSelection({ projectId, signalId: candidate.signalId })}
                >
                  <span>
                    {translate('auto.components.changeImpact.overlap', 'Potential file overlap')}
                  </span>
                  <span className="break-all font-mono text-xs">
                    {candidate.affectedFiles.join(', ')}
                  </span>
                  <Badge variant="outline">
                    {translate('auto.components.changeImpact.review', 'Review suggested')}
                  </Badge>
                </Button>
              </li>
            ))}
          </ul>
          <ChangeImpactDetail id={detailId} candidate={selected} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.changeImpact.empty',
            'No supported overlap observations are available. This does not establish absence of conflicts.'
          )}
        </p>
      )}
    </section>
  )
}
