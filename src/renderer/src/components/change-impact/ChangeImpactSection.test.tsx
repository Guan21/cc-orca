// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import {
  activityGraphEdgeId,
  activityGraphNodeId
} from '../../../../shared/activity-graph/activity-graph-identities'
import type { ChangeImpactSignal } from '../../../../shared/change-impact/change-impact'
import { ChangeImpactSection } from './ChangeImpactSection'

afterEach(cleanup)

function signal(path: string, projectId = 'p'): ChangeImpactSignal {
  const fileNodeId = activityGraphNodeId(projectId, 'file', path)
  return {
    signalId: ['change-impact', 'v1', projectId, 'potential_file_overlap', path]
      .map(encodeURIComponent)
      .join(':'),
    projectId,
    signalType: 'potential_file_overlap',
    affectedFiles: [path],
    taskIds: ['123', '136'],
    evidenceRefs: ['shared-node-secret'],
    explanation: 'raw-prompt-secret',
    taskEvidence: ['123', '136'].map((taskId) => {
      const taskNodeId = activityGraphNodeId(projectId, 'task', taskId)
      return {
        taskId,
        taskNodeId,
        fileNodeId,
        relationshipIds: [activityGraphEdgeId(projectId, 'CHANGED', taskNodeId, fileNodeId)],
        evidenceRefs: [`event-${taskId}`]
      }
    })
  }
}

describe('ChangeImpactSection', () => {
  it('selects candidates with Tab, Enter and Space and displays independent evidence', async () => {
    const user = userEvent.setup()
    render(<ChangeImpactSection projectId="p" signals={[signal('src/z.ts'), signal('src/a.ts')]} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    await user.tab()
    expect(document.activeElement).toBe(buttons[0])
    await user.keyboard('{Enter}')
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true')
    await user.tab()
    await user.keyboard(' ')
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true')
    const detail = screen.getByRole('region', { name: 'Selected change impact' })
    expect(within(detail).getByText('src/z.ts')).toBeTruthy()
    const tasks = within(detail)
      .getAllByRole('listitem')
      .filter((item) => item.textContent?.includes('Task '))
    expect(tasks[0].textContent).toContain('event-123')
    expect(tasks[0].textContent).not.toContain('event-136')
    expect(tasks[1].textContent).toContain('event-136')
    expect(detail.textContent).toContain('does not establish')
    expect(detail.textContent).toContain('Historical')
    expect(detail.textContent).toContain('Unknown')
  })

  it('shows no foreign project or raw payloads and offers no decision controls', () => {
    const { container } = render(
      <ChangeImpactSection
        projectId="p"
        signals={[signal('src/a.ts'), signal('foreign-secret.ts', 'foreign')]}
      />
    )
    expect(container.textContent).not.toMatch(/foreign-secret|raw-prompt-secret|shared-node-secret/)
    expect(container.querySelector('a, script, iframe')).toBeNull()
    expect(screen.queryByRole('button', { name: /dismiss|acknowledge|notify/i })).toBeNull()
  })

  it('resets selection across projects and removes withdrawn observations', async () => {
    const user = userEvent.setup()
    const view = render(
      <ChangeImpactSection projectId="p" signals={[signal('src/a.ts'), signal('src/z.ts')]} />
    )
    await user.click(screen.getAllByRole('button')[1])
    view.rerender(<ChangeImpactSection projectId="other" signals={[signal('other.ts', 'other')]} />)
    expect(screen.getByRole('region', { name: 'Selected change impact' }).textContent).toContain(
      'other.ts'
    )
    expect(view.container.textContent).not.toContain('src/z.ts')
    view.rerender(<ChangeImpactSection projectId="other" signals={[]} />)
    expect(screen.queryByRole('region', { name: 'Selected change impact' })).toBeNull()
    expect(view.container.textContent).toContain('No supported overlap observations')
  })

  it('reveals new evidence under the same signal identity', () => {
    const original = signal('src/a.ts')
    const view = render(<ChangeImpactSection projectId="p" signals={[original]} />)
    const next = structuredClone(original)
    next.taskEvidence[0].evidenceRefs.push('new-observation')
    view.rerender(<ChangeImpactSection projectId="p" signals={[next]} />)
    expect(view.container.textContent).toContain('new-observation')
  })
})
