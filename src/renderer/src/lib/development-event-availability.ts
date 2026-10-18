import type { DevelopmentEvent } from '../../../shared/development-event-types'

// Callers must authorize the source before supplying events; this is a renderer boundary only.
export type DevelopmentEventSourceProps = (
  | { state?: 'ready'; events: readonly DevelopmentEvent[] }
  | { state?: 'unavailable'; events?: never }
  | { state: 'loading' | 'error'; events?: readonly DevelopmentEvent[] }
) & { errorMessage?: string }

export type DevelopmentEventAvailability = 'unavailable' | 'loading' | 'ready' | 'empty' | 'error'

export const NO_DEVELOPMENT_EVENTS: readonly DevelopmentEvent[] = []

export function developmentEventAvailability({
  events,
  state
}: DevelopmentEventSourceProps): DevelopmentEventAvailability {
  if (state === 'loading' || state === 'error') {
    return state
  }
  if (state === 'unavailable' || events === undefined) {
    return 'unavailable'
  }
  return events.length === 0 ? 'empty' : 'ready'
}
