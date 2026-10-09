// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { applyActivityGraphUpdate, createActivityGraph } from '../../../../shared/activity-graph/activity-graph-reducer'
import { projectDevelopmentEventToGraphUpdates } from '../../../../shared/activity-graph/development-event-to-activity-graph'
import { detectChangeImpact } from '../../../../shared/change-impact/detect-change-impact'
import { fileChangedDevelopmentEventFixture, taskLifecycleDevelopmentEventFixture } from '../../../../shared/development-event-fixtures'
import { projectActivityGraphState } from '../../../../shared/project-state/project-state'
import type { ProjectStateSnapshot } from '../../../../shared/project-state/project-state'
import type { ChangeImpactSignal } from '../../../../shared/change-impact/change-impact'
import { ProjectMapPage } from './ProjectMapPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null
async function display(snapshot?: ProjectStateSnapshot, impactSignals?: readonly ChangeImpactSignal[], state?: 'ready' | 'loading' | 'error') {
  if (!root) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }
  await act(async () => {
    root?.render(<ProjectMapPage snapshot={snapshot} impactSignals={impactSignals} state={state} />)
  })
}
const text = () => container?.textContent ?? ''
function project() {
  const events = [
    taskLifecycleDevelopmentEventFixture({
      eventId: 'task-a',
      taskId: 'a',
      projectId: 'p'
    }),
    fileChangedDevelopmentEventFixture({
      eventId: 'file-a',
      taskId: 'a',
      projectId: 'p',
      payload: { path: 'src/auth.ts', changeType: 'modified' }
    }),
    fileChangedDevelopmentEventFixture({
      eventId: 'file-b',
      taskId: 'b',
      projectId: 'p',
      payload: { path: 'src/auth.ts', changeType: 'modified' }
    })
  ]
  const graph = events.reduce((graph, event) => {
    const update = projectDevelopmentEventToGraphUpdates(event)!
    return applyActivityGraphUpdate(graph, update)
  }, createActivityGraph())
  return { snapshot: projectActivityGraphState(graph, 'p'), signals: detectChangeImpact(graph) }
}

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount())
  }
  root = null
  container?.remove()
  container = null
})

describe('Project Map v1', () => {
  it('does not present fabricated live activity when no authorized snapshot exists', async () => {
    await display()
    expect(text()).toContain('No authorized project-state source is connected')
    expect(text()).not.toContain('Started (observed)')
    await display(undefined, undefined, 'loading')
    expect(text()).toContain('Loading Project Map')
    await display(undefined, undefined, 'error')
    expect(container?.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('compresses explicit lifecycle and shows selected task evidence without asserting conflict', async () => {
    const { snapshot, signals } = project()
    await display(snapshot, signals)
    expect(text()).toContain('DevCrew Project Map')
    expect(text()).toContain('Potential file overlap (historical)')
    expect(text()).toContain('Owner, blockers, module, dependencies and next action: unavailable')
    expect(text()).toContain('task-a')
    const list = container?.querySelector('[aria-label="Project tasks"]')
    expect(list?.querySelectorAll('button')).toHaveLength(2)
    expect(text()).toContain('Historical overlap candidates')
    expect(text()).not.toContain('Confirmed merge conflict')
    const other = [...(list?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('b')
    )
    expect(other).toBeDefined()
    await act(async () => fireEvent.click(other!))
    expect(container?.querySelector('[aria-label="Task evidence"]')?.textContent).toContain('file-b')
    expect(container?.querySelector('[aria-label="Task evidence"]')?.textContent).not.toContain('task-a')
  })

  it('drops foreign-project candidates and resets effective selection after project switches', async () => {
    const { snapshot, signals } = project()
    await display(snapshot, [
      ...signals,
      {
        ...signals[0],
        signalId: 'foreign',
        projectId: 'elsewhere',
        taskIds: ['a', 'b'],
        affectedFiles: ['secret.ts'],
        evidenceRefs: ['foreign-secret'],
        taskEvidence: []
      }
    ])
    expect(text()).not.toContain('secret.ts')
    const otherProject: ProjectStateSnapshot = {
      ...snapshot,
      projectId: 'empty',
      tasks: [],
      summary: {
        total: 0, unknown: 0, started: 0, completed: 0,
        withRequestedReviews: 0, withFailedTests: 0, withFailedRuns: 0
      }
    }
    await display(otherProject, signals)
    expect(text()).toContain('No task observations are available for this project')
    expect(text()).not.toContain('Potential file overlap (historical)')
  })

  it('does not declare unknown state as success or active presence', async () => {
    const { snapshot } = project()
    await display(snapshot)
    expect(text()).toContain('Unknown')
    expect(text()).toContain('Started (observed)')
    expect(text()).not.toContain('Currently active agent')
  })
})
