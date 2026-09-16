import type { KeybindingOverrides } from '../../shared/keybindings'
import type { UpdateCheckOptions } from '../../shared/update-status-types'
import type { AppearanceMenuKey, AppearanceMenuState } from './app-menu-appearance-state'

export type RegisterAppMenuOptions = {
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
