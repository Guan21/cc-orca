import { RuntimeClientError } from './runtime/types'
import type { CommandSpec } from './command-spec'
import {
  AGENT_NOT_ALLOWED_BY_ORG_POLICY,
  CorporateAgentPolicyError,
  CorporatePermissionBypassPolicyError,
  PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY,
  assertAgentAllowedForBuildProfile,
  assertAgentLaunchAllowedForBuildProfile,
  type OrcaBuildProfile
} from '../shared/corporate-build-profile'
import { isTuiAgent } from '../shared/tui-agent-config'

function rethrowCliAgentPolicyError(error: unknown): never {
  if (error instanceof CorporateAgentPolicyError) {
    throw new RuntimeClientError(AGENT_NOT_ALLOWED_BY_ORG_POLICY, AGENT_NOT_ALLOWED_BY_ORG_POLICY)
  }
  if (error instanceof CorporatePermissionBypassPolicyError) {
    throw new RuntimeClientError(
      PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY,
      PERMISSION_BYPASS_NOT_ALLOWED_BY_ORG_POLICY
    )
  }
  throw error
}

export function validateAgentLaunchPolicyForCli(
  spec: CommandSpec,
  flags: Map<string, string | boolean>,
  profile: OrcaBuildProfile
): void {
  try {
    const joined = spec.path.join(' ')
    const agentFlag = flags.get('agent')
    const agent =
      joined === 'worktree create' && typeof agentFlag === 'string' ? agentFlag : undefined
    if (agent !== undefined && isTuiAgent(agent)) {
      assertAgentAllowedForBuildProfile(agent, profile)
    }
    const providerFlag = flags.get('provider')
    const provider =
      (joined === 'automations create' || joined === 'automations edit') &&
      typeof providerFlag === 'string'
        ? providerFlag
        : undefined
    if (provider !== undefined && isTuiAgent(provider)) {
      assertAgentAllowedForBuildProfile(provider, profile)
    }
    const commandFlag = flags.get('command')
    const command =
      (joined === 'terminal create' || joined === 'terminal split') &&
      typeof commandFlag === 'string'
        ? commandFlag
        : undefined
    if (command !== undefined) {
      assertAgentLaunchAllowedForBuildProfile({ command }, profile)
    }
  } catch (error) {
    rethrowCliAgentPolicyError(error)
  }
}
