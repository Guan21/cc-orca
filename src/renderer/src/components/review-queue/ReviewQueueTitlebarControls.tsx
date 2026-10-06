import { ArrowLeft, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

export function ReviewQueueTitlebarControls(): React.JSX.Element {
  const closeReviewQueuePage = useAppStore((s) => s.closeReviewQueuePage)

  return (
    <div className="flex h-full min-w-0 flex-1 items-center gap-3 border-l border-border px-3">
      <div
        className="flex min-w-0 items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={closeReviewQueuePage}
              aria-label={translate(
                'auto.components.reviewQueue.titlebar.close',
                'Close DevCrew Review Queue'
              )}
            >
              <ArrowLeft className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.reviewQueue.titlebar.close', 'Close DevCrew Review Queue')}
          </TooltipContent>
        </Tooltip>
        <ClipboardCheck className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-medium">
          {translate('auto.components.reviewQueue.titlebar.title', 'DevCrew Review Queue')}
        </span>
      </div>
    </div>
  )
}
