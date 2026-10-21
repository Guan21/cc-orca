// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import SelectedPrSourcePanel from './SelectedPrSourcePanel'
import type { SelectedPrUiState } from './selected-pr-facts-view'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const HEAD = 'a'.repeat(40)
const NOW = Date.parse('2026-10-21T12:01:00Z')
let root: Root | null = null
let container: HTMLDivElement | null = null
async function render(state: SelectedPrUiState): Promise<void> {
  if (!root) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }
  await act(async () => root?.render(<SelectedPrSourcePanel state={state} />))
}
const renderedText = (): string => container?.textContent ?? ''
const ready: SelectedPrUiState = {
  status: 'ready',
  expected: {
    scope: {
      projectId: 'p',
      bindingRevision: 7,
      repository: { host: 'github.com', id: 101, owner: 'Team', name: 'service' }
    },
    prNumber: 12,
    headSha: HEAD
  },
  nowMs: NOW,
  snapshot: {
    version: 1,
    projectId: 'p',
    bindingRevision: 7,
    repository: { host: 'github.com', id: 101, owner: 'Team', name: 'service' },
    fetchedAt: '2026-10-21T12:00:00Z',
    facts: [
      { kind: 'pull_request', number: 12, headSha: HEAD, state: 'open', updatedAt: '2026-10-21T11:59:00Z' },
      { kind: 'commit', sha: HEAD },
      { kind: 'check_run', id: 50, headSha: HEAD, status: 'in_progress', conclusion: null }
    ]
  }
}
afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount())
  }
  root = null
  container?.remove()
  container = null
})
describe('B5b selected PR evidence panel', () => {
  it('shows honest default-disabled status without any mock GitHub facts', async () => {
    await render({ status: 'disabled' })
    expect(container?.querySelector('[aria-label="Selected GitHub PR evidence"]')).not.toBeNull()
    expect(container?.querySelector('[data-source-status="disabled"]')).not.toBeNull()
    expect(renderedText()).toContain('No live PR evidence')
    expect(renderedText()).not.toContain('PR #12')
    expect(container?.querySelector('[aria-label="Observed PR checks"]')).toBeNull()
  })

  it('renders only validated selected PR, commit and observed checks', async () => {
    await render(ready)
    expect(renderedText()).toContain('Team/service')
    expect(renderedText()).toContain('PR #12')
    expect(renderedText()).toContain(HEAD)
    expect(renderedText()).toContain('Check #50: in_progress')
    expect(renderedText()).toContain('not a complete CI attestation')
    expect(renderedText()).toContain('task completion')
    expect(renderedText()).not.toContain('All checks passed')
  })

  it('immediately removes old Project facts when authority or source state is withdrawn', async () => {
    await render(ready)
    expect(renderedText()).toContain('PR #12')
    for (const status of ['denied', 'stale', 'offline', 'rate_limited', 'disabled'] as const) {
      await render({ status })
      expect(container?.querySelector('[data-source-status="ready"]')).toBeNull()
      expect(renderedText()).not.toContain('Team/service')
      expect(renderedText()).not.toContain('PR #12')
      expect(renderedText()).not.toContain('Check #50')
    }
  })

  it('does not display foreign project or PR facts', async () => {
    if (ready.status !== 'ready') {
      throw new Error('test fixture')
    }
    await render({ ...ready, expected: { ...ready.expected, prNumber: 99 } })
    expect(container?.querySelector('[data-source-status="incomplete"]')).not.toBeNull()
    expect(renderedText()).not.toContain('PR #12')
  })

  it('shows unknown CI rather than success when there are no observed checks', async () => {
    if (ready.status !== 'ready') {
      throw new Error('test fixture')
    }
    const candidate = ready.snapshot as { facts: unknown[] }
    await render({ ...ready, snapshot: { ...(ready.snapshot as object), facts: candidate.facts.slice(0, 2) } })
    expect(renderedText()).toContain('CI outcome unknown')
    expect(renderedText()).not.toContain('All checks passed')
  })
})
