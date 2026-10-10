// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyActivityGraphUpdate,
  createActivityGraph
} from '../../../../shared/activity-graph/activity-graph-reducer'
import { projectDevelopmentEventToGraphUpdates } from '../../../../shared/activity-graph/development-event-to-activity-graph'
import { detectChangeImpact } from '../../../../shared/change-impact/detect-change-impact'
import {
  fileChangedDevelopmentEventFixture,
  taskLifecycleDevelopmentEventFixture
} from '../../../../shared/development-event-fixtures'
import { projectActivityGraphState } from '../../../../shared/project-state/project-state'
import type { ProjectStateSnapshot } from '../../../../shared/project-state/project-state'
import type { ChangeImpactSignal } from '../../../../shared/change-impact/change-impact'
import { ProjectMapPage } from './ProjectMapPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null
async function display(
  snapshot?: ProjectStateSnapshot,
  impactSignals?: readonly ChangeImpactSignal[],
  state?: 'ready' | 'loading' | 'error',
  projectId?: string,
  errorMessage?: string
) {
  if (!root) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }
  await act(async () => {
    root?.render(
      <ProjectMapPage
        snapshot={snapshot}
        impactSignals={impactSignals}
        state={state}
        projectId={projectId}
        errorMessage={errorMessage}
      />
    )
  })
}
const text = () => container?.textContent ?? ''
function project(withIndependentOverlap = false) {
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
  if (withIndependentOverlap) {
    events.push(
      fileChangedDevelopmentEventFixture({
        eventId: 'file-c',
        taskId: 'c',
        projectId: 'p',
        payload: { path: 'src/other.ts', changeType: 'modified' }
      }),
      fileChangedDevelopmentEventFixture({
        eventId: 'file-d',
        taskId: 'd',
        projectId: 'p',
        payload: { path: 'src/other.ts', changeType: 'modified' }
      }),
      taskLifecycleDevelopmentEventFixture({
        eventId: 'task-e',
        taskId: 'e',
        projectId: 'p'
      })
    )
  }
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
  it('hides prior observations when an error has an empty source message', async () => {
    const { snapshot } = project()
    await display(snapshot, undefined, 'error', undefined, '')
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded')
    expect(container?.querySelector('[aria-label="Task evidence"]')).toBeNull()
    expect(text()).not.toContain('src/auth.ts')
  })

  it('rejects a stale snapshot for a selected project and mixed-project tasks', async () => {
    const { snapshot, signals } = project()
    await display(snapshot, signals, 'ready', 'different-project')
    expect(text()).toContain('No authorized project-state source is connected')
    expect(text()).not.toContain('src/auth.ts')
    await display({ ...snapshot, tasks: [{ ...snapshot.tasks[0], projectId: 'foreign' }] })
    expect(text()).toContain('No authorized project-state source is connected')
    expect(text()).not.toContain('task-a')
  })

  it('shows engine summary values with task-count semantics and detailed observations', async () => {
    const { snapshot } = project()
    snapshot.tasks[0] = {
      ...snapshot.tasks[0],
      lifecycle: 'completed',
      runs: [
        {
          runId: 'run-observed',
          status: 'failed',
          agentNodeIds: ['agent-observed'],
          evidenceRefs: ['run-proof']
        }
      ],
      testResults: { passed: 2, failed: 3, skipped: 1 },
      reviews: { requested: 2, completed: 1 }
    }
    snapshot.summary = {
      total: 2,
      started: 0,
      completed: 1,
      unknown: 1,
      withFailedRuns: 1,
      withFailedTests: 1,
      withRequestedReviews: 1
    }
    await display(snapshot)
    const overview = container?.querySelector('[aria-label="Project overview"]')
    expect(overview?.textContent).toContain('Completed (observed)')
    expect(overview?.textContent).toContain('Tasks with observed failed runs')
    expect(overview?.textContent).toContain('Tasks with observed failed tests')
    expect(overview?.textContent).toContain('Tasks with pending review observations')
    const detail = container?.querySelector('[aria-label="Task evidence"]')?.textContent
    expect(detail).toContain('run-observed')
    expect(detail).toContain('Failed (observed)')
    expect(detail).toContain('agent-observed')
    expect(detail).toContain('run-proof')
    expect(detail).toContain('Passed: 2')
    expect(detail).toContain('Failed: 3')
    expect(detail).toContain('Skipped: 1')
    expect(detail).toContain('Requested: 2')
    expect(detail).toContain('Completed: 1')
    expect(container?.querySelector('[aria-label="Project tasks"]')?.textContent).toContain(
      'Last recorded observation'
    )
  })

  it('distinguishes absent observations and retains selection through snapshot refresh', async () => {
    const { snapshot } = project()
    snapshot.tasks[1] = { ...snapshot.tasks[1], runs: [] }
    await display(snapshot)
    const buttons = container!.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Project tasks"] button'
    )
    await act(async () => {
      fireEvent.click(buttons[1])
    })
    await display({ ...snapshot, tasks: [...snapshot.tasks] })
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true')
    const detail = container!.querySelector('[aria-label="Task evidence"]')!
    expect(detail.querySelector('h2')?.textContent).toBe('b')
    expect(detail.textContent).toContain('No supported run observation')
    expect(detail.textContent).toContain('No supported test observation')
    expect(detail.textContent).toContain('No supported review observation')
    await display(snapshot, undefined, 'loading')
    expect(container!.querySelector('[aria-label="Task evidence"]')).toBeNull()
    await display(snapshot, undefined, 'error')
    expect(container!.querySelector('[aria-label="Task evidence"]')).toBeNull()
    const foreign = {
      ...snapshot,
      projectId: 'other',
      tasks: snapshot.tasks.map((task) => ({ ...task, projectId: 'other' }))
    }
    await display(foreign)
    expect(container!.querySelector('[aria-label="Task evidence"] h2')?.textContent).toBe('a')
  })

  it('supports native keyboard task selection and evidence expansion', async () => {
    const { snapshot } = project()
    await display(snapshot)
    const user = userEvent.setup()
    const buttons = container!.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Project tasks"] button'
    )
    await act(async () => {
      await user.tab()
      await user.tab()
      await user.keyboard('{Enter}')
    })
    expect(document.activeElement).toBe(buttons[1])
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true')
    expect(container!.querySelector('[aria-label="Task evidence"] h2')?.textContent).toBe('b')
    const evidence = container!.querySelector<HTMLElement>('[aria-label="Task evidence"] summary')!
    evidence.focus()
    expect(document.activeElement).toBe(evidence)
  })

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
    expect(text()).toContain('Potential file overlap')
    expect(container?.querySelectorAll('section[aria-labelledby]')).toHaveLength(1)
    const impactDetail = container?.querySelector('[aria-label="Selected change impact"]')
    expect(impactDetail?.textContent).toContain('file-a')
    expect(impactDetail?.textContent).toContain('file-b')
    expect(impactDetail?.textContent).not.toContain('task-a')
    expect(text()).toContain('Owner, blockers, module, dependencies and next action: unavailable')
    expect(text()).toContain('task-a')
    const list = container?.querySelector('[aria-label="Project tasks"]')
    expect(list?.querySelectorAll('button')).toHaveLength(2)
    expect(text()).toContain('Potential file overlap')
    expect(text()).not.toContain('Confirmed merge conflict')
    const other = [...(list?.querySelectorAll('button') ?? [])].find(
      (button) => button.querySelector('span')?.textContent === 'b'
    )
    expect(other).toBeDefined()
    await act(async () => {
      fireEvent.click(other!)
    })
    expect(container?.querySelector('[aria-label="Task evidence"]')?.textContent).toContain(
      'file-b'
    )
    expect(container?.querySelector('[aria-label="Task evidence"]')?.textContent).not.toContain(
      'task-a'
    )
  })

  it('shows only impact involving the selected task and hides unrelated candidates', async () => {
    const { snapshot, signals } = project(true)
    expect(signals).toHaveLength(2)
    await display(snapshot, signals)
    const detail = () => container?.querySelector('[aria-label="Task evidence"]')?.textContent ?? ''
    expect(detail()).toContain('src/auth.ts')
    expect(detail()).not.toContain('src/other.ts')
    const selectTask = async (id: string) => {
      const list = container?.querySelector('[aria-label="Project tasks"]')
      const button = [...(list?.querySelectorAll('button') ?? [])].find(
        (item) => item.querySelector('span')?.textContent === id
      )
      expect(button).toBeDefined()
      await act(async () => {
        fireEvent.click(button!)
      })
    }
    await selectTask('c')
    expect(detail()).toContain('src/other.ts')
    expect(detail()).not.toContain('src/auth.ts')
    expect(detail()).toContain('file-c')
    expect(detail()).toContain('file-d')
    await selectTask('e')
    expect(detail()).not.toContain('Potential file overlap')
    expect(container?.querySelector('[aria-label="Selected change impact"]')).toBeNull()
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
        total: 0,
        unknown: 0,
        started: 0,
        completed: 0,
        withRequestedReviews: 0,
        withFailedTests: 0,
        withFailedRuns: 0
      }
    }
    await display(otherProject, signals)
    expect(text()).toContain('No task observations are available for this project')
    expect(text()).not.toContain('Potential file overlap')
  })

  it('does not declare unknown state as success or active presence', async () => {
    const { snapshot } = project()
    await display(snapshot)
    expect(text()).toContain('Unknown')
    expect(text()).toContain('Started (observed)')
    expect(text()).not.toContain('Currently active agent')
  })
})
