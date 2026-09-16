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
