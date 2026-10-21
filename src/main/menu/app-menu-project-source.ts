import type { RegisterAppMenuOptions } from './app-menu-register-options'

export function projectSourceSelectionMenuItems(
  options: RegisterAppMenuOptions,
  corporate: boolean
): Electron.MenuItemConstructorOptions[] {
  if (corporate || !options.onSelectProjectSource) {
    return []
  }
  return [
    {
      label: 'Select GitHub Project Source...',
      click: (_item, window) => options.onSelectProjectSource?.(window)
    }
  ]
}
