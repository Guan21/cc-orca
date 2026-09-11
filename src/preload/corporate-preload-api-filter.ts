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

function createDisabledCapabilityFunction(capability: CorporateBuildCapability): () => Promise<never> {
  return () => Promise.reject(disabledCapabilityError(capability))
}

function createDisabledCapabilityNamespace(capability: CorporateBuildCapability): object {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') {
          return undefined
        }
        if (typeof property !== 'string') {
          return undefined
        }
        return () =>
          property.startsWith('on')
            ? noopUnsubscribe
            : Promise.reject(disabledCapabilityError(capability))
      }
    }
  )
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
    filtered[key] =
      shape === 'function'
        ? createDisabledCapabilityFunction(capability)
        : createDisabledCapabilityNamespace(capability)
  }
  return filtered as T
}
