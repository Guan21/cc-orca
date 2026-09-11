import type { TuiAgent } from './tui-agent'
import type { TopLevelView } from './ui-chrome-types'

export const ORCA_BUILD_PROFILE_ENV_VAR = 'ORCA_BUILD_PROFILE'

export type OrcaBuildProfile = 'default' | 'corporate'

export type CorporateBuildCapability =
  | 'ai-vault'
  | 'cloud-relay'
  | 'computer-use'
  | 'emulator'
  | 'mobile'
  | 'native-chat'
  | 'plugins'
  | 'skills'
  | 'speech'
  | 'ssh-remote'
  | 'telemetry'

export const CORPORATE_ALLOWED_TUI_AGENTS = [
  'claude',
  'codex'
] as const satisfies readonly TuiAgent[]
const CORPORATE_ALLOWED_TUI_AGENT_SET = new Set<TuiAgent>(CORPORATE_ALLOWED_TUI_AGENTS)

const CORPORATE_DISABLED_CAPABILITIES = new Set<CorporateBuildCapability>([
  'ai-vault',
  'cloud-relay',
  'computer-use',
  'emulator',
  'mobile',
  'native-chat',
  'plugins',
  'skills',
  'speech',
  'ssh-remote',
  'telemetry'
])

const CORPORATE_DISABLED_TOP_LEVEL_VIEWS = new Set<TopLevelView>(['skills', 'mobile'])

export function normalizeOrcaBuildProfile(value: unknown): OrcaBuildProfile {
  return value === 'corporate' ? 'corporate' : 'default'
}

export function getOrcaBuildProfile(): OrcaBuildProfile {
  const buildProfileGlobal = globalThis as { __ORCA_BUILD_PROFILE__?: OrcaBuildProfile }
  if (buildProfileGlobal.__ORCA_BUILD_PROFILE__ !== undefined) {
    return normalizeOrcaBuildProfile(buildProfileGlobal.__ORCA_BUILD_PROFILE__)
  }
  const processLike = globalThis as {
    process?: { env?: Record<string, string | undefined> }
  }
  return normalizeOrcaBuildProfile(processLike.process?.env?.[ORCA_BUILD_PROFILE_ENV_VAR])
}

export function isCapabilityEnabledForBuildProfile(
  capability: CorporateBuildCapability,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): boolean {
  return profile !== 'corporate' || !CORPORATE_DISABLED_CAPABILITIES.has(capability)
}

export function isTopLevelViewEnabledForBuildProfile(
  view: TopLevelView,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): boolean {
  return profile !== 'corporate' || !CORPORATE_DISABLED_TOP_LEVEL_VIEWS.has(view)
}

export function isTuiAgentAllowedForBuildProfile(
  agent: TuiAgent,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): boolean {
  return profile !== 'corporate' || CORPORATE_ALLOWED_TUI_AGENT_SET.has(agent)
}
