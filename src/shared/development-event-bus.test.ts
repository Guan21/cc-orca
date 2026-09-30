import { describe, expect, it, vi } from 'vitest'
import { createInMemoryDevelopmentEventBus } from './development-event-bus'
import {
  commitDevelopmentEventFixture,
  taskLifecycleDevelopmentEventFixture
} from './development-event-fixtures'

describe('InMemoryDevelopmentEventBus', () => {
  it('validates producer input before publishing to consumers', () => {
    const bus = createInMemoryDevelopmentEventBus()
    const listener = vi.fn()

    bus.subscribe(listener)

    expect(() =>
      bus.emit({ ...taskLifecycleDevelopmentEventFixture(), eventType: 'timeline.created' })
    ).toThrow('Invalid DevelopmentEvent v1')
    expect(listener).not.toHaveBeenCalled()
  })

  it('fans out events to current subscribers in emit order', () => {
    const bus = createInMemoryDevelopmentEventBus()
    const first = vi.fn()
    const second = vi.fn()
    const task = taskLifecycleDevelopmentEventFixture()
    const commit = commitDevelopmentEventFixture()

    bus.subscribe(first)
    const unsubscribeSecond = bus.subscribe(second)

    bus.emit(task)
    unsubscribeSecond()
    bus.emit(commit)

    expect(first.mock.calls.map(([event]) => event.eventId)).toEqual([task.eventId, commit.eventId])
    expect(second.mock.calls.map(([event]) => event.eventId)).toEqual([task.eventId])
  })
})
