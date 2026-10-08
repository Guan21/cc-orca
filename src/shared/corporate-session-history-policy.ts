import { getOrcaBuildProfile, type OrcaBuildProfile } from './corporate-build-profile'
import {
  LOCAL_EXECUTION_HOST_ID,
  requestedExecutionHostScope,
  type ExecutionHostScope
} from './execution-host'
import { isWslUncPath } from './wsl-paths'

// Local methods are declared independently of the disabled remote ai-vault capability.
export const CORPORATE_LOCAL_SESSION_HISTORY_METHODS = new Set<string>([
  'listSessions',
  'resolveSessionTitles',
  'cancelListSessions',
  'prepareSessionResume',
  'listSubagentSessions',
  'getFirstUserPrompt',
  'deleteSession',
  'onWindowFocused'
])

export function assertCorporateSessionHistoryHost(
  host: unknown,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): void {
  if (profile === 'corporate' && host !== undefined && host !== LOCAL_EXECUTION_HOST_ID) {
    throw new Error('Corporate Agent Session History is local-only. Select this computer.')
  }
}

export function assertCorporateSessionHistoryPaths(
  paths: readonly unknown[],
  profile: OrcaBuildProfile = getOrcaBuildProfile(),
  platform: NodeJS.Platform = process.platform
): void {
  if (profile !== 'corporate' || platform !== 'win32') {
    return
  }
  for (const path of paths) {
    if (typeof path !== 'string' || !path) {
      continue
    }
    const normalized = path.trim().replace(/\\/g, '/')
    if (
      normalized.startsWith('//') &&
      !isWslUncPath(normalized) &&
      !/^\/\/\?\/[a-z]:\//i.test(normalized)
    ) {
      throw new Error('Network session paths are disabled in corporate builds. Use local history.')
    }
  }
}

export function sessionHistoryListScopeForBuildProfile(
  scope: ExecutionHostScope | undefined,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): ExecutionHostScope {
  if (profile === 'corporate') {
    // "All" includes every local project, never remote host discovery.
    assertCorporateSessionHistoryHost(scope === 'all' ? LOCAL_EXECUTION_HOST_ID : scope, profile)
    return LOCAL_EXECUTION_HOST_ID
  }
  return requestedExecutionHostScope(scope)
}
