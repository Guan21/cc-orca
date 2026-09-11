import type { Repo } from '../../../shared/repo-types'
import type { OrcaBuildProfile } from '../../../shared/corporate-build-profile'

export type SettingsNavigationBuildOptions = {
  buildProfile: OrcaBuildProfile
  isMac: boolean
  isWindows: boolean
  isLocalWindowsHost: boolean
  isWindowsTerminalHost: boolean
  isWebClient: boolean
  managedBrowserCreationEnabled: boolean
  mobileEmulatorCreationEnabled: boolean
  isDev: boolean
  isLinearConnected: boolean
  repos: readonly Repo[]
}
