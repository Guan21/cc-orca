import type { SettingsSearchEntry } from './settings-search'
import { getBrowserPaneSearchEntries } from './browser-search'
import { getBrowserUsePaneSearchEntries } from './browser-use-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { isCapabilityEnabledForBuildProfile } from '../../../../shared/corporate-build-profile'

const getAllBrowserPaneSearchEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  ...getBrowserUsePaneSearchEntries(),
  ...getBrowserPaneSearchEntries()
])

export function getBrowserPaneCombinedSearchEntries(): SettingsSearchEntry[] {
  return isCapabilityEnabledForBuildProfile('skills')
    ? getAllBrowserPaneSearchEntries()
    : getBrowserPaneSearchEntries()
}
