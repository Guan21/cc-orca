import type { DevelopmentEvent } from '../../shared/development-event-types'
import type { ProjectSourceScope } from '../../shared/project-source/project-source-access'
import type { ProducerHandle } from './project-source-registry'

export type SourceCondition = 'loading' | 'error' | 'stale' | 'disconnected'
export type SourceLifecycle = { readonly status: SourceCondition | 'observed' }

/** Only successful current observations expose events; no wall-clock freshness is asserted. */
export type ProjectSourceSnapshot =
  | { readonly status: 'unavailable' }
  | { readonly status: SourceCondition; readonly scope: ProjectSourceScope }
  | { readonly status: 'empty'; readonly scope: ProjectSourceScope; readonly events: readonly [] }
  | {
      readonly status: 'ready'
      readonly scope: ProjectSourceScope
      readonly events: readonly DevelopmentEvent[]
    }

/** Main-private lifecycle, keyed by opaque registration incarnation, never event fields. */
export class ProjectSourceAvailability {
  private readonly states = new Map<ProducerHandle, SourceLifecycle>()

  get(handle: ProducerHandle): SourceLifecycle | undefined {
    return this.states.get(handle)
  }

  set(handle: ProducerHandle, status: SourceLifecycle['status']): void {
    this.states.set(handle, Object.freeze({ status }))
  }

  delete(handle: ProducerHandle): void {
    this.states.delete(handle)
  }

  clear(): void {
    this.states.clear()
  }
}
