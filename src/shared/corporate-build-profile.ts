import type { TuiAgent } from './tui-agent'
import type { TopLevelView } from './ui-chrome-types'
import { recognizeAgentCommandLineFromCommandLine } from './agent-process-recognition'

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

export const AGENT_NOT_ALLOWED_BY_ORG_POLICY = 'AGENT_NOT_ALLOWED_BY_ORG_POLICY'
export const PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY =
  'PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY'

export class CorporateAgentPolicyError extends Error {
  readonly code = AGENT_NOT_ALLOWED_BY_ORG_POLICY
  readonly agent: TuiAgent
  readonly profile: OrcaBuildProfile

  constructor(agent: TuiAgent, profile: OrcaBuildProfile) {
    super(AGENT_NOT_ALLOWED_BY_ORG_POLICY)
    this.name = 'CorporateAgentPolicyError'
    this.agent = agent
    this.profile = profile
  }
}

export class CorporatePermissionBypassPolicyError extends Error {
  readonly code = PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY
  readonly agent: TuiAgent
  readonly profile: OrcaBuildProfile
  readonly flag: string

  constructor(agent: TuiAgent, profile: OrcaBuildProfile, flag: string) {
    super(PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY)
    this.name = 'CorporatePermissionBypassPolicyError'
    this.agent = agent
    this.profile = profile
    this.flag = flag
  }
}

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

const CORPORATE_CLI_COMMAND_CAPABILITIES = new Map<string, CorporateBuildCapability>([
  ['computer', 'computer-use'],
  ['emulator', 'emulator'],
  ['serve', 'cloud-relay'],
  ['skills', 'skills']
])

const CORPORATE_FORBIDDEN_PERMISSION_BYPASS_ARGS: Partial<Record<TuiAgent, readonly string[]>> = {
  claude: ['--dangerously-skip-permissions'],
  codex: ['--dangerously-bypass-approvals-and-sandbox']
}

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

export function assertAgentAllowedForBuildProfile(
  agent: TuiAgent,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): void {
  if (!isTuiAgentAllowedForBuildProfile(agent, profile)) {
    throw new CorporateAgentPolicyError(agent, profile)
  }
}

export function findForbiddenPermissionBypassArgForBuildProfile(
  agent: TuiAgent,
  tokens: readonly string[],
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): string | null {
  if (profile !== 'corporate') {
    return null
  }
  const forbiddenArgs = CORPORATE_FORBIDDEN_PERMISSION_BYPASS_ARGS[agent]
  if (!forbiddenArgs) {
    return null
  }
  return forbiddenArgs.find((arg) => tokens.includes(arg)) ?? null
}

export function areAgentArgsAllowedForBuildProfile(
  agent: TuiAgent,
  args: string,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): boolean {
  const recognized = recognizeAgentCommandLineFromCommandLine(`${agent} ${args}`, {
    includeHeadlessOneShot: true
  })
  return !findForbiddenPermissionBypassArgForBuildProfile(
    recognized?.agent ?? agent,
    recognized?.tokens ?? [],
    profile
  )
}

export function assertAgentPermissionBypassAllowedForBuildProfile(
  agent: TuiAgent,
  tokens: readonly string[],
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): void {
  const forbiddenArg = findForbiddenPermissionBypassArgForBuildProfile(agent, tokens, profile)
  if (forbiddenArg) {
    throw new CorporatePermissionBypassPolicyError(agent, profile, forbiddenArg)
  }
}

export function assertAgentLaunchAllowedForBuildProfile(
  launch: { launchAgent?: TuiAgent; command?: string | null | undefined },
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): void {
  if (launch.launchAgent) {
    assertAgentAllowedForBuildProfile(launch.launchAgent, profile)
  }
  const recognized = recognizeAgentCommandLineFromCommandLine(launch.command, {
    includeHeadlessOneShot: true
  })
  if (recognized) {
    assertAgentAllowedForBuildProfile(recognized.agent, profile)
    assertAgentPermissionBypassAllowedForBuildProfile(recognized.agent, recognized.tokens, profile)
  }
}

export function isCliCommandEnabledForBuildProfile(
  commandPath: readonly string[],
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): boolean {
  const capability = CORPORATE_CLI_COMMAND_CAPABILITIES.get(commandPath[0] ?? '')
  return capability ? isCapabilityEnabledForBuildProfile(capability, profile) : true
}
