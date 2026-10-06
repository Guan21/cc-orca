import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ClipboardCheck, Loader2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { DevelopmentEvent } from '../../../../shared/development-event-types'
import { projectReviewQueue } from '../../../../shared/review-queue-projection'
import { reviewQueueDemoEvents } from './review-queue-demo-events'
import { ReviewQueueDetail } from './ReviewQueueDetail'
import { ReviewQueueList } from './ReviewQueueList'
import { summarizeReviewQueue } from './review-queue-view-model'

type ReviewQueuePageState = 'ready' | 'loading' | 'error'

type ReviewQueuePageProps = {
  events?: readonly DevelopmentEvent[]
  state?: ReviewQueuePageState
  errorMessage?: string
}

function ReviewQueueMetric({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-2xl font-semibold leading-none text-card-foreground">{value}</div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  )
}

function ReviewQueueState({
  kind,
  errorMessage
}: {
  kind: Exclude<ReviewQueuePageState, 'ready'>
  errorMessage?: string
}): React.JSX.Element {
  const isLoading = kind === 'loading'
  return (
    <main className="flex h-full min-h-0 flex-col bg-background p-6 text-foreground">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        {isLoading ? (
          <Loader2 className="size-7 animate-spin text-muted-foreground" />
        ) : (
          <AlertTriangle className="size-7 text-destructive" />
        )}
        <h1 className="text-base font-semibold">
          {isLoading
            ? translate('auto.components.reviewQueue.page.loading', 'Loading review queue...')
            : translate(
                'auto.components.reviewQueue.page.unavailable',
                'Review Queue is unavailable'
              )}
        </h1>
        {!isLoading ? (
          <p className="max-w-md text-sm text-muted-foreground">
            {errorMessage ??
              translate(
                'auto.components.reviewQueue.page.loadError',
                'The review event collection could not be loaded.'
              )}
          </p>
        ) : null}
      </div>
    </main>
  )
}

export function ReviewQueuePage({
  events = reviewQueueDemoEvents,
  state = 'ready',
  errorMessage
}: ReviewQueuePageProps): React.JSX.Element {
  useTranslation()
  const reviewItems = useMemo(() => projectReviewQueue([...events]), [events])
  const eventById = useMemo(() => new Map(events.map((event) => [event.eventId, event])), [events])
  const summary = useMemo(() => summarizeReviewQueue(reviewItems), [reviewItems])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(reviewItems[0]?.id ?? null)

  useEffect(() => {
    if (!selectedItemId || !reviewItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(reviewItems[0]?.id ?? null)
    }
  }, [reviewItems, selectedItemId])

  if (state !== 'ready') {
    return <ReviewQueueState kind={state} errorMessage={errorMessage} />
  }

  const selectedItem = reviewItems.find((item) => item.id === selectedItemId) ?? null
  const selectedRelatedEvents =
    selectedItem?.relatedEventIds
      .map((eventId) => eventById.get(eventId))
      .filter((event): event is DevelopmentEvent => Boolean(event)) ?? []

  return (
    <main className="flex h-full min-h-0 flex-col bg-background p-5 text-foreground md:p-6">
      <header className="mb-4 flex shrink-0 items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
          <ClipboardCheck className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">
            {translate('auto.components.reviewQueue.page.title', 'DevCrew Review Queue')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate(
              'auto.components.reviewQueue.page.subtitle',
              'Human Review Compression for the work that needs judgment first.'
            )}
          </p>
        </div>
      </header>

      <section className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-4">
        <ReviewQueueMetric
          label={translate('auto.components.reviewQueue.page.total', 'Needs review')}
          value={summary.total}
        />
        <ReviewQueueMetric
          label={translate('auto.components.reviewQueue.page.urgent', 'High urgency')}
          value={summary.urgent}
        />
        <ReviewQueueMetric
          label={translate('auto.components.reviewQueue.page.blocked', 'Blocked')}
          value={summary.blocked}
        />
        <ReviewQueueMetric
          label={translate('auto.components.reviewQueue.page.failedTests', 'Failed tests')}
          value={summary.failedTests}
        />
      </section>

      <section className="mt-4 grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-lg border border-border bg-background lg:grid-cols-[minmax(22rem,0.95fr)_minmax(24rem,1.05fr)]">
        <div className="min-h-0 border-b border-border lg:border-b-0 lg:border-r">
          <ReviewQueueList
            items={reviewItems}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
          />
        </div>
        <ReviewQueueDetail item={selectedItem} relatedEvents={selectedRelatedEvents} />
      </section>
    </main>
  )
}

export default ReviewQueuePage
