import { z } from 'zod'

export type RendererPrivilegedIpcOperation = 'terminate-workspace-port'

export type RendererPrivilegedIpcAuditEvent = {
  channel: string
  decision: 'allowed' | 'denied'
  operation: RendererPrivilegedIpcOperation
  reason?: 'invalid-params'
}

export type RendererPrivilegedIpcAuditSink = (
  event: RendererPrivilegedIpcAuditEvent
) => void

export const WorkspacePortKillIpcParams = z
  .object({
    repoId: z.string().min(1).optional(),
    pid: z.number().int().positive().safe(),
    port: z.number().int().min(1).max(65_535)
  })
  .strict()

export type WorkspacePortKillIpcParams = z.infer<typeof WorkspacePortKillIpcParams>

export function authorizeWorkspacePortKillIpc(
  rawParams: unknown,
  audit?: RendererPrivilegedIpcAuditSink
):
  | { ok: true; params: WorkspacePortKillIpcParams }
  | { ok: false; reason: 'invalid-params' } {
  const parsed = WorkspacePortKillIpcParams.safeParse(rawParams)
  if (!parsed.success) {
    audit?.({
      channel: 'workspacePorts:kill',
      decision: 'denied',
      operation: 'terminate-workspace-port',
      reason: 'invalid-params'
    })
    return { ok: false, reason: 'invalid-params' }
  }
  audit?.({
    channel: 'workspacePorts:kill',
    decision: 'allowed',
    operation: 'terminate-workspace-port'
  })
  return { ok: true, params: parsed.data }
}
