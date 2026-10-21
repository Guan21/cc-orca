import type React from 'react'
import { GitCommit, GitPullRequest, ShieldAlert } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  selectedPrFactsView,
  type SelectedPrUiState,
  type SelectedPrUiStatus
} from './selected-pr-facts-view'

type Props = Readonly<{ state: SelectedPrUiState }>

const statusText: Record<SelectedPrUiStatus, string> = {
  disabled: 'GitHub Project Source is disabled. No live PR evidence is available.',
  not_selected: 'No Main-confirmed GitHub Project Source is selected. Use View → Select GitHub Project Source.',
  loading: 'Waiting for authorized selected-PR evidence.',
  denied: 'Access to the selected PR was denied. No facts are shown.',
  incomplete: 'Selected-PR evidence is incomplete. Checks and task completion cannot be inferred.',
  stale: 'Selected-PR evidence has expired. Old facts are hidden.',
  rate_limited: 'GitHub source is rate-limited. No previous facts are shown.',
  unavailable: 'Verified selected-PR evidence is unavailable.',
  error: 'Selected-PR evidence could not be loaded. No previous facts are shown.',
  offline: 'GitHub Project Source is offline. No live facts are shown.'
}

/**
 * B5b renders only a read model. Production deliberately passes "disabled";
 * no UI-originated fact can become Main-authorized evidence.
 */
export function SelectedPrSourcePanel({ state }: Props): React.JSX.Element {
  const view = selectedPrFactsView(state)
  return (
    <section
      aria-label="Selected GitHub PR evidence"
      className="mx-5 mt-4 shrink-0 rounded-lg border border-border bg-card px-4 py-3 md:mx-6"
    >
      <header className="mb-2 flex items-center gap-2">
        <GitPullRequest aria-hidden="true" className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-card-foreground">
          {translate('auto.components.projectMap.githubPrEvidence', 'Selected PR evidence')}
        </h2>
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {translate('auto.components.projectMap.githubPrReadOnly', 'Read-only · selected PR')}
        </span>
      </header>
      {view.status !== 'ready' ? (
        <div
          role="status"
          data-source-status={view.status}
          className="flex gap-2 text-xs text-muted-foreground"
        >
          <ShieldAlert aria-hidden="true" className="size-4 shrink-0" />
          <p>{statusText[view.status]}</p>
        </div>
      ) : (
        <div data-source-status="ready" className="space-y-3 text-xs">
          <p className="break-all text-muted-foreground">
            {view.projectId} · {view.repository} · fetched {view.fetchedAt}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <strong className="text-sm">
              PR #{view.pr.number} · {view.pr.state}
            </strong>
            <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
              <GitCommit aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="break-all font-mono">{view.commitSha}</span>
            </span>
          </div>
          <div aria-label="Observed PR checks" className="space-y-1">
            <h3 className="font-medium">Observed Checks (not a complete CI attestation)</h3>
            {view.checks.length ? (
              <ul className="space-y-1">
                {view.checks.map((check) => (
                  <li key={check.id} className="break-words text-muted-foreground">
                    Check #{check.id}: {check.status} · {check.conclusion ?? 'conclusion unknown'}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No check observations; CI outcome unknown.</p>
            )}
          </div>
          <p className="text-muted-foreground">
            Projection only. Agent execution, task completion and overall CI completeness are not verified.
          </p>
        </div>
      )}
    </section>
  )
}

export default SelectedPrSourcePanel
