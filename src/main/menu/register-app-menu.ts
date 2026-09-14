import { BrowserWindow, Menu, app } from 'electron'
import {
  formatKeybindingList,
  getEffectiveKeybindingsForAction,
  type KeybindingActionId,
  type KeybindingOverrides
} from '../../shared/keybindings'
import type { UpdateCheckOptions } from '../../shared/update-status-types'
import { translateMain } from '../i18n/main-i18n'
import { createAppMenuSelectionItem } from './app-menu-selection-item'
import { getOrcaBuildProfile } from '../../shared/corporate-build-profile'

export type AppearanceMenuState = {
  showTasksButton: boolean
  showAutomationsButton: boolean
  showMobileButton: boolean
  showTitlebarAppName: boolean
  statusBarVisible: boolean
}

export type AppearanceMenuKey = keyof AppearanceMenuState

export function getNextDefaultOnAppearanceSettingValue(current: boolean | undefined): boolean {
  return !(current !== false)
}

type RegisterAppMenuOptions = {
  onOpenSettings: () => void
  onOpenSetupGuide: (window?: Electron.BaseWindow | null) => void
  onOpenFeatureTour: (window?: Electron.BaseWindow | null) => void
  onOpenCrashReport: (window?: Electron.BaseWindow | null) => void
  onCheckForUpdates: (options: UpdateCheckOptions) => void
  onBeforeReload?: (options: { ignoreCache: boolean; webContentsId: number }) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onToggleLeftSidebar: () => void
  onToggleRightSidebar: () => void
  onToggleAppearance: (key: AppearanceMenuKey) => void
  getAppearanceState: () => AppearanceMenuState
  getKeybindings?: () => KeybindingOverrides | undefined
  appMenuLabel?: string
}

function buildAndApplyMenu(options: RegisterAppMenuOptions): void {
  const {
    onOpenSettings,
    onOpenSetupGuide,
    onOpenFeatureTour,
    onOpenCrashReport,
    onCheckForUpdates,
    onBeforeReload,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onToggleLeftSidebar,
    onToggleRightSidebar,
    onToggleAppearance,
    getAppearanceState,
    getKeybindings
  } = options

  const isMac = process.platform === 'darwin'
  const isCorporateBuild = getOrcaBuildProfile() === 'corporate'
  const appearance = getAppearanceState()
  const shortcutLabel = (actionId: KeybindingActionId): string => {
    const bindings = getEffectiveKeybindingsForAction(
      actionId,
      process.platform,
      getKeybindings?.()
    )
    return formatKeybindingList(bindings, process.platform)
  }

  const reloadFocusedWindow = (ignoreCache: boolean): void => {
    const webContents = BrowserWindow.getFocusedWindow()?.webContents
    if (!webContents) {
      return
    }

    onBeforeReload?.({ ignoreCache, webContentsId: webContents.id })

    if (ignoreCache) {
      webContents.reloadIgnoringCache()
      return
    }

    webContents.reload()
  }

  const checkForUpdatesClick: Electron.MenuItemConstructorOptions['click'] = (
    _menuItem,
    _window,
    event
  ) => {
    const modifierClick = !event.triggeredByAccelerator
    const localBuild = isMac && modifierClick && event.altKey === true
    const includePerfPrerelease =
      !localBuild && modifierClick && (isMac ? event.metaKey === true : event.ctrlKey === true)
    const includePrerelease = !localBuild && modifierClick && event.shiftKey === true
    onCheckForUpdates({
      includePrerelease,
      includePerfPrerelease,
      ...(localBuild ? { localBuild: true } : {})
    })
  }

  const checkForUpdatesItem: Electron.MenuItemConstructorOptions = {
    label: translateMain('menu.checkForUpdates', 'Check for Updates...'),
    click: checkForUpdatesClick
  }

  const settingsItem: Electron.MenuItemConstructorOptions = {
    label: `${translateMain('menu.settings', 'Settings')}\t${shortcutLabel('app.settings')}`,
    click: () => onOpenSettings()
  }

  const featureTourItem: Electron.MenuItemConstructorOptions | null = isCorporateBuild
    ? null
    : {
        label: translateMain('menu.exploreOrca', 'Explore Orca'),
        click: (_menuItem, window) => onOpenFeatureTour(window)
      }

  const setupGuideItem: Electron.MenuItemConstructorOptions | null = isCorporateBuild
    ? null
    : {
        label: translateMain('menu.gettingStarted', 'Getting Started with Orca'),
        click: (_menuItem, window) => onOpenSetupGuide(window)
      }

  const crashReportItem: Electron.MenuItemConstructorOptions = {
    label: translateMain('menu.reportCrash', 'Report Crash...'),
    click: (_menuItem, window) => onOpenCrashReport(window)
  }

  const macAppMenu: Electron.MenuItemConstructorOptions = {
    label: options.appMenuLabel ?? app.name,
    submenu: [
      { role: 'about' },
      checkForUpdatesItem,
      settingsItem,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }

  const fileMenu: Electron.MenuItemConstructorOptions = {
    label: translateMain('menu.file', 'File'),
    submenu: [
      settingsItem,
      { type: 'separator' },
      { role: 'quit', label: translateMain('menu.exit', 'Exit') }
    ]
  }

  const undoRedoOptions: Electron.MenuItemConstructorOptions = isMac
    ? {}
    : { registerAccelerator: false }
  const editMenu: Electron.MenuItemConstructorOptions = {
    label: translateMain('menu.edit', 'Edit'),
    submenu: [
      { role: 'undo', ...undoRedoOptions },
      { role: 'redo', ...undoRedoOptions },
      { type: 'separator' },
      { role: 'cut' },
      createAppMenuSelectionItem({
        action: 'copy',
        label: translateMain('menu.copy', 'Copy'),
        isMac
      }),
      {
        label: translateMain('menu.paste', 'Paste'),
        accelerator: 'CmdOrCtrl+V',
        click: () => {
          const focusedWindow = BrowserWindow.getFocusedWindow()
          if (focusedWindow) {
            focusedWindow.webContents.send('ui:appMenuPaste')
            return
          }

          if (isMac) {
            Menu.sendActionToFirstResponder('paste:')
          }
        }
      },
      createAppMenuSelectionItem({
        action: 'select-all',
        label: translateMain('menu.selectAll', 'Select All'),
        isMac
      })
    ]
  }

  const appearanceSubmenu: Electron.MenuItemConstructorOptions = {
    label: translateMain('menu.appearance', 'Appearance'),
    submenu: [
      {
        label: `${translateMain('menu.toggleLeftSidebar', 'Toggle Left Sidebar')}\t${shortcutLabel('sidebar.left.toggle')}`,
        click: () => onToggleLeftSidebar()
      },
      {
        label: `${translateMain('menu.toggleRightSidebar', 'Toggle Right Sidebar')}\t${shortcutLabel('sidebar.right.toggle')}`,
        click: () => onToggleRightSidebar()
      },
      {
        label: translateMain('menu.showStatusBar', 'Show Status Bar'),
        type: 'checkbox',
        checked: appearance.statusBarVisible,
        click: () => onToggleAppearance('statusBarVisible')
      },
      { type: 'separator' },
      {
        label: translateMain('menu.showTasksButton', 'Show Tasks Button'),
        type: 'checkbox',
        checked: appearance.showTasksButton,
        click: () => onToggleAppearance('showTasksButton')
      },
      {
        label: translateMain('menu.showAutomationsButton', 'Show Automations Button'),
        type: 'checkbox',
        checked: appearance.showAutomationsButton,
        click: () => onToggleAppearance('showAutomationsButton')
      },
      ...(!isCorporateBuild
        ? ([
            {
              label: translateMain('menu.showMobileButton', 'Show Orca Mobile Button'),
              type: 'checkbox',
              checked: appearance.showMobileButton,
              click: () => onToggleAppearance('showMobileButton')
            }
          ] satisfies Electron.MenuItemConstructorOptions[])
        : []),
      {
        label: translateMain('menu.showTitlebarAppName', 'Show Titlebar App Name'),
        type: 'checkbox',
        checked: appearance.showTitlebarAppName,
        click: () => onToggleAppearance('showTitlebarAppName')
      }
    ]
  }

  const viewMenu: Electron.MenuItemConstructorOptions = {
    label: translateMain('menu.view', 'View'),
    submenu: [
      {
        label: translateMain('menu.reload', 'Reload'),
        click: () => reloadFocusedWindow(false)
      },
      {
        label: `${translateMain('menu.forceReload', 'Force Reload')}\t${shortcutLabel('app.forceReload')}`,
        click: () => reloadFocusedWindow(true)
      },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      {
        label: `${translateMain('menu.resetSize', 'Reset Size')}\t${shortcutLabel('zoom.reset')}`,
        click: () => onZoomReset()
      },
      {
        label: `${translateMain('menu.zoomIn', 'Zoom In')}\t${shortcutLabel('zoom.in')}`,
        click: () => onZoomIn()
      },
      {
        label: `${translateMain('menu.zoomOut', 'Zoom Out')}\t${shortcutLabel('zoom.out')}`,
        click: () => onZoomOut()
      },
      { type: 'separator' },
      {
        label: `${translateMain('menu.openWorktreePalette', 'Open Worktree Palette')}\t${shortcutLabel('worktree.palette')}`
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      appearanceSubmenu
    ]
  }

  const windowMenu: Electron.MenuItemConstructorOptions = {
    label: translateMain('menu.window', 'Window'),
    submenu: [{ role: 'minimize' }, { role: 'zoom' }]
  }

  const helpMenu: Electron.MenuItemConstructorOptions = {
    label: translateMain('menu.help', 'Help'),
    submenu: [
      crashReportItem,
      ...(featureTourItem || setupGuideItem
        ? ([
            { type: 'separator' },
            ...(featureTourItem ? [featureTourItem] : []),
            ...(setupGuideItem ? [setupGuideItem] : [])
          ] satisfies Electron.MenuItemConstructorOptions[])
        : []),
      ...(isMac
        ? []
        : ([
            { type: 'separator' },
            { role: 'about' },
            checkForUpdatesItem
          ] satisfies Electron.MenuItemConstructorOptions[]))
    ]
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [macAppMenu] : []),
    ...(isMac ? [] : [fileMenu]),
    editMenu,
    viewMenu,
    windowMenu,
    helpMenu
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

let lastRegisterOptions: RegisterAppMenuOptions | null = null

export function registerAppMenu(options: RegisterAppMenuOptions): void {
  lastRegisterOptions = options
  buildAndApplyMenu(options)
}

export function rebuildAppMenu(): void {
  if (lastRegisterOptions) {
    buildAndApplyMenu(lastRegisterOptions)
  }
}
