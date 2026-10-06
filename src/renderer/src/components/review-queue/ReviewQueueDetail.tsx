import { ExternalLink, FileText, GitCommit, UserCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { DevelopmentEvent } from '../../../../shared/development-event-types'
import type { ReviewItem, ReviewPriorityReason } from '../../../../shared/review-queue-types'
import { reviewEventHistoryEntries } from './review-queue-event-history'
import {
  humanJudgmentLines,
  reviewAgentStatusLine,
  reviewActorLabel,
  reviewEvidenceLines,
  reviewPriorityLabel,
  reviewReasonLabel,
  reviewStatusLine,
  reviewStateLabel,
  reviewSubjectMeta,
  reviewSubjectTitle,
  reviewTestCountLine,
  reviewTestStatusLabel,
  reviewTimeLabel
} from './review-queue-view-model'

const priorityClassName: Record<ReviewItem['priority'], string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-muted text-foreground',
  high: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  critical: 'bg-destructive/10 text-destructive'
}

const EMPTY_RELATED_EVENTS: readonly DevelopmentEvent[] = []

function getSafeReviewTargetUrl(url: string | undefined): string | null {
  if (!url) {
    return null
  }
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null
  } catch {
    return null
  }
}

function DetailSection({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

function PriorityReasonCard({ reason }: { reason: ReviewPriorityReason }): React.JSX.Element {
  const label = reviewReasonLabel(reason)
  const showSummary = reason.summary.trim().length > 0 && reason.summary !== label

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-sm font-medium text-card-foreground">{label}</div>
      {showSummary ? (
        <div className="mt-1 text-sm text-muted-foreground">{reason.summary}</div>
      ) : null}
      <div className="mt-1 text-xs text-muted-foreground">
        {translate(
          'auto.components.reviewQueue.detail.evidenceCount',
          '{{value0}} supporting events',
          { value0: reason.evidenceEventIds.length }
        )}
      </div>
    </div>
  )
}

export function ReviewQueueDetail({
  item,
  relatedEvents = EMPTY_RELATED_EVENTS
}: {
  item: ReviewItem | null
  relatedEvents?: readonly DevelopmentEvent[]
}): React.JSX.Element {
  if (!item) {
    return (
      <aside className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {translate(
          'auto.components.reviewQueue.detail.empty',
          'Select review work to inspect its priority, evidence, and remaining judgment.'
        )}
      </aside>
    )
  }

  const changedFiles = item.evidence.changedFiles?.slice(0, 8) ?? []
  const remainingChangedFiles = Math.max((item.evidence.changedFiles?.length ?? 0) - 8, 0)
  const eventHistory = reviewEventHistoryEntries(relatedEvents).slice(0, 8)
  const reviewTargetUrl = getSafeReviewTargetUrl(item.subject.url)
  return (
    <aside
      className="flex min-h-0 flex-col overflow-auto p-5 scrollbar-sleek"
      data-review-queue-detail
    >
      <div className="space-y-3 border-b border-border pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {reviewSubjectTitle(item)}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{reviewSubjectMeta(item)}</p>
          </div>
          <Badge className={cn('shrink-0', priorityClassName[item.priority])}>
            {reviewPriorityLabel(item.priority)}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{reviewStateLabel(item.state)}</span>
          <span>
            {translate('auto.components.reviewQueue.detail.actor', 'Actor {{value0}}', {
              value0: reviewActorLabel(item)
            })}
          </span>
          <time>{reviewTimeLabel(item.lastUpdatedAt)}</time>
        </div>
        {reviewTargetUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => void window.api.shell.openUrl(reviewTargetUrl)}
          >
            <ExternalLink className="size-3.5" />
            {translate('auto.components.reviewQueue.detail.openSubject', 'Open review target')}
          </Button>
        ) : null}
      </div>

      <div className="mt-5 space-y-5">
        <DetailSection
          title={translate('auto.components.reviewQueue.detail.whyTitle', 'Why first')}
        >
          <div className="space-y-2">
            {item.reasons.length > 0 ? (
              item.reasons.map((reason) => <PriorityReasonCard key={reason.type} reason={reason} />)
            ) : (
              <p className="text-sm text-muted-foreground">
                {translate(
                  'auto.components.reviewQueue.detail.noReasons',
                  'No elevated priority reason was found.'
                )}
              </p>
            )}
          </div>
        </DetailSection>

        <DetailSection
          title={translate('auto.components.reviewQueue.detail.evidenceTitle', 'Evidence')}
        >
          <div className="grid gap-2 text-sm text-foreground sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                {translate('auto.components.reviewQueue.detail.testsLabel', 'Tests')}
              </div>
              <div className="mt-1 text-sm font-semibold">
                {reviewTestStatusLabel(item.evidence.tests.status)}
              </div>
              {reviewTestCountLine(item.evidence) ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  {reviewTestCountLine(item.evidence)}
                </div>
              ) : null}
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                {translate('auto.components.reviewQueue.detail.reviewLabel', 'Review status')}
              </div>
              <div className="mt-1 text-sm">{reviewStatusLine(item.evidence)}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                {translate('auto.components.reviewQueue.detail.agentLabel', 'Agent status')}
              </div>
              <div className="mt-1 text-sm">{reviewAgentStatusLine(item.evidence)}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                {translate('auto.components.reviewQueue.detail.referencesLabel', 'References')}
              </div>
              <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                {item.taskId ? <div>{item.taskId}</div> : null}
                {item.sessionId ? <div>{item.sessionId}</div> : null}
                {!item.taskId && !item.sessionId ? (
                  <div>
                    {translate(
                      'auto.components.reviewQueue.detail.noReferences',
                      'No task or session reference'
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            {reviewEvidenceLines(item.evidence).map((line) => (
              <div key={line} className="flex items-center gap-2 sm:col-span-2">
                <UserCheck className="size-3.5 shrink-0 text-muted-foreground" />
                <span>{line}</span>
              </div>
            ))}
            {item.evidence.latestCommitSha ? (
              <div className="flex items-center gap-2">
                <GitCommit className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="font-mono text-xs">
                  {item.evidence.latestCommitSha.slice(0, 12)}
                </span>
              </div>
            ) : null}
          </div>
        </DetailSection>

        <DetailSection
          title={translate('auto.components.reviewQueue.detail.judgmentTitle', 'Human judgment')}
        >
          <ul className="space-y-2">
            {humanJudgmentLines(item).map((line) => (
              <li key={line} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                {line}
              </li>
            ))}
          </ul>
        </DetailSection>

        {changedFiles.length > 0 ? (
          <DetailSection
            title={translate('auto.components.reviewQueue.detail.changedFilesTitle', 'Files')}
          >
            <ul className="space-y-1">
              {changedFiles.map((path) => (
                <li
                  key={path}
                  className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                >
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono">{path}</span>
                </li>
              ))}
              {remainingChangedFiles > 0 ? (
                <li className="rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground">
                  {translate('auto.components.reviewQueue.detail.moreFiles', '+{{value0}} more', {
                    value0: remainingChangedFiles
                  })}
                </li>
              ) : null}
            </ul>
          </DetailSection>
        ) : null}

        <DetailSection
          title={translate(
            'auto.components.reviewQueue.detail.eventHistoryTitle',
            'Related events'
          )}
        >
          {eventHistory.length > 0 ? (
            <ol className="space-y-2">
              {eventHistory.map((event) => (
                <li key={event.id} className="rounded-lg border border-border bg-card px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <time>{reviewTimeLabel(event.occurredAt)}</time>
                    <span className="font-mono">{event.eventType}</span>
                    <span>{event.actor}</span>
                  </div>
                  <div className="mt-1 text-sm text-card-foreground">{event.summary}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              {translate(
                'auto.components.reviewQueue.detail.noEventHistory',
                'No related events were found.'
              )}
            </p>
          )}
        </DetailSection>
      </div>
    </aside>
  )
}
