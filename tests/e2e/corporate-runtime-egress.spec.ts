import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ElectronApplication, Page, TestInfo } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import { retryTransientMainEvaluate } from './helpers/electron-main-evaluate-retry'
import {
  GOLDEN_STUB_READY_MARKER,
  getGoldenStubAgentLaunchEnv
} from './helpers/golden-stub-agent'
import { waitForActiveTerminalManager, waitForTerminalOutput } from './helpers/terminal'
import {
  assertNoUnexpectedCorporateEgress,
  formatCorporateEgressFailures,
  type RuntimeEgressAttempt
} from '../../src/main/network/corporate-runtime-egress-observer'

const CORPORATE_EGRESS_IDLE_MS = Number(process.env.ORCA_CORPORATE_EGRESS_IDLE_MS ?? 30_000)

type LaunchedCorporateApp = {
  app: ElectronApplication
  page: Page
  logPath: string
  close: () => Promise<RuntimeEgressAttempt[]>
}

test.describe.configure({ mode: 'serial' })

test.describe('Corporate runtime egress gate', () => {
  test('normal lifecycle with credentials present produces zero unexpected Internet attempts', async ({ testRepoPath }, testInfo) => {
    const runtime = await launchCorporateEgressApp(testInfo, testRepoPath, {
      ANTHROPIC_API_KEY: 'fixture-not-a-secret',
      CLAUDE_CODE_OAUTH_TOKEN: 'fixture-not-a-secret',
      OPENAI_API_KEY: 'fixture-not-a-secret'
    })
    try {

      await setScenario(runtime.app, 'focus')
      await retryTransientMainEvaluate(() =>
        runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.focus())
      )

      await setScenario(runtime.app, 'hide')
      await retryTransientMainEvaluate(() =>
        runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide())
      )

      await setScenario(runtime.app, 'show')
      await retryTransientMainEvaluate(() =>
        runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show())
      )

      await setScenario(runtime.app, 'restore')
      await retryTransientMainEvaluate(() =>
        runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.restore())
      )

      await setScenario(runtime.app, 'open-settings')
      await runtime.page.evaluate(() => window.__store?.getState().openSettingsPage())
      await expect.poll(() => activeView(runtime.page), { timeout: 10_000 }).toBe('settings')

      await setScenario(runtime.app, 'open-support-feedback-ui')
      await runtime.page.evaluate(() => window.__store?.getState().setActiveView('terminal'))
      await runtime.page.getByRole('button', { name: /^(Help|ヘルプ)$/ }).click({ force: true })
      await expect(runtime.page.getByRole('menuitem', { name: 'Report Bug' })).toHaveCount(0)
      await expect(runtime.page.getByRole('menuitem', { name: 'Team Support' })).toHaveCount(0)
      await runtime.page.keyboard.press('Escape')

      await setScenario(runtime.app, 'idle')
      await runtime.page.evaluate(() => window.__store?.getState().setActiveView('terminal'))
      await runtime.page.waitForTimeout(CORPORATE_EGRESS_IDLE_MS)

      const attempts = await runtime.close()
      const failures = assertNoUnexpectedCorporateEgress(attempts)
      expect(formatCorporateEgressFailures(failures)).toBe('')
      expect(providerLaunches(attempts, 'claude')).toHaveLength(0)
      expect(providerLaunches(attempts, 'codex')).toHaveLength(0)
    } finally {
      await runtime.close()
    }
  })

  test('configured support links are user-attributable external navigations', async ({ testRepoPath }, testInfo) => {
    const bugUrl = 'https://github.example.test/company/devcrew/issues/new'
    const slackUrl = 'https://slack.example.test/company/support'
    const runtime = await launchCorporateEgressApp(testInfo, testRepoPath, {
      ORCA_BUG_TRACKER_URL: bugUrl,
      ORCA_SUPPORT_SLACK_URL: slackUrl
    })
    try {

      await setScenario(runtime.app, 'report-bug')
      await runtime.page.getByRole('button', { name: /^(Help|ヘルプ)$/ }).click({ force: true })
      await runtime.page.getByRole('menuitem', { name: 'Report Bug' }).click()

      await setScenario(runtime.app, 'team-support')
      await runtime.page.getByRole('button', { name: /^(Help|ヘルプ)$/ }).click({ force: true })
      await runtime.page.getByRole('menuitem', { name: 'Team Support' }).click()

      const attempts = await runtime.close()
      expect(
        attempts
          .filter((attempt) => attempt.source === 'shell.openExternal')
          .map((attempt) => ({
            scenario: attempt.scenario,
            category: attempt.category,
            destination: attempt.destination?.normalized,
            initiator: attempt.initiatedBy.kind
          }))
      ).toEqual([
        {
          scenario: 'report-bug',
          category: 'user-initiated-egress',
          destination: 'https://github.example.test:443',
          initiator: 'user-action'
        },
        {
          scenario: 'team-support',
          category: 'user-initiated-egress',
          destination: 'https://slack.example.test:443',
          initiator: 'user-action'
        }
      ])
    } finally {
      await runtime.close()
    }
  })

  test('explicit provider launches become attributable provider activity', async ({ testRepoPath }, testInfo) => {
    const runtime = await launchCorporateEgressApp(testInfo, testRepoPath, getGoldenStubAgentLaunchEnv())
    try {

      expect(providerLaunches(readAttemptLog(runtime.logPath), 'claude')).toEqual([])
      await setScenario(runtime.app, 'explicit-claude-launch')
      await launchGoldenStubProvider(runtime.page, 'claude')

      await setScenario(runtime.app, 'explicit-codex-launch')
      await launchGoldenStubProvider(runtime.page, 'codex')

      const attempts = await runtime.close()
      expect(providerLaunches(attempts, 'claude')).toMatchObject([
        { scenario: 'explicit-claude-launch', category: 'provider-specific-egress' }
      ])
      expect(providerLaunches(attempts, 'codex')).toMatchObject([
        { scenario: 'explicit-codex-launch', category: 'provider-specific-egress' }
      ])
    } finally {
      await runtime.close()
    }
  })
})

async function launchCorporateEgressApp(
  testInfo: TestInfo,
  testRepoPath: string,
  extraEnv: Record<string, string | undefined> = {}
): Promise<LaunchedCorporateApp> {
  const outputDir = testInfo.outputDir
  mkdirSync(outputDir, { recursive: true })
  const logPath = path.join(outputDir, `corporate-runtime-egress-${Date.now()}.jsonl`)
  const session = createRestartSession(testInfo, {
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_BUILD_PROFILE: 'corporate',
    ORCA_CORPORATE_RUNTIME_EGRESS_LOG_PATH: logPath,
    ORCA_CORPORATE_RUNTIME_EGRESS_SCENARIO: 'cold-start',
    ORCA_CORPORATE_RUNTIME_EGRESS_BLOCK_INTERNET: '1',
    ORCA_CORPORATE_RUNTIME_EGRESS_SUPPRESS_EXTERNAL: '1',
    ...extraEnv
  })
  const launched = await session.launch()
  await attachRepoAndOpenTerminal(launched.page, testRepoPath)
  let closedAttempts: RuntimeEgressAttempt[] | undefined
  return {
    app: launched.app,
    page: launched.page,
    logPath,
    close: async () => {
      if (closedAttempts) {
        return closedAttempts
      }
      await session.close(launched.app)
      const attempts = readAttemptLog(logPath)
      await session.dispose()
      closedAttempts = attempts
      return closedAttempts
    }
  }
}

async function setScenario(app: ElectronApplication, scenario: string): Promise<void> {
  await retryTransientMainEvaluate(() =>
    app.evaluate((_, value) => {
      globalThis.__orcaCorporateRuntimeEgressSetScenario?.(value)
    }, scenario)
  )
}

async function activeView(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__store?.getState().activeView ?? null)
}

async function launchGoldenStubProvider(page: Page, provider: 'claude' | 'codex'): Promise<void> {
  await page.evaluate((provider) => {
    const store = window.__store
    const worktreeId = store?.getState().activeWorktreeId
    if (!store || !worktreeId) {
      throw new Error('Corporate provider egress test has no active worktree')
    }
    const tab = store.getState().createTab(worktreeId, undefined, undefined, {
      launchAgent: provider
    })
    store.getState().queueTabStartupCommand(tab.id, {
      command: 'golden-stub-agent',
      launchAgent: provider,
      telemetry: {
        agent_kind: provider,
        launch_source: 'tab_bar_quick_launch',
        request_kind: 'new'
      }
    })
    store.getState().setActiveTab(tab.id)
    store.getState().setActiveTabType('terminal')
  }, provider)
  await waitForActiveTerminalManager(page, 30_000)
  await waitForTerminalOutput(page, GOLDEN_STUB_READY_MARKER, 20_000)
}

function readAttemptLog(logPath: string): RuntimeEgressAttempt[] {
  if (!existsSync(logPath)) {
    return []
  }
  return readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RuntimeEgressAttempt)
}

function providerLaunches(
  attempts: readonly RuntimeEgressAttempt[],
  provider: 'claude' | 'codex'
): RuntimeEgressAttempt[] {
  return attempts.filter(
    (attempt) =>
      attempt.category === 'provider-specific-egress' &&
      attempt.capability === `provider.${provider}.process`
  )
}
