import {
  getOrcaBuildProfile,
  isCapabilityEnabledForBuildProfile,
  type CorporateBuildCapability,
  type OrcaBuildProfile
} from '../shared/corporate-build-profile'
import type { PreloadApi } from './api-types'

type PreloadApiCapabilityGate = {
  key: keyof PreloadApi
  capability: CorporateBuildCapability
  shape: 'function' | 'namespace'
}

const CORPORATE_PRELOAD_API_CAPABILITY_GATES = [
  { key: 'aiVault', capability: 'ai-vault', shape: 'namespace' },
  { key: 'computerUsePermissions', capability: 'computer-use', shape: 'namespace' },
  { key: 'emulator', capability: 'emulator', shape: 'namespace' },
  { key: 'mobile', capability: 'mobile', shape: 'namespace' },
  { key: 'nativeChat', capability: 'native-chat', shape: 'namespace' },
  { key: 'plugins', capability: 'plugins', shape: 'namespace' },
  { key: 'skills', capability: 'skills', shape: 'namespace' },
  { key: 'speech', capability: 'speech', shape: 'namespace' },
  { key: 'ssh', capability: 'ssh-remote', shape: 'namespace' },
  { key: 'telemetryTrack', capability: 'telemetry', shape: 'function' },
  { key: 'telemetrySetOptIn', capability: 'telemetry', shape: 'function' },
  { key: 'telemetryAcknowledgeBanner', capability: 'telemetry', shape: 'function' },
  { key: 'telemetryGetConsentState', capability: 'telemetry', shape: 'function' }
] as const satisfies readonly PreloadApiCapabilityGate[]

const noopUnsubscribe = () => undefined

function disabledCapabilityError(capability: CorporateBuildCapability): Error {
  return new Error(`Capability disabled in corporate build: ${capability}`)
}

function createDisabledCapabilityFunction(
  capability: CorporateBuildCapability,
  key?: string
): () => Promise<never> | (() => undefined) {
  return () =>
    key?.startsWith('on')
      ? noopUnsubscribe
      : Promise.reject(disabledCapabilityError(capability))
}

function isBridgeNamespace(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createDisabledCapabilityValue(
  capability: CorporateBuildCapability,
  value: unknown,
  key?: string
): unknown {
  if (typeof value === 'function') {
    return createDisabledCapabilityFunction(capability, key)
  }
  if (isBridgeNamespace(value)) {
    return createDisabledCapabilityNamespace(capability, value)
  }
  return value
}

function createDisabledCapabilityNamespace(
  capability: CorporateBuildCapability,
  namespace: unknown
): object {
  const disabledNamespace: Record<string, unknown> = {}
  if (!isBridgeNamespace(namespace)) {
    return disabledNamespace
  }

  for (const [key, value] of Object.entries(namespace)) {
    disabledNamespace[key] = createDisabledCapabilityValue(capability, value, key)
  }
  return disabledNamespace
}

function createDisabledCapabilityReplacement(
  api: Record<string, unknown>,
  capability: CorporateBuildCapability,
  key: string,
  shape: PreloadApiCapabilityGate['shape']
): unknown {
  return shape === 'function'
    ? createDisabledCapabilityFunction(capability)
    : createDisabledCapabilityNamespace(capability, api[key])
}

export function filterPreloadApiForBuildProfile<T extends object>(
  api: T,
  profile: OrcaBuildProfile = getOrcaBuildProfile()
): T {
  if (profile !== 'corporate') {
    return api
  }

  const filtered = { ...api } as Record<string, unknown>
  for (const { capability, key, shape } of CORPORATE_PRELOAD_API_CAPABILITY_GATES) {
    if (isCapabilityEnabledForBuildProfile(capability, profile)) {
      continue
    }
    filtered[key] = createDisabledCapabilityReplacement(filtered, capability, key, shape)
  }
  return filtered as T
}
