import { AlertTriangle, CheckCircle2, CircleDot, GitPullRequest, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ReviewItem } from '../../../../shared/review-queue-types'
import {
  reviewActorLabel,
  reviewEvidenceLines,
  reviewPriorityLabel,
  reviewReasonLabel,
  reviewStateLabel,
  reviewSubjectMeta,
  reviewSubjectTitle,
  reviewTimeLabel
} from './review-queue-view-model'

const priorityClassName: Record<ReviewItem['priority'], string> = {
  low: 'border-border bg-muted text-muted-foreground',
  medium: 'border-border bg-muted text-foreground',
  high: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  critical: 'border-destructive/30 bg-destructive/10 text-destructive'
}

const stateIcon = {
  blocked: AlertTriangle,
  in_review: CircleDot,
  review_required: ShieldAlert,
  reviewed: CheckCircle2
}

export function ReviewQueueItemRow({
  item,
  selected,
  onSelect
}: {
  item: ReviewItem
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  const StateIcon = stateIcon[item.state]
  const reasons = item.reasons.slice(0, 2)
  const evidence = reviewEvidenceLines(item.evidence).slice(0, 2)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'grid w-full grid-cols-[1.5rem_minmax(0,1fr)] gap-3 border-b border-border/70 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent',
        selected && 'bg-accent text-accent-foreground'
      )}
    >
      <div className="mt-0.5 flex size-6 items-center justify-center rounded-md border border-border bg-background">
        <StateIcon className="size-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <GitPullRequest className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium text-foreground">
                {reviewSubjectTitle(item)}
              </span>
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {reviewSubjectMeta(item)}
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn('h-5 shrink-0 px-1.5 text-[11px]', priorityClassName[item.priority])}
          >
            {reviewPriorityLabel(item.priority)}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-normal">
            {reviewStateLabel(item.state)}
          </Badge>
          {reasons.map((reason) => (
            <span
              key={reason.type}
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground"
            >
              {reviewReasonLabel(reason)}
            </span>
          ))}
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="truncate">{reviewActorLabel(item)}</span>
          {item.taskId ? <span className="truncate">{item.taskId}</span> : null}
          {evidence.map((line) => (
            <span key={line} className="truncate">
              {line}
            </span>
          ))}
          <time className="font-mono">{reviewTimeLabel(item.lastUpdatedAt)}</time>
        </div>
      </div>
    </button>
  )
}
