import type { MainPersonalProjectSourceAuthority } from './project-source-personal-authority'
import type {
  MainSelectedPrOperationContext,
  TrustedSelectedPrBinding
} from './project-source-grant-registry'
import type {
  MainSelectedPrHeadAuthority,
  MainSelectedPrHeadEvidence
} from './project-source-main-pr-head-contract'
import type { MainTrustedSelectedPrHeadProvider } from './project-source-main-pr-head-provider'

/** The worktree source also owns host-setup and execution-host replacement. */
export const SOURCE_LIFECYCLE_DOMAINS = Object.freeze([
  'project',
  'worktree',
  'repository',
  'selectedPr',
  'window',
  'frame',
  'document',
  'session',
  'principal',
  'credential',
  'grant',
  'policy',
  'head'
] as const)
export const SOURCE_READINESS_GATES = Object.freeze([
  'owner',
  'exactSha',
  'nativeQa',
  'effectiveAcl',
  'nativeCustody'
] as const)

export type MainSelectedPrCompositionOptions = Readonly<{
  enabled?: boolean
  authority?: Pick<MainPersonalProjectSourceAuthority, 'run' | 'attest' | 'retireAll'>
  provider?: MainTrustedSelectedPrHeadProvider
  readCurrent?: () => MainSelectedPrHeadAuthority | null
  readiness?: Partial<Record<(typeof SOURCE_READINESS_GATES)[number], () => boolean>>
  lifecycle?: Partial<
    Record<(typeof SOURCE_LIFECYCLE_DOMAINS)[number], (listener: () => void) => () => void>
  >
  /** Offline mock only; no production transport or credential source is installed. */
  readProjection?: (
    binding: TrustedSelectedPrBinding,
    head: MainSelectedPrHeadEvidence,
    signal: AbortSignal,
    context: MainSelectedPrOperationContext
  ) => Promise<unknown>
}>
export type MainSelectedPrCompositionResult = Readonly<{
  status: 'delivered' | 'denied' | 'unavailable' | 'stale' | 'incomplete' | 'expired' | 'revoked'
}>
