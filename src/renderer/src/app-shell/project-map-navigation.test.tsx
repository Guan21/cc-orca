// @vitest-environment happy-dom

import { act, useEffect, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import { AppWorkspaceShell } from './AppWorkspaceShell'
import type { AppChromeLayout } from './use-app-chrome-layout'
import type { FloatingWorkspacePanelState } from './use-floating-workspace-panel'

const mocks = vi.hoisted(() => ({
  project: null as Repo | null,
  hostId: 'local',
  terminalMounts: 0,
  terminalUnmounts: 0,
  pageProps: vi.fn()
}))

vi.mock('../store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ activeWorkspaceExecutionHostId: mocks.hostId })
}))
vi.mock('../store/selectors', () => ({ useActiveRepo: () => mocks.project }))
vi.mock('./TitlebarLeftControls', () => ({ TitlebarLeftControls: () => null }))
vi.mock('./TitlebarMainStrip', () => ({
  TitlebarMainStrip: () => null,
  RightSidebarToggle: () => null
}))
vi.mock('../components/Sidebar', () => ({ default: () => null }))
vi.mock('../components/right-sidebar', () => ({ default: () => null }))
vi.mock('../components/floating-terminal/FloatingTerminalToggleButton', () => ({
  FloatingTerminalToggleButton: () => null
}))
vi.mock('../components/error-boundaries/RecoverableRenderErrorBoundary', () => ({
  RecoverableRenderErrorBoundary: ({ children }: { children: ReactNode }) => children
}))
vi.mock('../components/TerminalWorkbenchContainer', () => ({
  TerminalWorkbenchContainer: ({
    children,
    isVisible
  }: {
    children: ReactNode
    isVisible: boolean
  }) => (
    <div data-terminal-workbench-container="" hidden={!isVisible}>
      {children}
    </div>
  )
}))
vi.mock('../components/Terminal', () => ({
  default: function Terminal() {
    useEffect(() => {
      mocks.terminalMounts++
      return () => {
        mocks.terminalUnmounts++
      }
    }, [])
    return <div data-agent-session="">Active Agent Session</div>
  }
}))
vi.mock('../components/project-map/ProjectMapPage', () => ({
  default: function ProjectMapPage(props: unknown) {
    mocks.pageProps(props)
    const [selected, setSelected] = useState(false)
    return (
      <button type="button" onClick={() => setSelected(true)}>
        {selected ? 'Selected task' : 'Unavailable source'}
      </button>
    )
  }
}))

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.project = { id: 'project-1', displayName: 'One', kind: 'folder' } as Repo
  mocks.hostId = 'local'
  mocks.terminalMounts = 0
  mocks.terminalUnmounts = 0
  mocks.pageProps.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function renderView(activeView: AppChromeLayout['activeView']): Promise<void> {
  const layout = {
    activeView,
    activeWorktreeId: 'wt-1',
    activePendingCreationId: null,
    creationLayoutActive: false,
    leftTitlebarChromeLayout: { shouldMount: false },
    showSidebar: false,
    stackedSidebarOpen: false,
    showRightSidebarControls: false,
    workspaceChromeActive: activeView === 'terminal',
    shouldMountTerminalWorkbench: true,
    terminalWorkbenchVisible: activeView === 'terminal',
    rightSidebarOpen: false
  } as AppChromeLayout
  await act(async () =>
    root.render(
      <AppWorkspaceShell
        layout={layout}
        floatingWorkspace={{ showToggleButton: false } as FloatingWorkspacePanelState}
      />
    )
  )
}

describe('Project Map desktop navigation', () => {
  it('keeps the Agent Session mounted while visiting and leaving Project Map', async () => {
    await renderView('terminal')
    await waitFor(() => expect(container.textContent).toContain('Active Agent Session'))
    await renderView('project-map')
    await waitFor(() => expect(container.textContent).toContain('Unavailable source'))
    expect(
      container.querySelector('[data-terminal-workbench-container]')?.hasAttribute('hidden')
    ).toBe(true)
    await renderView('terminal')
    expect(mocks.terminalMounts).toBe(1)
    expect(mocks.terminalUnmounts).toBe(0)
    expect(
      container.querySelector('[data-terminal-workbench-container]')?.hasAttribute('hidden')
    ).toBe(false)
  })

  it('clears page selection on project and execution-host switches and supplies no live snapshot', async () => {
    await renderView('project-map')
    await waitFor(() => expect(container.textContent).toContain('Unavailable source'))
    await act(async () => container.querySelector('button')?.click())
    expect(container.textContent).toContain('Selected task')

    mocks.project = { ...mocks.project!, id: 'project-2' }
    await renderView('project-map')
    expect(container.textContent).toContain('Unavailable source')
    await act(async () => container.querySelector('button')?.click())
    mocks.hostId = 'ssh:host-2'
    await renderView('project-map')
    expect(container.textContent).toContain('Unavailable source')
    expect(mocks.pageProps.mock.calls.every(([props]) => !('snapshot' in props))).toBe(true)
    expect(mocks.pageProps).toHaveBeenLastCalledWith({ projectId: 'project-2' })
    expect(mocks.terminalMounts).toBe(1)
    expect(mocks.terminalUnmounts).toBe(0)
  })
})
