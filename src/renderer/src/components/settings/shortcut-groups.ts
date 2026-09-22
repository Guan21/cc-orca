import {
  KEYBINDING_DEFINITIONS,
  agentTabActionId,
  type KeybindingActionId,
  type KeybindingDefinition
} from '../../../../shared/keybindings'
import {
  filterEnabledTuiAgents,
  normalizeDisabledTuiAgents
} from '../../../../shared/tui-agent-selection'
import {
  getOrcaBuildProfile,
  type OrcaBuildProfile
} from '../../../../shared/corporate-build-profile'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { ALL_TUI_AGENTS } from '../../../../shared/tui-agent-display-names'

export type ShortcutGroup = {
  title: string
  items: KeybindingDefinition[]
}

export const EMPTY_DISABLED_TUI_AGENTS: readonly TuiAgent[] = []

export function disabledAgentTabActionIds(
  disabledTuiAgents: readonly TuiAgent[]
): KeybindingActionId[] {
  return normalizeDisabledTuiAgents(disabledTuiAgents).map((agent) => agentTabActionId(agent))
}

export function hiddenAgentTabActionIds(
  disabledTuiAgents: readonly TuiAgent[] = EMPTY_DISABLED_TUI_AGENTS,
  buildProfile: OrcaBuildProfile = getOrcaBuildProfile()
): KeybindingActionId[] {
  const enabled = new Set(filterEnabledTuiAgents(ALL_TUI_AGENTS, disabledTuiAgents, buildProfile))
  return ALL_TUI_AGENTS.filter((agent) => !enabled.has(agent)).map((agent) =>
    agentTabActionId(agent)
  )
}

export function isShortcutDefinitionVisibleForBuildProfile(
  definition: KeybindingDefinition,
  disabledTuiAgents: readonly TuiAgent[] = EMPTY_DISABLED_TUI_AGENTS,
  buildProfile: OrcaBuildProfile = getOrcaBuildProfile()
): boolean {
  return !hiddenAgentTabActionIds(disabledTuiAgents, buildProfile).includes(definition.id)
}

export function groupDefinitions(
  disabledTuiAgents: readonly TuiAgent[],
  additionalDefinitions: readonly KeybindingDefinition[] = []
): ShortcutGroup[] {
  // Why: per-agent launch rows only make sense for agents the current build
  // policy and user settings allow the chord to launch.
  const hiddenAgentActionIds = new Set<KeybindingActionId>(
    hiddenAgentTabActionIds(disabledTuiAgents)
  )
  const groups = new Map<string, KeybindingDefinition[]>()
  for (const definition of [...KEYBINDING_DEFINITIONS, ...additionalDefinitions]) {
    if (hiddenAgentActionIds.has(definition.id)) {
      continue
    }
    groups.set(definition.group, [...(groups.get(definition.group) ?? []), definition])
  }
  return Array.from(groups.entries()).map(([title, items]) => ({ title, items }))
}
