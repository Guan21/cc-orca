import type { TuiAgent } from './tui-agent'
import type { OrcaBuildProfile } from './corporate-build-profile'
import { tokenizeStartupCommand } from './tui-agent-startup-shell'

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

export function requiredSafePermissionArgs(agent: TuiAgent, tokens: readonly string[]): string[] {
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

export function findForbiddenPermissionBypassArg(
  agent: TuiAgent,
  tokens: readonly string[],
  profile: OrcaBuildProfile
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

export function insertArgsBeforeOptionTerminator(
  command: string,
  insertedArgs: readonly string[]
): string {
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
