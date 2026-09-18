import { getAgentCatalog, type AgentCatalogEntry } from '@/lib/agent-catalog'
import {
  getOrcaBuildProfile,
  type OrcaBuildProfile
} from '../../../../shared/corporate-build-profile'
import { isTuiAgentEnabled } from '../../../../shared/tui-agent-selection'
import type { TuiAgent } from '../../../../shared/tui-agent'

export function normalizeSourceControlDialogSavedAgent(
  savedAgentId: TuiAgent | null | undefined,
  disabledAgents?: Iterable<unknown> | null
): TuiAgent | null {
  return savedAgentId && isTuiAgentEnabled(savedAgentId, disabledAgents) ? savedAgentId : null
}

export function listSourceControlDialogAgentOptions(args: {
  enabledDetectedAgents: TuiAgent[]
  selectedAgent: TuiAgent | null
  buildProfile?: OrcaBuildProfile
}): AgentCatalogEntry[] {
  const buildProfile = args.buildProfile ?? getOrcaBuildProfile()
  return getAgentCatalog().filter(
    (entry) =>
      args.enabledDetectedAgents.includes(entry.id) ||
      (buildProfile !== 'corporate' && entry.id === args.selectedAgent)
  )
}

export function getSourceControlDialogAgentLabel(agentId: TuiAgent | null): string {
  return getAgentCatalog().find((entry) => entry.id === agentId)?.label ?? agentId ?? ''
}
