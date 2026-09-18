import { recognizeAgentCommandLineFromCommandLine } from '../../shared/agent-process-recognition'
import { getOrcaBuildProfile, type OrcaBuildProfile } from '../../shared/corporate-build-profile'
import type { TuiAgent } from '../../shared/tui-agent'
import type { PtySpawnOptions } from '../providers/types'

export const RUNTIME_SANDBOX_UNAVAILABLE = 'RUNTIME_SANDBOX_UNAVAILABLE'
export const RUNTIME_SANDBOX_SETUP_FAILED = 'RUNTIME_SANDBOX_SETUP_FAILED'

export class RuntimeSandboxUnavailableError extends Error {
  readonly code = RUNTIME_SANDBOX_UNAVAILABLE
  readonly profile: OrcaBuildProfile

  constructor(profile: OrcaBuildProfile) {
    super(RUNTIME_SANDBOX_UNAVAILABLE)
    this.name = 'RuntimeSandboxUnavailableError'
    this.profile = profile
  }
}

export class RuntimeSandboxSetupFailedError extends Error {
  readonly code = RUNTIME_SANDBOX_SETUP_FAILED
  readonly profile: OrcaBuildProfile
  readonly cause: unknown

  constructor(profile: OrcaBuildProfile, cause: unknown) {
    super(RUNTIME_SANDBOX_SETUP_FAILED)
    this.name = 'RuntimeSandboxSetupFailedError'
    this.profile = profile
    this.cause = cause
  }
}

export type AgentExecutionBoundaryKind = 'host' | 'restricted'

export type AgentExecutionBoundaryRequest = {
  profile: OrcaBuildProfile
  surface: 'local-pty' | 'daemon-pty'
  agent: TuiAgent
  spawn: PtySpawnOptions
}

export type PreparedAgentExecutionRuntime = {
  kind: AgentExecutionBoundaryKind
  spawn: PtySpawnOptions
  dispose?: () => void | Promise<void>
}

export type AgentExecutionBoundary = {
  kind: AgentExecutionBoundaryKind
  prepare: (
    request: AgentExecutionBoundaryRequest
  ) => PreparedAgentExecutionRuntime | Promise<PreparedAgentExecutionRuntime>
}

let restrictedAgentExecutionBoundary: AgentExecutionBoundary | null = null

export function setRestrictedAgentExecutionBoundaryForTests(
  boundary: AgentExecutionBoundary | null
): void {
  restrictedAgentExecutionBoundary = boundary
}

function isSandboxPolicyError(error: unknown): boolean {
  return (
    error instanceof RuntimeSandboxUnavailableError ||
    error instanceof RuntimeSandboxSetupFailedError
  )
}

function recognizedLaunchAgent(spawn: PtySpawnOptions): TuiAgent | null {
  if (spawn.launchAgent) {
    return spawn.launchAgent
  }
  return (
    recognizeAgentCommandLineFromCommandLine(spawn.command, {
      includeHeadlessOneShot: true
    })?.agent ?? null
  )
}

export function prepareAgentExecutionBoundaryForPtySpawn(
  spawn: PtySpawnOptions,
  surface: AgentExecutionBoundaryRequest['surface'],
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): Promise<PreparedAgentExecutionRuntime> | PreparedAgentExecutionRuntime {
  const agent = recognizedLaunchAgent(spawn)
  if (!agent || profile !== 'corporate') {
    return { kind: 'host', spawn }
  }
  const boundary = restrictedAgentExecutionBoundary
  if (!boundary || boundary.kind !== 'restricted') {
    throw new RuntimeSandboxUnavailableError(profile)
  }
  try {
    const prepared = boundary.prepare({ profile, surface, agent, spawn })
    if (prepared instanceof Promise) {
      return prepared
        .then((runtime) => validateRestrictedRuntime(runtime))
        .catch((error) => {
          if (isSandboxPolicyError(error)) {
            throw error
          }
          throw new RuntimeSandboxSetupFailedError(profile, error)
        })
    }
    return validateRestrictedRuntime(prepared)
  } catch (error) {
    if (isSandboxPolicyError(error)) {
      throw error
    }
    throw new RuntimeSandboxSetupFailedError(profile, error)
  }
}

function validateRestrictedRuntime(
  runtime: PreparedAgentExecutionRuntime
): PreparedAgentExecutionRuntime {
  if (runtime.kind !== 'restricted') {
    throw new Error('restricted boundary returned a host runtime')
  }
  return runtime
}

export async function disposePreparedAgentExecutionRuntime(
  runtime: PreparedAgentExecutionRuntime | null | undefined
): Promise<void> {
  await runtime?.dispose?.()
}
