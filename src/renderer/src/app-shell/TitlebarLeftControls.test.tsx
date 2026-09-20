// @vitest-environment happy-dom

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TitlebarLeftControls } from './TitlebarLeftControls'
import type { AppChromeLayout } from './use-app-chrome-layout'

const mocks = vi.hoisted(() => ({
  toggleSidebar: vi.fn(),
  updateSettings: vi.fn()
}))

vi.mock('./app-window-chrome', () => ({
  hasCustomTitleBar: true,
  isMac: false
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      toggleSidebar: mocks.toggleSidebar,
      updateSettings: mocks.updateSettings
    })
}))

vi.mock('@/store/slices/worktree-nav-history', () => ({
  canGoBackWorktreeHistory: () => false,
  canGoForwardWorktreeHistory: () => false
}))

vi.mock('../hooks/useShortcutLabel', () => ({
  useShortcutLabel: () => 'Ctrl+B'
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

function layout(overrides: Partial<AppChromeLayout> = {}): AppChromeLayout {
  return {
    activeView: 'terminal',
    activeWorktreeId: 'worktree-1',
    activePendingCreationId: null,
    activeTabCanExpand: false,
    collapsedSidebarHeaderWidth: 0,
    creationLayoutActive: false,
    effectiveActiveTabId: 'tab-1',
    isFullScreen: false,
    leftSidebarStyle: undefined,
    leftTitlebarChromeLayout: { isFloating: false, shouldMount: true },
    rightSidebarExplorerView: 'files',
    rightSidebarOpen: false,
    rightSidebarTab: 'files',
    shouldMountTerminalWorkbench: true,
    showRightSidebarControls: true,
    showSidebar: true,
    showTitlebarAppName: true,
    showTitlebarExpandButton: false,
    sidebarOpen: true,
    stackedSidebarOpen: false,
    terminalWorkbenchVisible: true,
    titlebarLeftControlsRef: { current: null },
    workspaceChromeActive: true,
    ...overrides
  } as AppChromeLayout
}

describe('TitlebarLeftControls', () => {
  beforeEach(() => {
    delete globalThis.__ORCA_BUILD_PROFILE__
    vi.clearAllMocks()
    Object.assign(window, { api: { ui: { popupMenu: vi.fn() } } })
  })

  it('keeps default custom chrome on Orca branding', () => {
    const html = renderToStaticMarkup(<TitlebarLeftControls layout={layout()} />)

    expect(html).not.toContain('Secure Orca Lite')
    expect(html).toContain('Application menu')
  })

  it('shows Secure Orca Lite in corporate custom chrome', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    const html = renderToStaticMarkup(<TitlebarLeftControls layout={layout()} />)

    expect(html).toContain('Secure Orca Lite')
  })
})
