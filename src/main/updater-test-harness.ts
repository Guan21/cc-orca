import { afterAll, vi } from 'vitest'
import { clearTrackedRealTimers, trackRealTimers } from './updater-test-timer-tracking'
import type {
  AppMock,
  AutoUpdaterMock,
  LinuxPackageType,
  UpdaterMocks,
  UpdaterModuleFactories
} from './updater-test-harness-types'

export type { UpdaterMocks }

// Why: macOS keeps the restart advice because quitting does re-stage a Squirrel update.
export const PRE_COMMIT_INSTALL_FAILURE =
  process.platform === 'darwin'
    ? 'Could not restart to install the update. Quit and reopen Orca, then try again.'
    : 'Could not start the update installer. Orca remains open.'

/**
 * Builds the electron/electron-updater mock graph `updater.ts` runs against, plus the module
 * factories each test file feeds to its own hoisted `vi.mock` calls. Call it from an awaited
 * `vi.hoisted` block so the mocks exist before the mock factories run.
 */
export function createUpdaterMocks(): UpdaterMocks {
  const appEventHandlers = new Map<string, ((...args: unknown[]) => void)[]>()
  const eventHandlers = new Map<string, ((...args: unknown[]) => void)[]>()

  const appOn = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    const handlers = appEventHandlers.get(event) ?? []
    handlers.push(handler)
    appEventHandlers.set(event, handlers)
    return appMock
  })

  const appEmit = (event: string, ...args: unknown[]) => {
    for (const handler of appEventHandlers.get(event) ?? []) {
      handler(...args)
    }
  }

  const on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    const handlers = eventHandlers.get(event) ?? []
    handlers.push(handler)
    eventHandlers.set(event, handlers)
    return autoUpdaterMock
  })

  const emit = (event: string, ...args: unknown[]) => {
    for (const handler of eventHandlers.get(event) ?? []) {
      handler(...args)
    }
  }

  // Why: `vi.resetModules()` abandons the previous test's `updater` module instance but cannot cancel
  // the real timers it armed (1s silent-settle, 45s stall, 24h auto-check). Those fire during a later
  // test — re-arming on that test's fake clock — and drove these shared spies, so a stale instance
  // could land an extra `checkForUpdates()` inside the window under assertion.
  let currentGeneration = 0

  /**
   * Hands each `updater` module instance an autoUpdater view stamped with the generation that loaded
   * it. Once `resetUpdaterMocks` bumps the generation, the abandoned instance's calls and property
   * writes are dropped instead of reaching the spies the running test asserts on.
   */
  const loadGenerationScopedAutoUpdater = (): AutoUpdaterMock => {
    const loadedGeneration = currentGeneration
    return new Proxy(autoUpdaterMock, {
      get(target, property) {
        const value = Reflect.get(target, property)
        if (loadedGeneration === currentGeneration || typeof value !== 'function') {
          return value
        }
        return () => undefined
      },
      set(target, property, value) {
        return loadedGeneration === currentGeneration ? Reflect.set(target, property, value) : true
      }
    }) as AutoUpdaterMock
  }

  const reset = () => {
    currentGeneration += 1
    appEventHandlers.clear()
    appOn.mockClear()
    eventHandlers.clear()
    on.mockClear()
    autoUpdaterMock.checkForUpdates.mockReset().mockResolvedValue(null)
    autoUpdaterMock.downloadUpdate.mockReset()
    autoUpdaterMock.quitAndInstall.mockReset()
    autoUpdaterMock.setFeedURL.mockClear()
    autoUpdaterMock.updateConfigPath = undefined
    autoUpdaterMock.allowPrerelease = false
    autoUpdaterMock.allowDowngrade = false
    autoUpdaterMock.disableDifferentialDownload = false
    autoUpdaterMock.autoRunAppAfterInstall = true
    autoUpdaterMock.logger = undefined
    delete (autoUpdaterMock as Record<string, unknown>).verifyUpdateCodeSignature
  }

  const autoUpdaterMock: AutoUpdaterMock = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    autoRunAppAfterInstall: true,
    allowPrerelease: false,
    allowDowngrade: false,
    disableDifferentialDownload: false,
    // Why: setup installs the diagnostic logger adapter here; tests drive child stderr through it.
    logger: undefined as { error: (message: unknown) => void } | undefined,
    on,
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    setFeedURL: vi.fn(),
    updateConfigPath: undefined as string | undefined,
    emit,
    reset
  }

  const appMock: AppMock = {
    isPackaged: true,
    getVersion: vi.fn(() => '1.0.51'),
    on: appOn,
    emit: appEmit,
    quit: vi.fn()
  }
  const browserWindowMock = {
    getAllWindows: vi.fn(() => [])
  }
  const nativeUpdaterMock = {
    on: vi.fn()
  }
  const isMock = { dev: false }
  const killAllPtyMock = vi.fn()
  const powerMonitorOnMock = vi.fn()
  const getLinuxRootPackageTypeMock = vi.fn<() => 'deb' | 'rpm' | null>(() => null)
  const getLinuxPackageTypeMock = vi.fn<() => LinuxPackageType>(() => {
    return getLinuxRootPackageTypeMock() ?? 'non-root'
  })
  const isExternallyManagedLinuxInstallMock = vi.fn<() => boolean>(() => false)
  const recordUpdaterLifecycleMock = vi.fn()
  const fetchChangelogMock = vi.fn()
  const fetchNudgeMock = vi.fn()
  const shouldApplyNudgeMock = vi.fn()
  const armExitWatchdogMock = vi.fn()
  const disarmExitWatchdogMock = vi.fn()
  const fetchNewerReleaseTagsMock = vi.fn()
  const chooseLocalBuildMock = vi.fn()
  const startLocalBuildFeedMock = vi.fn()
  const closeLocalBuildFeedMock = vi.fn()
  const listReleaseBuildsMock = vi.fn()
  const resolveTargetBuildMock = vi.fn()

  /** One factory per module `updater.ts` pulls in; test files pass these to their own `vi.mock`. */
  const moduleFactories: UpdaterModuleFactories = {
    electron: () => ({
      app: appMock,
      BrowserWindow: browserWindowMock,
      autoUpdater: nativeUpdaterMock,
      powerMonitor: { on: powerMonitorOnMock },
      shell: { showItemInFolder: vi.fn() },
      net: { fetch: vi.fn() }
    }),
    electronUpdater: () => ({ autoUpdater: autoUpdaterMock }),
    electronUpdaterLoader: () => ({ loadElectronAutoUpdater: loadGenerationScopedAutoUpdater }),
    electronToolkitUtils: () => ({ is: isMock }),
    ipcPty: () => ({ killAllPty: killAllPtyMock }),
    // Why: only the marker resolver is faked so the real artifact capture/redaction path stays under test.
    linuxUpdatePackageType: () => ({
      getLinuxPackageType: getLinuxPackageTypeMock,
      getLinuxRootPackageType: getLinuxRootPackageTypeMock,
      isExternallyManagedLinuxInstall: isExternallyManagedLinuxInstallMock
    }),
    updaterLifecycleDiagnostics: () => ({ recordUpdaterLifecycle: recordUpdaterLifecycleMock }),
    updaterChangelog: () => ({ fetchChangelog: fetchChangelogMock }),
    updaterNudge: () => ({ fetchNudge: fetchNudgeMock, shouldApplyNudge: shouldApplyNudgeMock }),
    updateInstallExitWatchdog: () => ({
      armUpdateInstallExitWatchdog: armExitWatchdogMock,
      disarmUpdateInstallExitWatchdog: disarmExitWatchdogMock
    }),
    updaterPrereleaseFeed: () => ({
      fetchNewerReleaseTagsWithReadiness: async (...args: unknown[]) => {
        const result = await fetchNewerReleaseTagsMock(...args)
        return Array.isArray(result)
          ? { tags: result, state: result.length > 0 ? 'ready' : 'no-newer' }
          : result
      },
      getReleaseDownloadUrl: (tag: string) =>
        `https://github.com/stablyai/orca/releases/download/${tag}`
    }),
    localBuildSwitch: () => ({ chooseLocalBuild: chooseLocalBuildMock }),
    localBuildFeedServer: () => ({ startLocalBuildFeed: startLocalBuildFeedMock }),
    updaterReleaseBuilds: () => ({
      listReleaseBuilds: listReleaseBuildsMock,
      resolveTargetBuild: resolveTargetBuildMock
    })
  }

  /** Shared `beforeEach` body: fresh module registry plus every mock back to its default. */
  const resetUpdaterMocks = () => {
    vi.clearAllTimers()
    vi.useRealTimers()
    // Why: the generation fence only ignores a stale instance's spy calls; this cancels the real
    // timers it left armed so it never runs at all.
    clearTrackedRealTimers()
    vi.resetModules()
    autoUpdaterMock.reset()
    nativeUpdaterMock.on.mockReset()
    browserWindowMock.getAllWindows.mockReset()
    browserWindowMock.getAllWindows.mockReturnValue([])
    appMock.getVersion.mockReset()
    appMock.getVersion.mockReturnValue('1.0.51')
    appMock.quit.mockReset()
    appMock.isPackaged = true
    isMock.dev = false
    killAllPtyMock.mockReset()
    armExitWatchdogMock.mockReset()
    disarmExitWatchdogMock.mockReset()
    powerMonitorOnMock.mockReset()
    getLinuxRootPackageTypeMock.mockReset().mockReturnValue(null)
    getLinuxPackageTypeMock.mockReset().mockImplementation(() => {
      return getLinuxRootPackageTypeMock() ?? 'non-root'
    })
    isExternallyManagedLinuxInstallMock.mockReset().mockReturnValue(false)
    recordUpdaterLifecycleMock.mockReset()
    fetchNudgeMock.mockReset().mockResolvedValue(null)
    shouldApplyNudgeMock.mockReset().mockReturnValue(false)
    fetchChangelogMock.mockReset().mockResolvedValue(null)
    fetchNewerReleaseTagsMock.mockReset().mockResolvedValue([])
    chooseLocalBuildMock.mockReset()
    listReleaseBuildsMock.mockReset().mockResolvedValue([])
    resolveTargetBuildMock.mockReset()
    closeLocalBuildFeedMock.mockReset()
    startLocalBuildFeedMock.mockReset().mockResolvedValue({
      url: 'http://127.0.0.1:1234/token/',
      close: closeLocalBuildFeedMock
    })
    vi.unstubAllGlobals()
    trackRealTimers()
  }

  // Why: keeps the timer patch scoped to files that use the harness. Fakes are dropped first
  // because a file ending on a fake clock fails the wrapper's identity guard, stranding it.
  afterAll(() => {
    vi.useRealTimers()
    clearTrackedRealTimers()
  })

  return {
    appMock,
    browserWindowMock,
    nativeUpdaterMock,
    autoUpdaterMock,
    isMock,
    killAllPtyMock,
    powerMonitorOnMock,
    getLinuxPackageTypeMock,
    getLinuxRootPackageTypeMock,
    isExternallyManagedLinuxInstallMock,
    recordUpdaterLifecycleMock,
    fetchChangelogMock,
    fetchNudgeMock,
    shouldApplyNudgeMock,
    armExitWatchdogMock,
    disarmExitWatchdogMock,
    fetchNewerReleaseTagsMock,
    chooseLocalBuildMock,
    startLocalBuildFeedMock,
    closeLocalBuildFeedMock,
    listReleaseBuildsMock,
    resolveTargetBuildMock,
    moduleFactories,
    resetUpdaterMocks
  }
}
