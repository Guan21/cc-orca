import * as dependencies from './orca-runtime-create-terminal-dependencies'

type PaneIdentityLaunchOptions = {
  tabId?: string | null
  leafId?: string | null
}

export function resolveTerminalPaneIdentity(launchOpts: PaneIdentityLaunchOptions): {
  tabId: string
  leafId: string
  paneKey: string
} {
  const hintedTabId = launchOpts.tabId?.trim()
  const hintedLeafId = launchOpts.leafId
  const canAdoptPaneIdentity =
    typeof hintedTabId === 'string' &&
    dependencies.isValidHostTerminalTabId(hintedTabId) &&
    typeof hintedLeafId === 'string' &&
    dependencies.isTerminalLeafId(hintedLeafId)
  const tabId = canAdoptPaneIdentity ? hintedTabId : dependencies.randomUUID()
  const leafId = canAdoptPaneIdentity ? hintedLeafId : dependencies.randomUUID()
  return {
    tabId,
    leafId,
    paneKey: dependencies.makePaneKey(tabId, leafId)
  }
}
