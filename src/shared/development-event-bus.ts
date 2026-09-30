import { assertDevelopmentEvent } from './development-event-schema'
import type {
  DevelopmentEvent,
  DevelopmentEventCallback,
  DevelopmentEventConsumer,
  DevelopmentEventProducer
} from './development-event-types'

export type InMemoryDevelopmentEventBus = DevelopmentEventProducer &
  DevelopmentEventConsumer & {
    subscriberCount(): number
  }

export function createInMemoryDevelopmentEventBus(): InMemoryDevelopmentEventBus {
  const callbacks = new Set<DevelopmentEventCallback>()

  return {
    emit: (rawEvent: unknown): DevelopmentEvent => {
      const event = assertDevelopmentEvent(rawEvent)
      for (const callback of callbacks) {
        callback(event)
      }
      return event
    },
    subscribe: (callback: DevelopmentEventCallback): (() => void) => {
      callbacks.add(callback)
      return () => {
        callbacks.delete(callback)
      }
    },
    subscriberCount: () => callbacks.size
  }
}
