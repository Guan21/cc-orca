import { SearchX } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { ReviewItem } from '../../../../shared/review-queue-types'
import { ReviewQueueItemRow } from './ReviewQueueItemRow'

export function ReviewQueueList({
  items,
  selectedItemId,
  onSelectItem
}: {
  items: readonly ReviewItem[]
  selectedItemId: string | null
  onSelectItem: (id: string) => void
}): React.JSX.Element {
  if (items.length === 0) {
    return (
      <div className="flex min-h-[18rem] flex-col items-center justify-center gap-2 p-6 text-center">
        <SearchX className="size-7 text-muted-foreground" />
        <h2 className="text-sm font-medium text-foreground">
          {translate('auto.components.reviewQueue.empty.title', 'Nothing needs review')}
        </h2>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">
          {translate(
            'auto.components.reviewQueue.empty.description',
            'When DevelopmentEvents contain pull requests, review requests, failures, or sensitive changes, they will appear here for human review.'
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-0 overflow-auto scrollbar-sleek">
      {items.map((item) => (
        <ReviewQueueItemRow
          key={item.id}
          item={item}
          selected={item.id === selectedItemId}
          onSelect={() => onSelectItem(item.id)}
        />
      ))}
    </div>
  )
}
