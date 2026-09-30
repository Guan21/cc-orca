import React, { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileText,
  GitCommit,
  GitPullRequest,
  Loader2,
  MessageSquare,
  SearchX,
  TestTube2
} from 'lucide-react'
import type { CircleDot } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DevelopmentEvent } from '../../../../shared/development-event-types'
import { projectPulseDemoEvents } from './project-pulse-demo-events'
import {
  filterTimelineItems,
  projectDevelopmentEventsToTimeline,
  projectPulseSummary,
  type TimelineFilters,
  type TimelineItemCategory,
  type TimelineItemStatus,
  type TimelineItemViewModel,
  type TimelineTimeWindow
} from './project-pulse-projection'

type ProjectPulsePageState = 'ready' | 'loading' | 'error'

type ProjectPulsePageProps = {
  events?: readonly DevelopmentEvent[]
  state?: ProjectPulsePageState
  errorMessage?: string
}

const CATEGORY_OPTIONS: { value: TimelineItemCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All activity' },
  { value: 'task', label: 'Tasks' },
  { value: 'agent', label: 'Agents' },
  { value: 'file', label: 'Files' },
  { value: 'commit', label: 'Commits' },
  { value: 'pull-request', label: 'Pull requests' },
  { value: 'review', label: 'Reviews' },
  { value: 'test', label: 'Tests' }
]

const TIME_WINDOW_OPTIONS: { value: TimelineTimeWindow; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7d' }
]

const statusClassName: Record<TimelineItemStatus, string> = {
  neutral: 'bg-muted text-muted-foreground',
  active: 'bg-primary/10 text-primary',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  attention: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger: 'bg-destructive/10 text-destructive'
}

const categoryIcon: Record<TimelineItemCategory, typeof CircleDot> = {
  task: CheckCircle2,
  agent: Bot,
  file: FileText,
  commit: GitCommit,
  'pull-request': GitPullRequest,
  review: MessageSquare,
  test: TestTube2
}

function PulseMetric({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-2xl font-semibold leading-none text-card-foreground">{value}</div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  )
}

function PulseSummary({ events }: { events: readonly DevelopmentEvent[] }): React.JSX.Element {
  const summary = projectPulseSummary(events)
  return (
    <section className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-5">
      <PulseMetric label="Active tasks" value={summary.activeTasks} />
      <PulseMetric label="Active agents" value={summary.activeAgents} />
      <PulseMetric label="Pending reviews" value={summary.pendingReviews} />
      <PulseMetric label="Recent failures" value={summary.recentFailures} />
      <PulseMetric label="Completed tasks" value={summary.recentlyCompletedTasks} />
    </section>
  )
}

function compactOptionValues(items: readonly (string | undefined)[]): string[] {
  return [...new Set(items.filter((item): item is string => Boolean(item)))].sort((a, b) =>
    a.localeCompare(b)
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly { value: string; label: string }[]
}): React.JSX.Element {
  return (
    <label className="flex min-w-[10rem] flex-col gap-1 text-[11px] font-medium text-muted-foreground">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function PulseFilters({
  items,
  filters,
  onFiltersChange
}: {
  items: readonly TimelineItemViewModel[]
  filters: TimelineFilters
  onFiltersChange: (filters: TimelineFilters) => void
}): React.JSX.Element {
  const actors = compactOptionValues(items.map((item) => item.actor.id))
  const tasks = compactOptionValues(items.map((item) => item.related.taskId))
  return (
    <section className="flex shrink-0 flex-wrap gap-2 border-y border-border bg-muted/20 px-4 py-3">
      <FilterSelect
        label="Filter by category"
        value={filters.category ?? 'all'}
        onChange={(category) =>
          onFiltersChange({ ...filters, category: category as TimelineItemCategory | 'all' })
        }
        options={CATEGORY_OPTIONS}
      />
      <FilterSelect
        label="Filter by actor"
        value={filters.actorId ?? 'all'}
        onChange={(actorId) => onFiltersChange({ ...filters, actorId })}
        options={[
          { value: 'all', label: 'All actors' },
          ...actors.map((id) => ({ value: id, label: id }))
        ]}
      />
      <FilterSelect
        label="Filter by task"
        value={filters.taskId ?? 'all'}
        onChange={(taskId) => onFiltersChange({ ...filters, taskId })}
        options={[
          { value: 'all', label: 'All tasks' },
          ...tasks.map((id) => ({ value: id, label: id }))
        ]}
      />
      <FilterSelect
        label="Filter by time"
        value={filters.timeWindow ?? 'all'}
        onChange={(timeWindow) =>
          onFiltersChange({ ...filters, timeWindow: timeWindow as TimelineTimeWindow })
        }
        options={TIME_WINDOW_OPTIONS}
      />
    </section>
  )
}

function TimelineRow({ item }: { item: TimelineItemViewModel }): React.JSX.Element {
  const Icon = categoryIcon[item.category]
  return (
    <li className="grid grid-cols-[3.25rem_1.75rem_minmax(0,1fr)] gap-3 border-b border-border/70 px-4 py-3 last:border-b-0">
      <time className="pt-1 font-mono text-xs text-muted-foreground">{item.timeLabel}</time>
      <div
        className={cn(
          'mt-0.5 flex size-7 items-center justify-center rounded-full',
          statusClassName[item.status]
        )}
      >
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-normal">
            {item.actor.label}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary}</p>
        {item.badges.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.badges.map((badge) => (
              <span
                key={badge}
                className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  )
}

function ActivityTimeline({
  items
}: {
  items: readonly TimelineItemViewModel[]
}): React.JSX.Element {
  if (items.length === 0) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center gap-2 text-center">
        <SearchX className="size-7 text-muted-foreground" />
        <h2 className="text-sm font-medium text-foreground">No recent DevCrew activity</h2>
        <p className="max-w-sm text-xs text-muted-foreground">
          Change the filters or connect producer integrations in a follow-up.
        </p>
      </div>
    )
  }
  return (
    <ol className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card scrollbar-sleek">
      {items.map((item) => (
        <TimelineRow key={item.eventId} item={item} />
      ))}
    </ol>
  )
}

function ProjectPulseState({
  kind,
  errorMessage
}: {
  kind: Exclude<ProjectPulsePageState, 'ready'>
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
          {isLoading ? 'Loading DevCrew activity' : 'DevCrew activity is unavailable'}
        </h1>
        {!isLoading ? (
          <p className="max-w-md text-sm text-muted-foreground">
            {errorMessage ?? 'The activity fixture collection could not be loaded.'}
          </p>
        ) : null}
      </div>
    </main>
  )
}

export function ProjectPulsePage({
  events = projectPulseDemoEvents,
  state = 'ready',
  errorMessage
}: ProjectPulsePageProps): React.JSX.Element {
  const [filters, setFilters] = useState<TimelineFilters>({ category: 'all', timeWindow: 'all' })
  const timelineItems = useMemo(() => projectDevelopmentEventsToTimeline(events), [events])
  const visibleItems = useMemo(
    () => filterTimelineItems(timelineItems, filters),
    [filters, timelineItems]
  )

  if (state !== 'ready') {
    return <ProjectPulseState kind={state} errorMessage={errorMessage} />
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-background p-5 text-foreground md:p-6">
      <header className="mb-4 flex shrink-0 items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
          <Activity className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">DevCrew Project Pulse</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent project activity projected from DevelopmentEvent v1.
          </p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <PulseSummary events={events} />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
          <PulseFilters items={timelineItems} filters={filters} onFiltersChange={setFilters} />
          <div className="min-h-0 flex-1 p-4">
            <ActivityTimeline items={visibleItems} />
          </div>
        </div>
      </div>
    </main>
  )
}

export default ProjectPulsePage
