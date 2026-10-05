// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  commitDevelopmentEventFixture,
  fileChangedDevelopmentEventFixture,
  taskLifecycleDevelopmentEventFixture
} from '../../../../shared/development-event-fixtures'
import type { DevelopmentEvent } from '../../../../shared/development-event-types'
import { ProjectPulsePage } from './ProjectPulsePage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

async function renderPage(props: Parameters<typeof ProjectPulsePage>[0]): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<ProjectPulsePage {...props} />)
  })
}

function text(): string {
  return container?.textContent ?? ''
}

function select(name: string): HTMLSelectElement {
  const field = container?.querySelector(`select[aria-label="${name}"]`)
  if (!(field instanceof HTMLSelectElement)) {
    throw new Error(`Missing select: ${name}`)
  }
  return field
}

function eventAt<T extends DevelopmentEvent>(event: T, occurredAt: string): T {
  return { ...event, occurredAt }
}

type AgentDevelopmentEvent = Extract<
  DevelopmentEvent,
  { eventType: 'agent.started' | 'agent.completed' | 'agent.failed' }
>

function agentDevelopmentEventFixture(
  overrides: Partial<AgentDevelopmentEvent> & Pick<AgentDevelopmentEvent, 'eventType'>
): AgentDevelopmentEvent {
  const { eventType, ...rest } = overrides
  return {
    version: 1,
    eventId: 'agent-event',
    eventType,
    occurredAt: '2026-09-30T00:00:00.000Z',
    projectId: 'project-1',
    source: 'devcrew.fixture',
    actor: { type: 'agent', id: 'agent-1', provider: 'codex' },
    payload: { agentId: 'agent-1', status: 'started' },
    ...rest
  } as AgentDevelopmentEvent
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  root = null
  container?.remove()
  container = null
})

describe('ProjectPulsePage', () => {
  it('renders DevCrew pulse counters and a chronological timeline from DevelopmentEvent fixtures', async () => {
    await renderPage({
      events: [
        eventAt(
          taskLifecycleDevelopmentEventFixture({
            eventId: 'task-started',
            eventType: 'task.started',
            taskId: '42',
            payload: { title: 'Build pulse' }
          }),
          '2026-09-30T14:22:00Z'
        ),
        eventAt(
          fileChangedDevelopmentEventFixture({
            eventId: 'file-changed',
            payload: { path: 'src/auth.ts', changeType: 'modified' }
          }),
          '2026-09-30T14:25:00Z'
        ),
        eventAt(
          commitDevelopmentEventFixture({
            eventId: 'commit-created',
            payload: { sha: 'abcdef123456', message: 'Add pulse' }
          }),
          '2026-09-30T14:31:00Z'
        )
      ]
    })

    expect(text()).toContain('DevCrew Project Pulse')
    expect(text()).toContain('Active tasks')
    expect(text()).toContain('1')
    const commitIndex = text().indexOf('Commit abcdef1 created')
    const fileIndex = text().indexOf('src/auth.ts changed')
    const taskIndex = text().indexOf('Started task #42')
    expect(commitIndex).toBeGreaterThanOrEqual(0)
    expect(commitIndex).toBeLessThan(fileIndex)
    expect(fileIndex).toBeLessThan(taskIndex)
  })

  it('filters the timeline without duplicating event state', async () => {
    await renderPage({
      events: [
        fileChangedDevelopmentEventFixture({
          eventId: 'file-changed',
          payload: { path: 'src/auth.ts', changeType: 'modified' }
        }),
        agentDevelopmentEventFixture({
          eventId: 'agent-started',
          eventType: 'agent.started',
          actor: { type: 'agent', id: 'codex-1', provider: 'codex' },
          payload: { agentId: 'codex-1', status: 'started' }
        })
      ]
    })

    await act(async () => {
      fireEvent.change(select('Filter by category'), { target: { value: 'agent' } })
    })

    expect(text()).toContain('Codex started')
    expect(text()).not.toContain('src/auth.ts changed')
  })

  it('renders empty, loading, and error states', async () => {
    await renderPage({ events: [] })
    expect(text()).toContain('No recent DevCrew activity')

    await act(async () => {
      root?.render(<ProjectPulsePage events={[]} state="loading" />)
    })
    expect(text()).toContain('Loading DevCrew activity')

    await act(async () => {
      root?.render(
        <ProjectPulsePage events={[]} state="error" errorMessage="Fixture load failed" />
      )
    })
    expect(text()).toContain('DevCrew activity is unavailable')
    expect(text()).toContain('Fixture load failed')
  })

  it('does not render raw payload metadata', async () => {
    await renderPage({
      events: [
        taskLifecycleDevelopmentEventFixture({
          eventId: 'task-started',
          payload: { title: 'Build pulse', metadata: { secret: 'raw-payload-marker' } }
        })
      ]
    })

    expect(text()).toContain('Build pulse')
    expect(text()).not.toContain('raw-payload-marker')
    expect(text()).not.toContain('"metadata"')
  })
})
