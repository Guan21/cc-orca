import type { TuiAgent } from './tui-agent'
import {
  getOrcaBuildProfile,
  isTuiAgentAllowedForBuildProfile,
  type OrcaBuildProfile
} from './corporate-build-profile'
import { isTuiAgent } from './tui-agent-config'

// Keep this order in sync with the desktop agent catalog. It defines the
// automatic fallback priority when the user has not chosen a default agent.
export const TUI_AGENT_AUTO_PICK_ORDER = [
  'claude',
  'claude-agent-teams',
  'openclaude',
  'codex',
  'grok',
  'copilot',
  'opencode',
  'mimo-code',
  'ante',
  'trae',
  'pi',
  'omp',
  'prime-agent',
  'gemini',
  'antigravity',
  'aider',
  'goose',
  'amp',
  'kilo',
  'kiro',
  'crush',
  'aug',
  'autohand',
  'cline',
  'codebuff',
  'command-code',
  'continue',
  'cursor',
  'droid',
  'kimi',
  'mistral-vibe',
  'qwen-code',
  'rovo',
  'hermes',
  'devin',
  'openclaw'
] as const satisfies readonly TuiAgent[]

// Why: fresh installs should expose Claude Agent Teams in agent pickers; the
// persistence migration separately preserves the old hidden default for legacy profiles.
export const DEFAULT_DISABLED_TUI_AGENTS = [] as const satisfies readonly TuiAgent[]

export function pickTuiAgent(
  preferred: TuiAgent | 'blank' | null | undefined,
  detected: Iterable<TuiAgent>,
  disabled?: Iterable<unknown> | null,
  buildProfile: OrcaBuildProfile = getOrcaBuildProfile()
): TuiAgent | null {
  if (preferred === 'blank') {
    return null
  }
  const disabledSet = new Set(normalizeDisabledTuiAgents(disabled))
  const detectedSet = detected instanceof Set ? detected : new Set(detected)
  if (
    preferred &&
    detectedSet.has(preferred) &&
    !disabledSet.has(preferred) &&
    isTuiAgentAllowedForBuildProfile(preferred, buildProfile)
  ) {
    return preferred
  }
  for (const agent of TUI_AGENT_AUTO_PICK_ORDER) {
    if (
      detectedSet.has(agent) &&
      !disabledSet.has(agent) &&
      isTuiAgentAllowedForBuildProfile(agent, buildProfile)
    ) {
      return agent
    }
  }
  return null
}

export function normalizeDisabledTuiAgents(value: unknown): TuiAgent[] {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<TuiAgent>()
  for (const item of value) {
    if (isTuiAgent(item)) {
      seen.add(item)
    }
  }
  return [...seen]
}

export function haveSameDisabledTuiAgents(left: unknown, right: unknown): boolean {
  const leftSet = new Set(normalizeDisabledTuiAgents(left))
  const rightSet = new Set(normalizeDisabledTuiAgents(right))
  return leftSet.size === rightSet.size && [...leftSet].every((agent) => rightSet.has(agent))
}

export function isTuiAgentEnabled(
  agent: TuiAgent,
  disabled?: Iterable<unknown> | null,
  buildProfile: OrcaBuildProfile = getOrcaBuildProfile()
): boolean {
  return (
    !normalizeDisabledTuiAgents(disabled).includes(agent) &&
    isTuiAgentAllowedForBuildProfile(agent, buildProfile)
  )
}

export function filterEnabledTuiAgents<T extends TuiAgent>(
  agents: Iterable<T>,
  disabled?: Iterable<unknown> | null,
  buildProfile: OrcaBuildProfile = getOrcaBuildProfile()
): T[] {
  const disabledSet = new Set(normalizeDisabledTuiAgents(disabled))
  return [...agents].filter(
    (agent) => !disabledSet.has(agent) && isTuiAgentAllowedForBuildProfile(agent, buildProfile)
  )
}

export function getTuiAgentDisplayLabel(
  agent: TuiAgent,
  defaultLabel: string,
  buildProfile: OrcaBuildProfile = getOrcaBuildProfile()
): string {
  return buildProfile === 'corporate' && agent === 'claude' ? 'Claude Code' : defaultLabel
}
