import type { TuiAgent } from './tui-agent'
import type { TopLevelView } from './ui-chrome-types'
import { recognizeAgentCommandLineFromCommandLine } from './agent-process-recognition'
import { tokenizeStartupCommand } from './tui-agent-startup-shell'

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

const CLAUDE_PERMISSION_MODE_FLAGS = new Set(['--permission-mode'])
const CLAUDE_PERMISSION_MODE_CYCLE_BYPASS_FLAG = '--allow-dangerously-skip-permissions'
const CLAUDE_SAFE_PERMISSION_ARGS = ['--permission-mode', 'default'] as const
const CODEX_SANDBOX_FLAGS = new Set(['--sandbox', '-s'])
const CODEX_APPROVAL_FLAGS = new Set(['--ask-for-approval', '-a'])
const CODEX_CONFIG_FLAGS = new Set(['--config', '-c'])
const CODEX_SAFE_PERMISSION_ARGS = [
  '--sandbox',
  'workspace-write',
  '--ask-for-approval',
  'on-request'
] as const

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

function splitOptionToken(token: string): { flag: string; inlineValue?: string } {
  const separatorIndex = token.indexOf('=')
  return separatorIndex > 0
    ? { flag: token.slice(0, separatorIndex), inlineValue: token.slice(separatorIndex + 1) }
    : { flag: token }
}

function normalizedPolicyValue(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase()
}

function optionTokenScanEnd(tokens: readonly string[]): number {
  const terminatorIndex = tokens.indexOf('--')
  return terminatorIndex === -1 ? tokens.length : terminatorIndex
}

function optionTokens(tokens: readonly string[]): readonly string[] {
  return tokens.slice(0, optionTokenScanEnd(tokens))
}

function optionValues(tokens: readonly string[], flags: ReadonlySet<string>): string[] {
  const values: string[] = []
  const scanEnd = optionTokenScanEnd(tokens)
  for (let index = 1; index < scanEnd; index += 1) {
    const { flag, inlineValue } = splitOptionToken(tokens[index])
    if (!flags.has(flag)) {
      continue
    }
    const value = inlineValue ?? (index + 1 < scanEnd ? tokens[index + 1] : undefined)
    if (value !== undefined) {
      values.push(value)
    }
  }
  return values
}

function parseCodexConfigAssignment(value: string): { key: string; value: string } | null {
  const separatorIndex = value.indexOf('=')
  if (separatorIndex <= 0) {
    return null
  }
  return {
    key: value.slice(0, separatorIndex).trim().toLowerCase(),
    value: normalizedPolicyValue(value.slice(separatorIndex + 1))
  }
}

function hasClaudePermissionModeArg(tokens: readonly string[]): boolean {
  return optionValues(tokens, CLAUDE_PERMISSION_MODE_FLAGS).length > 0
}

function hasCodexSandboxPolicyArg(tokens: readonly string[]): boolean {
  return (
    optionValues(tokens, CODEX_SANDBOX_FLAGS).length > 0 ||
    optionValues(tokens, CODEX_CONFIG_FLAGS).some(
      (value) => parseCodexConfigAssignment(value)?.key === 'sandbox_mode'
    )
  )
}

function hasCodexApprovalPolicyArg(tokens: readonly string[]): boolean {
  return (
    optionValues(tokens, CODEX_APPROVAL_FLAGS).length > 0 ||
    optionValues(tokens, CODEX_CONFIG_FLAGS).some(
      (value) => parseCodexConfigAssignment(value)?.key === 'approval_policy'
    )
  )
}

function findClaudePermissionBypassArg(tokens: readonly string[]): string | null {
  if (optionTokens(tokens).includes(CLAUDE_PERMISSION_MODE_CYCLE_BYPASS_FLAG)) {
    return CLAUDE_PERMISSION_MODE_CYCLE_BYPASS_FLAG
  }
  return optionValues(tokens, CLAUDE_PERMISSION_MODE_FLAGS).some(
    (value) => normalizedPolicyValue(value) === 'bypasspermissions'
  )
    ? '--permission-mode bypassPermissions'
    : null
}

function findCodexPermissionBypassArg(tokens: readonly string[]): string | null {
  if (
    optionValues(tokens, CODEX_SANDBOX_FLAGS).some(
      (value) => normalizedPolicyValue(value) === 'danger-full-access'
    )
  ) {
    return '--sandbox danger-full-access'
  }
  if (
    optionValues(tokens, CODEX_APPROVAL_FLAGS).some(
      (value) => normalizedPolicyValue(value) === 'never'
    )
  ) {
    return '--ask-for-approval never'
  }
  const dangerousConfig = optionValues(tokens, CODEX_CONFIG_FLAGS)
    .map(parseCodexConfigAssignment)
    .find(
      (assignment) =>
        (assignment?.key === 'sandbox_mode' && assignment.value === 'danger-full-access') ||
        (assignment?.key === 'approval_policy' && assignment.value === 'never')
    )
  return dangerousConfig ? `-c ${dangerousConfig.key}=${dangerousConfig.value}` : null
}

function requiredSafePermissionArgs(agent: TuiAgent, tokens: readonly string[]): string[] {
  if (agent === 'claude') {
    return hasClaudePermissionModeArg(tokens) ? [] : [...CLAUDE_SAFE_PERMISSION_ARGS]
  }
  if (agent !== 'codex') {
    return []
  }
  const requiredArgs: string[] = []
  if (!hasCodexSandboxPolicyArg(tokens)) {
    requiredArgs.push(...CODEX_SAFE_PERMISSION_ARGS.slice(0, 2))
  }
  if (!hasCodexApprovalPolicyArg(tokens)) {
    requiredArgs.push(...CODEX_SAFE_PERMISSION_ARGS.slice(2))
  }
  return requiredArgs
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
  const scannedTokens = optionTokens(tokens)
  const forbiddenArg = forbiddenArgs.find((arg) => scannedTokens.includes(arg))
  if (forbiddenArg) {
    return forbiddenArg
  }
  if (agent === 'claude') {
    return findClaudePermissionBypassArg(tokens)
  }
  if (agent === 'codex') {
    return findCodexPermissionBypassArg(tokens)
  }
  return null
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

function insertArgsBeforeOptionTerminator(command: string, insertedArgs: readonly string[]): string {
  const inserted = insertedArgs.join(' ')
  const tokenized = tokenizeStartupCommand(command, 'posix')
  if (!tokenized.ok) {
    return `${command.trim()} ${inserted}`
  }
  const terminatorIndex = tokenized.tokens.indexOf('--')
  if (terminatorIndex === -1) {
    return `${command.trim()} ${inserted}`
  }
  const terminatorStart = tokenized.spans[terminatorIndex]?.start
  if (terminatorStart === undefined) {
    return `${command.trim()} ${inserted}`
  }
  const beforeTerminator = command.slice(0, terminatorStart).trimEnd()
  const terminatorAndAfter = command.slice(terminatorStart).trimStart()
  return [beforeTerminator, inserted, terminatorAndAfter].filter(Boolean).join(' ')
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
