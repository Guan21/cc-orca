import {
  getOrcaBuildProfile,
  isTuiAgentAllowedForBuildProfile,
  type OrcaBuildProfile
} from '../../../../shared/corporate-build-profile'
import type { StatusBarItem } from '../../../../shared/ui-chrome-types'
import type { TuiAgent } from '../../../../shared/tui-agent'

export type ProviderSettingsSurface =
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'opencode-go'
  | 'minimax'
  | 'grok'
  | 'kimi'
  | 'antigravity'

const PROVIDER_AGENT_BY_SURFACE: Record<ProviderSettingsSurface, TuiAgent | null> = {
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
  'opencode-go': 'opencode',
  minimax: null,
  grok: 'grok',
  kimi: 'kimi',
  antigravity: 'antigravity'
}

export function isProviderSettingsSurfaceEnabledForBuildProfile(
  surface: ProviderSettingsSurface,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): boolean {
  if (profile !== 'corporate') {
    return true
  }
  const agent = PROVIDER_AGENT_BY_SURFACE[surface]
  return agent !== null && isTuiAgentAllowedForBuildProfile(agent, profile)
}

export function isStatusBarItemEnabledForBuildProfile(
  item: StatusBarItem,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): boolean {
  if (item === 'ssh' || item === 'resource-usage' || item === 'ports') {
    return true
  }
  return isProviderSettingsSurfaceEnabledForBuildProfile(item, profile)
}
