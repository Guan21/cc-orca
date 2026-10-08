import type { ProjectAgentSkillRuntime } from '@/lib/project-skill-runtime'
import { e2eConfig } from '@/lib/e2e-config'
import { getOrcaBuildProfile } from '../../../../shared/corporate-build-profile'
import type {
  OnboardingFeatureSetupDeps,
  OnboardingFeatureSetupSelection,
  OnboardingFeatureSetupWarning
} from './onboarding-feature-setup'

export function buildCorporateBundledSkillCommand(
  selection: OnboardingFeatureSetupSelection,
  commandName = 'orca'
): string | null {
  const skills = [
    selection.browserUse ? 'orca-cli' : null,
    selection.orchestration ? 'orchestration' : null
  ].filter(Boolean)
  return skills.length
    ? `${commandName} skills install ${skills.map((skill) => `--skill ${skill}`).join(' ')} --agent claude-code,codex`
    : null
}

export type OnboardingFeatureSetupRuntimeContext = {
  agentRuntime?: ProjectAgentSkillRuntime
  installDisabledReason: string | null
  terminalShellOverride?: string
}

export function getE2EOnboardingFeatureSetupDeps(): OnboardingFeatureSetupDeps | null {
  if (!e2eConfig.enabled || typeof window === 'undefined') {
    return null
  }
  return (
    (window as unknown as { __onboardingFeatureSetupDeps?: OnboardingFeatureSetupDeps })
      .__onboardingFeatureSetupDeps ?? null
  )
}

export function getOnboardingFeatureSetupAgentRuntime(
  context: OnboardingFeatureSetupRuntimeContext
): ProjectAgentSkillRuntime | undefined {
  return getOrcaBuildProfile() === 'corporate' || context.installDisabledReason
    ? undefined
    : context.agentRuntime
}

export async function copyOnboardingSkillCommand(
  clipboardText: string | null,
  deps: OnboardingFeatureSetupDeps,
  warnings: OnboardingFeatureSetupWarning[]
): Promise<boolean> {
  if (!clipboardText) {
    return false
  }
  try {
    await deps.writeClipboardText(clipboardText)
    return true
  } catch (error) {
    warnings.push({
      featureId: 'skills',
      message: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}
