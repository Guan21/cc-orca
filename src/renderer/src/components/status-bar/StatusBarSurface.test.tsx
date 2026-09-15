// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSkillUpdateRun } from '../skills/skill-update-run-store'
import { StatusBarSurface } from './StatusBarSurface'

const mocks = vi.hoisted(() => ({
  useStatusBarController: vi.fn(),
  useSkillUpdateRun: vi.fn(() => ({ state: 'idle' }))
}))

vi.mock('./use-status-bar-controller', () => ({
  useStatusBarController: mocks.useStatusBarController
}))

vi.mock('../skills/skill-update-run-store', () => ({
  useSkillUpdateRun: mocks.useSkillUpdateRun
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/floating-terminal/FloatingTerminalIconContextMenu', () => ({
  FloatingTerminalIconContextMenu: ({ children }: { children?: ReactNode }) => <>{children}</>
}))

vi.mock('@/lib/desktop-window-chrome', () => ({
  isPairedWebClientWindow: () => false
}))

vi.mock('./CaffeinateStatusSegment', () => ({
  CaffeinateStatusSegment: () => <div data-testid="caffeinate-status" />
}))

vi.mock('./RemoteServerUpdateStatusSegment', () => ({
  RemoteServerUpdateStatusSegment: () => <div data-testid="remote-server-update-status" />
}))

vi.mock('./UpdateStatusSegment', () => ({
  UpdateStatusSegment: () => <div data-testid="app-update-status" />
}))

vi.mock('./StatusBarVisibilityMenu', () => ({
  StatusBarVisibilityMenu: () => null
}))

function createStatusBarController() {
  return {
    anyFetching: false,
    anyVisible: false,
    compact: false,
    containerRefCallback: vi.fn(),
    floatingTerminalActionLabel: 'Show Floating Workspace',
    floatingTerminalShortcut: 'Ctrl+Space',
    handleManageAccounts: vi.fn(),
    handleOpenProviderAccounts: vi.fn(),
    handleRefresh: vi.fn(),
    handleUsageDetails: vi.fn(),
    handleUsageMenuOpenChange: vi.fn(),
    hasVisibleUsageMeters: false,
    iconOnly: false,
    isEmptyUsageState: false,
    isRefreshing: false,
    petEnabled: false,
    rosterProviders: [],
    setMenuOpen: vi.fn(),
    setMenuPoint: vi.fn(),
    setStatusBarUsageMode: vi.fn(),
    showEmptyUsageCta: false,
    showFloatingTerminalToggle: false,
    showFloatingWorkspaceAttentionDot: false,
    showPorts: false,
    showResourceUsage: false,
    showSsh: false,
    statusBarUsageMode: 'tokens',
    usageMenuFocusHandoff: {
      onCloseAutoFocus: vi.fn(),
      onPointerDownOutside: vi.fn()
    },
    usageMenuOpen: false,
    usagePercentageDisplay: 'used'
  }
}

describe('StatusBarSurface Skills update segment', () => {
  beforeEach(() => {
    delete globalThis.__ORCA_BUILD_PROFILE__
    mocks.useStatusBarController.mockReturnValue(createStatusBarController())
    mocks.useSkillUpdateRun.mockClear()
  })

  afterEach(() => {
    cleanup()
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  it('initializes the Skills update segment for the default build', () => {
    render(<StatusBarSurface floatingTerminalOpen={false} />)

    expect(useSkillUpdateRun).toHaveBeenCalledOnce()
  })

  it('does not initialize the Skills update segment in corporate builds', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    const { getByTestId } = render(<StatusBarSurface floatingTerminalOpen={false} />)

    expect(getByTestId('app-update-status')).not.toBeNull()
    expect(useSkillUpdateRun).not.toHaveBeenCalled()
  })
})
