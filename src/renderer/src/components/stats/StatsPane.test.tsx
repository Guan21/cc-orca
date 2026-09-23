// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '../../store'

const storeMocks = vi.hoisted(() => ({
  fetchStatsSummary: vi.fn(),
  fetchClaudeUsage: vi.fn(),
  fetchCodexUsage: vi.fn(),
  fetchOpenCodeUsage: vi.fn(),
  refreshClaudeUsage: vi.fn(),
  refreshCodexUsage: vi.fn(),
  refreshOpenCodeUsage: vi.fn(),
  enableClaudeUsage: vi.fn(),
  enableCodexUsage: vi.fn(),
  enableOpenCodeUsage: vi.fn(),
  recordFeatureInteraction: vi.fn()
}))

const disabledScanState = {
  enabled: false,
  isScanning: false,
  lastScanStartedAt: null,
  lastScanCompletedAt: null,
  lastScanError: null
}

const mockStoreState = {
  statsSummary: null,
  claudeUsageScanState: { ...disabledScanState, hasAnyClaudeData: false },
  claudeUsageSummary: null,
  claudeUsageDaily: [],
  codexUsageScanState: { ...disabledScanState, hasAnyCodexData: false },
  codexUsageSummary: null,
  codexUsageDaily: [],
  openCodeUsageScanState: { ...disabledScanState, hasAnyOpenCodeData: false },
  openCodeUsageSummary: null,
  openCodeUsageDaily: [],
  fetchStatsSummary: storeMocks.fetchStatsSummary,
  fetchClaudeUsage: storeMocks.fetchClaudeUsage,
  fetchCodexUsage: storeMocks.fetchCodexUsage,
  fetchOpenCodeUsage: storeMocks.fetchOpenCodeUsage,
  refreshClaudeUsage: storeMocks.refreshClaudeUsage,
  refreshCodexUsage: storeMocks.refreshCodexUsage,
  refreshOpenCodeUsage: storeMocks.refreshOpenCodeUsage,
  enableClaudeUsage: storeMocks.enableClaudeUsage,
  enableCodexUsage: storeMocks.enableCodexUsage,
  enableOpenCodeUsage: storeMocks.enableOpenCodeUsage,
  recordFeatureInteraction: storeMocks.recordFeatureInteraction
} satisfies Partial<AppState>

vi.mock('../../store', () => ({
  useAppStore: Object.assign(
    (selector: (state: Partial<AppState>) => unknown) => selector(mockStoreState),
    {
      getState: () => mockStoreState
    }
  )
}))

vi.mock('../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('@/i18n/i18n', () => ({
  getIntlLocale: () => 'en-US',
  i18n: { language: 'en' },
  translate: (_key: string, fallback: string, values?: Record<string, string>) =>
    values
      ? Object.entries(values).reduce(
          (text, [token, value]) => text.replace(`{{${token}}}`, value),
          fallback
        )
      : fallback
}))

import { StatsPane } from './StatsPane'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  delete globalThis.__ORCA_BUILD_PROFILE__
})

describe('StatsPane provider policy', () => {
  it('hides unsupported usage providers and OpenCode controls in corporate builds', async () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'
    const user = userEvent.setup()

    render(<StatsPane />)

    expect(screen.getByRole('button', { name: 'Enable Claude' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enable Codex' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enable OpenCode' })).not.toBeInTheDocument()
    expect(screen.queryByText('OpenCode')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Usage analytics provider:/ }))
    const menu = screen.getByRole('menu')

    expect(within(menu).getByRole('menuitem', { name: 'Claude Code' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Codex' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'OpenCode' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Grok' })).not.toBeInTheDocument()
  })

  it('keeps default OpenCode Stats & Usage controls available', async () => {
    const user = userEvent.setup()

    render(<StatsPane />)

    expect(screen.getByRole('button', { name: 'Enable OpenCode' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Usage analytics provider:/ }))
    expect(screen.getByRole('menuitem', { name: 'OpenCode' })).toBeInTheDocument()
  })
})
