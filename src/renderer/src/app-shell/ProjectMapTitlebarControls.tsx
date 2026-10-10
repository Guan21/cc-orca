import { ArrowLeft, FolderKanban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useActiveRepo } from '@/store/selectors'

export function ProjectMapTitlebarControls(): React.JSX.Element {
  const closeProjectMapPage = useAppStore((state) => state.closeProjectMapPage)
  const project = useActiveRepo()

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
              onClick={closeProjectMapPage}
              aria-label={translate(
                'auto.components.projectMap.titlebar.close',
                'Close DevCrew Project Map'
              )}
            >
              <ArrowLeft className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.projectMap.titlebar.close', 'Close DevCrew Project Map')}
          </TooltipContent>
        </Tooltip>
        <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-medium">
          {translate('auto.components.projectMap.titlebar.title', 'DevCrew Project Map')}
        </span>
        <span className="truncate text-xs text-muted-foreground">{project?.displayName}</span>
      </div>
    </div>
  )
}
