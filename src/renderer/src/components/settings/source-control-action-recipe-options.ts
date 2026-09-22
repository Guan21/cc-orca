import type { TuiAgent } from '../../../../shared/tui-agent'
import {
  SOURCE_CONTROL_TEXT_ACTION_IDS,
  type SourceControlActionId
} from '../../../../shared/source-control-ai-actions'
import {
  CUSTOM_AGENT_ID,
  type CustomAgentId,
  getCommitMessageAgentCapability,
  isCustomAgentId,
  isCustomCommitMessageAgentAllowedForBuildProfile,
  listCommitMessageAgentCapabilities
} from '../../../../shared/commit-message-agent-spec'
import {
  getOrcaBuildProfile,
  type OrcaBuildProfile
} from '../../../../shared/corporate-build-profile'
import { getAgentCatalog, type AgentCatalogEntry } from '@/lib/agent-catalog'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { getProductDisplayName } from '../../../../shared/product-display-name'

export const SOURCE_CONTROL_TEXT_ACTION_ID_SET = new Set<string>(SOURCE_CONTROL_TEXT_ACTION_IDS)

function getTextGenerationAgentCapabilities(
  buildProfile: OrcaBuildProfile = getOrcaBuildProfile()
) {
  return listCommitMessageAgentCapabilities(buildProfile)
}

function getTextGenerationAgentIdSet(buildProfile: OrcaBuildProfile = getOrcaBuildProfile()) {
  return new Set(
    getTextGenerationAgentCapabilities(buildProfile).map((capability) => capability.id)
  )
}

export const getActionDescriptions = createLocalizedCatalog(
  (): Record<SourceControlActionId, string> => ({
    commitMessage: translate(
      'auto.components.settings.source.control.action.recipe.options.commitMessage',
      'Generate the commit message from staged changes.'
    ),
    pullRequest: translate(
      'auto.components.settings.source.control.action.recipe.options.pullRequest',
      'Generate the hosted review title and description.'
    ),
    branchName: translate(
      'auto.components.settings.source.control.action.recipe.options.branchName',
      'Rename {{productName}}-created branches from the initial agent task.',
      { productName: getProductDisplayName() }
    ),
    fixCommitFailure: translate(
      'auto.components.settings.source.control.action.recipe.options.fixCommitFailure',
      'Start an agent when a commit hook or git commit fails.'
    ),
    fixPushFailure: translate(
      'auto.components.settings.source.control.action.recipe.options.fixPushFailure',
      'Start an agent when a pre-push hook or git push fails.'
    ),
    fixChecks: translate(
      'auto.components.settings.source.control.action.recipe.options.fixChecks',
      'Start an agent from failed hosted-review checks.'
    ),
    resolveConflicts: translate(
      'auto.components.settings.source.control.action.recipe.options.resolveConflicts',
      'Start an agent for local or hosted-review merge conflicts.'
    ),
    resolveComments: translate(
      'auto.components.settings.source.control.action.recipe.options.resolveComments',
      'Start an agent from selected unresolved PR or MR comments.'
    )
  })
)

const FALLBACK_AGENT_ARGS_PLACEHOLDER = '--model sonnet'

const AGENT_ARGS_PLACEHOLDER_OVERRIDES: Partial<Record<TuiAgent, string>> = {
  // Why: Source Control AI action prompts are short, reviewable tasks; the
  // mini Codex model is a better default hint than the frontier model.
  codex: '--model gpt-5.4-mini',
  copilot: '--model gpt-5.4-mini'
}

const MODEL_FLAG_BY_AGENT: Partial<Record<TuiAgent, string>> = {
  amp: '--mode'
}

export function getSourceControlAgentArgsPlaceholder(
  agentId: TuiAgent | CustomAgentId | null | undefined
): string {
  if (!agentId) {
    return FALLBACK_AGENT_ARGS_PLACEHOLDER
  }

  if (agentId === CUSTOM_AGENT_ID) {
    return '--flag value'
  }

  const override = AGENT_ARGS_PLACEHOLDER_OVERRIDES[agentId]
  if (override) {
    return override
  }

  const capability = getCommitMessageAgentCapability(agentId)
  if (!capability) {
    return '--model <model>'
  }

  return `${MODEL_FLAG_BY_AGENT[agentId] ?? '--model'} ${capability.defaultModelId}`
}

// Why: text-generation actions can only run agents that produce a single
// response, so restrict the picker while still surfacing an already-selected
// agent even if it is no longer a supported text generator.
export function getAgentCatalogForAction(
  actionId: SourceControlActionId,
  selectedAgent: TuiAgent | CustomAgentId | null | undefined
): AgentCatalogEntry[] {
  if (!SOURCE_CONTROL_TEXT_ACTION_ID_SET.has(actionId)) {
    return getAgentCatalog()
  }
  const buildProfile = getOrcaBuildProfile()
  const capabilityLabels = new Map(
    getTextGenerationAgentCapabilities(buildProfile).map((capability) => [
      capability.id,
      capability.label
    ])
  )
  return getAgentCatalog()
    .filter(
      (agent) =>
        capabilityLabels.has(agent.id) ||
        (buildProfile !== 'corporate' && agent.id === selectedAgent)
    )
    .map((agent) => ({
      ...agent,
      label: capabilityLabels.get(agent.id) ?? agent.label
    }))
}

function formatSupportedAgentLabels(): string {
  const buildProfile = getOrcaBuildProfile()
  const labels = getTextGenerationAgentCapabilities(buildProfile).map(
    (capability) => capability.label
  )
  if (isCustomCommitMessageAgentAllowedForBuildProfile(buildProfile)) {
    labels.push(
      translate(
        'auto.components.settings.source.control.action.recipe.options.customCommand',
        'Custom command'
      )
    )
  }
  return labels.join(', ')
}

export function getSourceControlActionAgentSupportText(
  actionId: SourceControlActionId
): string | null {
  if (!SOURCE_CONTROL_TEXT_ACTION_ID_SET.has(actionId)) {
    return null
  }
  return translate(
    'auto.components.settings.source.control.action.recipe.options.supportedAgents',
    'Supported agents for this recipe: {{value0}}.',
    { value0: formatSupportedAgentLabels() }
  )
}

export function getSourceControlActionAgentWarningText(
  actionId: SourceControlActionId,
  selectedAgent: TuiAgent | CustomAgentId | null | undefined
): string | null {
  if (!SOURCE_CONTROL_TEXT_ACTION_ID_SET.has(actionId)) {
    return null
  }

  if (selectedAgent && !isCustomAgentId(selectedAgent)) {
    const buildProfile = getOrcaBuildProfile()
    if (getTextGenerationAgentIdSet(buildProfile).has(selectedAgent)) {
      return null
    }
    if (buildProfile === 'corporate') {
      return null
    }
    const agentLabel = getAgentCatalog().find((agent) => agent.id === selectedAgent)?.label
    return translate(
      'auto.components.settings.source.control.action.recipe.options.unsupportedSavedAgent',
      '{{value0}} cannot run this text-generation recipe. Pick one of the supported agents below.',
      { value0: agentLabel ?? selectedAgent }
    )
  }

  return null
}
