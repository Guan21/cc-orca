import type { TuiAgent } from './tui-agent'
import type { TopLevelView } from './ui-chrome-types'
import { recognizeAgentCommandLineFromCommandLine } from './agent-process-recognition'
import {
  findForbiddenPermissionBypassArg,
  insertArgsBeforeOptionTerminator,
  requiredSafePermissionArgs
} from './corporate-agent-permission-policy'

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
  | 'star-nag'
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
export const MERGE_NOT_ALLOWED_BY_ORG_POLICY = 'MERGE_NOT_ALLOWED_BY_ORG_POLICY'

export type HostedMergePolicyAction = 'direct-merge' | 'auto-merge'

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

export class CorporateHostedMergePolicyError extends Error {
  readonly code = MERGE_NOT_ALLOWED_BY_ORG_POLICY
  readonly action: HostedMergePolicyAction
  readonly profile: OrcaBuildProfile

  constructor(action: HostedMergePolicyAction, profile: OrcaBuildProfile) {
    super(MERGE_NOT_ALLOWED_BY_ORG_POLICY)
    this.name = 'CorporateHostedMergePolicyError'
    this.action = action
    this.profile = profile
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
  'star-nag',
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

export function normalizeOrcaBuildProfile(value: unknown): OrcaBuildProfile {
  return value === 'corporate' ? 'corporate' : 'default'
}

export function getOrcaBuildProfile(): OrcaBuildProfile {
  const buildProfile = (globalThis as { __ORCA_BUILD_PROFILE__?: OrcaBuildProfile })
    .__ORCA_BUILD_PROFILE__
  if (buildProfile !== undefined) {
    return normalizeOrcaBuildProfile(buildProfile)
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

export function hostedMergePolicyFailureForBuildProfile(
  action: HostedMergePolicyAction,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): CorporateHostedMergePolicyError | null {
  return profile === 'corporate' ? new CorporateHostedMergePolicyError(action, profile) : null
}

export function assertAgentAllowedForBuildProfile(
  agent: TuiAgent,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): void {
  if (!isTuiAgentAllowedForBuildProfile(agent, profile)) {
    throw new CorporateAgentPolicyError(agent, profile)
  }
}

export function assertHostedMergeAllowedForBuildProfile(
  action: HostedMergePolicyAction,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): void {
  const failure = hostedMergePolicyFailureForBuildProfile(action, profile)
  if (failure) {
    throw failure
  }
}

export function findForbiddenPermissionBypassArgForBuildProfile(
  agent: TuiAgent,
  tokens: readonly string[],
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): string | null {
  return findForbiddenPermissionBypassArg(agent, tokens, profile)
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

export function resolveAgentArgsForBuildProfile(
  agent: TuiAgent,
  args: string | null | undefined,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): string {
  const trimmedArgs = args?.trim() ?? ''
  if (profile !== 'corporate') {
    return trimmedArgs
  }
  const recognized = recognizeAgentCommandLineFromCommandLine(`${agent} ${trimmedArgs}`, {
    includeHeadlessOneShot: true
  })
  const tokens = recognized?.tokens ?? [agent]
  if (
    findForbiddenPermissionBypassArgForBuildProfile(recognized?.agent ?? agent, tokens, profile)
  ) {
    return trimmedArgs
  }
  const requiredArgs = requiredSafePermissionArgs(agent, tokens)
  return [...(trimmedArgs ? [trimmedArgs] : []), requiredArgs.join(' ')].filter(Boolean).join(' ')
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

function recognizeAndValidateAgentLaunchForBuildProfile(
  launch: { launchAgent?: TuiAgent; command?: string | null | undefined },
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): ReturnType<typeof recognizeAgentCommandLineFromCommandLine> {
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
  return recognized
}

export function assertAgentLaunchAllowedForBuildProfile(
  launch: { launchAgent?: TuiAgent; command?: string | null | undefined },
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): void {
  const recognized = recognizeAndValidateAgentLaunchForBuildProfile(launch, profile)
  if (recognized) {
    if (
      profile === 'corporate' &&
      requiredSafePermissionArgs(recognized.agent, recognized.tokens).length
    ) {
      throw new CorporatePermissionBypassPolicyError(
        recognized.agent,
        profile,
        'missing corporate safe permission policy'
      )
    }
  }
}

export function resolveAgentLaunchForBuildProfile(
  launch: { launchAgent?: TuiAgent; command?: string | null | undefined },
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): { launchAgent?: TuiAgent; command?: string | null | undefined } {
  const recognized = recognizeAndValidateAgentLaunchForBuildProfile(launch, profile)
  if (profile !== 'corporate' || !launch.command) {
    return launch
  }
  if (!recognized || recognized.wrapped) {
    if (recognized && requiredSafePermissionArgs(recognized.agent, recognized.tokens).length) {
      throw new CorporatePermissionBypassPolicyError(
        recognized.agent,
        profile,
        'missing corporate safe permission policy'
      )
    }
    return launch
  }
  const requiredArgs = requiredSafePermissionArgs(recognized.agent, recognized.tokens)
  if (requiredArgs.length === 0) {
    return launch
  }
  return {
    ...launch,
    command: insertArgsBeforeOptionTerminator(launch.command, requiredArgs)
  }
}

export function isCliCommandEnabledForBuildProfile(
  commandPath: readonly string[],
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): boolean {
  const capability = CORPORATE_CLI_COMMAND_CAPABILITIES.get(commandPath[0] ?? '')
  return capability ? isCapabilityEnabledForBuildProfile(capability, profile) : true
}
