import type { BrowserWindow } from 'electron'

const DIAGNOSTIC_PREFIX = '[issue37-native-window]'
const FORCE_CONTENT_PROTECTION_OFF_ENV = 'ORCA_DIAG_FORCE_CONTENT_PROTECTION_OFF'

export type MacosWindowPresentationDiagnosticStage =
  | 'created'
  | 'content-protection-forced-off'
  | 'did-finish-load'
  | 'ready-to-show'
  | 'show'
  | 'focus'

type DiagnosticOptions = {
  env?: Partial<NodeJS.ProcessEnv>
  platform?: NodeJS.Platform
}

type DiagnosticWindow = BrowserWindow & Record<string, unknown>

type MacosWindowPresentationDiagnosticController = {
  installLifecycleObservers: () => void
}

export function createMacosWindowPresentationSnapshot(
  mainWindow: BrowserWindow,
  stage: MacosWindowPresentationDiagnosticStage,
  lastContentProtected?: boolean
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = { stage }
  const isContentProtected = readWindowMethod(mainWindow, 'isContentProtected')
  addDefined(snapshot, 'isDestroyed', readWindowMethod(mainWindow, 'isDestroyed'))
  addDefined(snapshot, 'isVisible', readWindowMethod(mainWindow, 'isVisible'))
  addDefined(snapshot, 'isFocused', readWindowMethod(mainWindow, 'isFocused'))
  addDefined(snapshot, 'isMinimized', readWindowMethod(mainWindow, 'isMinimized'))
  addDefined(snapshot, 'isMaximized', readWindowMethod(mainWindow, 'isMaximized'))
  addDefined(snapshot, 'isFullScreen', readWindowMethod(mainWindow, 'isFullScreen'))
  addDefined(snapshot, 'isContentProtected', isContentProtected)
  addDefined(snapshot, 'opacity', readWindowMethod(mainWindow, 'getOpacity'))
  addDefined(snapshot, 'isFocusable', readWindowMethod(mainWindow, 'isFocusable'))
  addDefined(snapshot, 'isEnabled', readWindowMethod(mainWindow, 'isEnabled'))
  addDefined(snapshot, 'isAlwaysOnTop', readWindowMethod(mainWindow, 'isAlwaysOnTop'))
  addDefined(
    snapshot,
    'isVisibleOnAllWorkspaces',
    readWindowMethod(mainWindow, 'isVisibleOnAllWorkspaces')
  )
  addDefined(snapshot, 'bounds', readWindowMethod(mainWindow, 'getBounds'))
  addDefined(snapshot, 'contentBounds', readWindowMethod(mainWindow, 'getContentBounds'))
  addDefined(snapshot, 'backgroundColor', readWindowMethod(mainWindow, 'getBackgroundColor'))
  if (lastContentProtected === false && isContentProtected === true) {
    snapshot.contentProtectionTransition = 'false-to-true'
  }
  return snapshot
}

export function installMacosWindowPresentationDiagnostic(
  mainWindow: BrowserWindow,
  options: DiagnosticOptions = {}
): void {
  startMacosWindowPresentationDiagnostic(mainWindow, options)?.installLifecycleObservers()
}

export function startMacosWindowPresentationDiagnostic(
  mainWindow: BrowserWindow,
  options: DiagnosticOptions = {}
): MacosWindowPresentationDiagnosticController | null {
  const platform = options.platform ?? process.platform
  if (platform !== 'darwin') {
    return null
  }

  const env = options.env ?? process.env
  let lastContentProtected: boolean | undefined
  const writeSnapshot = (stage: MacosWindowPresentationDiagnosticStage): void => {
    const snapshot = createMacosWindowPresentationSnapshot(mainWindow, stage, lastContentProtected)
    const isContentProtected = snapshot.isContentProtected
    if (typeof isContentProtected === 'boolean') {
      lastContentProtected = isContentProtected
    }
    try {
      console.log(`${DIAGNOSTIC_PREFIX} ${JSON.stringify(snapshot)}`)
    } catch {
      // Diagnostics must never affect startup.
    }
  }

  writeSnapshot('created')
  if (env[FORCE_CONTENT_PROTECTION_OFF_ENV] === '1') {
    callWindowMethod(mainWindow, 'setContentProtection', false)
    writeSnapshot('content-protection-forced-off')
  }

  return {
    installLifecycleObservers: () => {
      mainWindow.webContents.on('did-finish-load', () => writeSnapshot('did-finish-load'))
      mainWindow.on('ready-to-show', () => writeSnapshot('ready-to-show'))
      mainWindow.on('show', () => writeSnapshot('show'))
      mainWindow.on('focus', () => writeSnapshot('focus'))
    }
  }
}

function readWindowMethod(mainWindow: BrowserWindow, methodName: string): unknown {
  return callWindowMethod(mainWindow, methodName)
}

function callWindowMethod(
  mainWindow: BrowserWindow,
  methodName: string,
  ...args: unknown[]
): unknown {
  const method = (mainWindow as DiagnosticWindow)[methodName]
  if (typeof method !== 'function') {
    return undefined
  }
  try {
    return Reflect.apply(method, mainWindow, args)
  } catch {
    return undefined
  }
}

function addDefined(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) {
    target[key] = value
  }
}
