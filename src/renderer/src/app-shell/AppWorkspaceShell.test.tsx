// @vitest-environment happy-dom

import { act, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppWorkspaceShell } from './AppWorkspaceShell'
import type { AppChromeLayout } from './use-app-chrome-layout'
import type { FloatingWorkspacePanelState } from './use-floating-workspace-panel'

const scope = vi.hoisted(() => ({
  project: { id: 'project-a' },
  activeWorkspaceExecutionHostId: 'local'
}))

vi.mock('../store/selectors', () => ({ useActiveRepo: () => scope.project }))
vi.mock('../store', () => ({
  useAppStore: (selector: (state: typeof scope) => unknown) => selector(scope)
}))
vi.mock('../components/Sidebar', () => ({ default: () => null }))
vi.mock('../components/right-sidebar', () => ({ default: () => null }))
vi.mock('./TitlebarLeftControls', () => ({ TitlebarLeftControls: () => null }))
vi.mock('./TitlebarMainStrip', () => ({
  TitlebarMainStrip: () => null,
  RightSidebarToggle: () => null
}))
vi.mock('../components/floating-terminal/FloatingTerminalToggleButton', () => ({
  FloatingTerminalToggleButton: () => null
}))
vi.mock('../components/error-boundaries/RecoverableRenderErrorBoundary', () => ({
  RecoverableRenderErrorBoundary: ({ children }: { children: ReactNode }) => children
}))
vi.mock('../components/browser-pane/host-guest/browser-guest-paint-retention', () => ({
  useAnyBrowserGuestNeedsPaint: () => false
}))
vi.mock('../components/Terminal', () => ({
  default: function TerminalSession() {
    const [draft, setDraft] = useState('')
    return (
      <textarea
        aria-label="Agent session draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    )
  }
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

function layout(
  activeView: AppChromeLayout['activeView'],
  worktree = 'worktree-a'
): AppChromeLayout {
  return {
    activeView,
    activeWorktreeId: worktree,
    activePendingCreationId: null,
    activeTabCanExpand: false,
    effectiveActiveTabId: null,
    collapsedSidebarHeaderWidth: 0,
    creationLayoutActive: false,
    isFullScreen: false,
    leftSidebarStyle: undefined,
    leftTitlebarChromeLayout: { shouldMount: false, isFloating: false },
    rightSidebarExplorerView: 'files',
    rightSidebarOpen: false,
    rightSidebarTab: 'explorer',
    shouldMountTerminalWorkbench: true,
    showSidebar: false,
    showRightSidebarControls: false,
    showTitlebarAppName: true,
    showTitlebarExpandButton: false,
    sidebarOpen: false,
    stackedSidebarOpen: false,
    terminalWorkbenchVisible: activeView === 'terminal',
    titlebarLeftControlsRef: { current: null },
    workspaceChromeActive: activeView === 'terminal'
  }
}

const floatingWorkspace: FloatingWorkspacePanelState = {
  cancelReturnFocusFrame: () => {},
  enabled: false,
  open: false,
  openMaximized: () => {},
  setOpenWithFocus: () => {},
  shouldMountPanel: false,
  showToggleButton: false,
  tourInteractionSnapshotRef: { current: null },
  visibleTabCount: 0
}

async function navigate(view: AppChromeLayout['activeView'], worktree?: string): Promise<void> {
  await act(async () => {
    root?.render(
      <AppWorkspaceShell layout={layout(view, worktree)} floatingWorkspace={floatingWorkspace} />
    )
  })
  await act(async () => vi.dynamicImportSettled())
}

function pageText(): string {
  return container?.querySelector('main')?.textContent ?? ''
}

function expectNoDemoEvidence(): void {
  expect(pageText()).not.toMatch(/Task #42|PR #(?:85|91|93|94|96|105)|abc1234|Claude|Codex/)
  expect(pageText()).not.toMatch(/Active tasks|Active agents|Recent failures|Completed tasks/)
  expect(pageText()).not.toMatch(/Needs review|High urgency|Blocked|Failed tests|Related evidence/)
  expect(container?.querySelector('main ol')).toBeNull()
  expect(container?.querySelector('main [aria-pressed="true"]')).toBeNull()
}

beforeEach(() => {
  scope.project = { id: 'project-a' }
  scope.activeWorkspaceExecutionHostId = 'local'
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  container?.remove()
  container = null
})

describe('AppWorkspaceShell project source boundary', () => {
  it('opens Project Pulse without injecting demonstration activity or metrics', async () => {
    await navigate('activity')

    expect(pageText()).toContain('Project activity unavailable')
    expect(pageText()).toContain('No authorized project activity source is connected.')
    expectNoDemoEvidence()
  })

  it('opens Review Queue without injecting demonstration reviews or selecting evidence', async () => {
    await navigate('review')

    expect(pageText()).toContain('Review Queue source unavailable')
    expect(pageText()).toContain('No authorized project review source is connected.')
    expectNoDemoEvidence()
  })

  it('preserves Project Map source-unavailable behavior', async () => {
    await navigate('project-map')

    expect(pageText()).toContain('No authorized project-state source is connected.')
    expect(container?.querySelector('main [role="status"]')).not.toBeNull()
    expectNoDemoEvidence()
  })

  it('keeps Agent Sessions mounted across full-page navigation and back', async () => {
    await navigate('terminal')
    const draft = container?.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => fireEvent.change(draft, { target: { value: 'unsent session input' } }))

    for (const view of ['activity', 'review', 'project-map'] as const) {
      await navigate(view)
      expect(container?.querySelector('textarea')).toBe(draft)
      expect(draft.value).toBe('unsent session input')
      expect(
        draft.closest('[data-terminal-workbench-container]')?.getAttribute('aria-hidden')
      ).toBe('true')
    }

    await navigate('terminal')
    expect(container?.querySelector('textarea')).toBe(draft)
    expect(draft.value).toBe('unsent session input')
    expect(draft.closest('[data-terminal-workbench-container]')?.getAttribute('aria-hidden')).toBe(
      'false'
    )
  })

  it('keeps evidence unavailable across project, worktree, and execution-host switches', async () => {
    for (const projectId of ['project-a', 'project-b']) {
      scope.project = { id: projectId }
      scope.activeWorkspaceExecutionHostId = projectId === 'project-a' ? 'local' : 'ssh:qa'
      for (const worktreeId of ['worktree-a', 'worktree-b']) {
        for (const view of ['activity', 'review', 'project-map'] as const) {
          await navigate(view, worktreeId)
          expect(pageText()).toMatch(/No authorized.*source is connected/)
          expectNoDemoEvidence()
          expect(pageText()).not.toContain('project-a')
          expect(pageText()).not.toContain('project-b')
        }
      }
    }
  })
})
