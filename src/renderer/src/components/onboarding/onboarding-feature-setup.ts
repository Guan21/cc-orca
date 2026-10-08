import { getOrcaBuildProfile } from '../../../../shared/corporate-build-profile'
import type { CliInstallStatus } from '../../../../shared/cli-install-types'
import type {
  ComputerUsePermissionSetupResult,
  ComputerUsePermissionStatusResult
} from '../../../../shared/computer-use-permissions-types'
import {
  COMPUTER_USE_SKILL_NAME,
  ORCA_LINEAR_SKILL_NAME,
  ORCA_CLI_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME,
  buildAgentFeatureSkillInstallCommand
} from '@/lib/agent-feature-install-commands'
import { BROWSER_USE_ENABLED_STORAGE_KEY } from '@/lib/browser-use-setup-state'
import { showOrcaCliRegistrationPromptToast } from '@/lib/agent-skill-cli-prerequisite'
import type { ProjectAgentSkillRuntime } from '@/lib/project-skill-runtime'
import type { OnboardingFeatureSetupRuntimeContext } from './onboarding-feature-setup-runtime'
import {
  buildCorporateBundledSkillCommand,
  copyOnboardingSkillCommand,
  getE2EOnboardingFeatureSetupDeps
} from './onboarding-feature-setup-runtime'
import {
  buildSkillCommandForRuntime,
  getWslCliDistroRequest
} from '../settings/CliSkillRuntimeSetup'
import {
  ORCHESTRATION_ENABLED_STORAGE_KEY,
  ORCHESTRATION_SETUP_DISMISSED_STORAGE_KEY,
  notifyOrchestrationSetupStateChanged
} from '@/lib/orchestration-setup-state'
import type { EventProps } from '../../../../shared/telemetry-events'

export type OnboardingFeatureSetupId =
  | 'browserUse'
  | 'computerUse'
  | 'orchestration'
  | 'linearTickets'

export type OnboardingFeatureSetupSelection = Record<OnboardingFeatureSetupId, boolean>

export const DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION: OnboardingFeatureSetupSelection = {
  browserUse: true,
  computerUse: getOrcaBuildProfile() !== 'corporate',
  orchestration: true,
  linearTickets: false
}

export const ONBOARDING_FEATURE_SETUP_IDS: readonly OnboardingFeatureSetupId[] = [
  'browserUse',
  'computerUse',
  'orchestration',
  'linearTickets'
]

const ONBOARDING_PROGRESS_FEATURE_SETUP_IDS: readonly OnboardingFeatureSetupId[] = [
  'browserUse',
  'computerUse',
  'orchestration'
]

const FEATURE_SKILL_NAMES: Record<OnboardingFeatureSetupId, string> = {
  browserUse: ORCA_CLI_SKILL_NAME,
  computerUse: COMPUTER_USE_SKILL_NAME,
  orchestration: ORCHESTRATION_SKILL_NAME,
  linearTickets: ORCA_LINEAR_SKILL_NAME
}

const FEATURE_TELEMETRY_IDS: Record<
  OnboardingFeatureSetupId,
  EventProps<'onboarding_feature_setup_toggled'>['feature']
> = {
  browserUse: 'browser_use',
  computerUse: 'computer_use',
  orchestration: 'orchestration',
  linearTickets: 'linear_tickets'
}

export type OnboardingFeatureSetupWarning = {
  featureId: OnboardingFeatureSetupId | 'cli' | 'skills'
  message: string
}

export type OnboardingFeatureSetupResult = {
  selectedIds: OnboardingFeatureSetupId[]
  cliTouched: boolean
  skillCommandsCopied: boolean
  skillInstallCommand: string | null
  computerUsePermissionsOpened: boolean
  warnings: OnboardingFeatureSetupWarning[]
}

export type OnboardingFeatureSetupDeps = {
  getCliStatus: () => Promise<CliInstallStatus>
  showCliRegistrationPrompt?: () => Promise<void>
  installCli: () => Promise<CliInstallStatus>
  writeClipboardText: (text: string) => Promise<void>
  getComputerUsePermissionStatus: () => Promise<ComputerUsePermissionStatusResult>
  openComputerUsePermissionSetup: () => Promise<ComputerUsePermissionSetupResult>
  setStorageItem: (key: string, value: string) => void
  removeStorageItem: (key: string) => void
  notifyOrchestrationStateChanged: () => void
}

export function hasSelectedOnboardingFeatureSetup(
  selection: OnboardingFeatureSetupSelection
): boolean {
  return ONBOARDING_FEATURE_SETUP_IDS.some((id) => selection[id])
}

export function selectedOnboardingFeatureSetupIds(
  selection: OnboardingFeatureSetupSelection
): OnboardingFeatureSetupId[] {
  return ONBOARDING_FEATURE_SETUP_IDS.filter((id) => selection[id])
}

export function buildOnboardingFeatureSetupClipboardText(
  selection: OnboardingFeatureSetupSelection,
  agentRuntime?: ProjectAgentSkillRuntime
): string | null {
  const command = buildOnboardingFeatureSetupSkillCommand(selection)
  return command === null ? null : buildSkillCommandForRuntime(command, agentRuntime)
}

export function buildOnboardingFeatureSetupSkillCommand(
  selection: OnboardingFeatureSetupSelection
): string | null {
  if (getOrcaBuildProfile() === 'corporate') {
    return buildCorporateBundledSkillCommand(selection)
  }
  const skillNames = selectedOnboardingFeatureSetupIds(selection).map(
    (id) => FEATURE_SKILL_NAMES[id]
  )
  if (skillNames.length === 0) {
    return null
  }
  try {
    return buildAgentFeatureSkillInstallCommand(skillNames)
  } catch {
    return null
  }
}

export function onboardingFeatureSetupTelemetryFeature(
  id: OnboardingFeatureSetupId
): EventProps<'onboarding_feature_setup_toggled'>['feature'] {
  return FEATURE_TELEMETRY_IDS[id]
}

export function onboardingFeatureSetupTelemetrySelection(
  selection: OnboardingFeatureSetupSelection
): EventProps<'onboarding_feature_setup_terminal_opened'> {
  return {
    browser_use: selection.browserUse,
    computer_use: selection.computerUse,
    linear_tickets: selection.linearTickets,
    orchestration: selection.orchestration,
    selected_count: selectedOnboardingProgressFeatureSetupIds(selection).length
  }
}

function selectedOnboardingProgressFeatureSetupIds(
  selection: OnboardingFeatureSetupSelection
): OnboardingFeatureSetupId[] {
  return ONBOARDING_PROGRESS_FEATURE_SETUP_IDS.filter((id) => selection[id])
}

export function onboardingFeatureSetupRunTelemetry(
  selection: OnboardingFeatureSetupSelection,
  result: OnboardingFeatureSetupResult
): EventProps<'onboarding_feature_setup_run'> {
  return {
    ...onboardingFeatureSetupTelemetrySelection(selection),
    cli_touched: result.cliTouched,
    skill_commands_copied: result.skillCommandsCopied,
    skill_install_command_prepared: result.skillInstallCommand !== null,
    computer_use_permissions_opened: result.computerUsePermissionsOpened,
    warning_count: result.warnings.length
  }
}

export function createOnboardingFeatureSetupDeps(
  agentRuntime?: ProjectAgentSkillRuntime
): OnboardingFeatureSetupDeps {
  const e2eDeps = getE2EOnboardingFeatureSetupDeps()
  if (e2eDeps) {
    return e2eDeps
  }

  const wslDistroRequest =
    agentRuntime?.runtime === 'wsl' ? getWslCliDistroRequest(agentRuntime) : undefined
  const isWsl = agentRuntime?.runtime === 'wsl' && getOrcaBuildProfile() !== 'corporate'
  return {
    getCliStatus: () =>
      isWsl
        ? window.api.cli.getWslInstallStatus(wslDistroRequest)
        : window.api.cli.getInstallStatus(),
    showCliRegistrationPrompt: showOrcaCliRegistrationPromptToast,
    installCli: () =>
      isWsl ? window.api.cli.installWsl(wslDistroRequest) : window.api.cli.install(),
    writeClipboardText: (text) => window.api.ui.writeClipboardText(text),
    getComputerUsePermissionStatus: () => window.api.computerUsePermissions.getStatus(),
    openComputerUsePermissionSetup: () => window.api.computerUsePermissions.openSetup(),
    setStorageItem: (key, value) => localStorage.setItem(key, value),
    removeStorageItem: (key) => localStorage.removeItem(key),
    notifyOrchestrationStateChanged: notifyOrchestrationSetupStateChanged
  }
}

export async function runOnboardingFeatureSetup(
  selection: OnboardingFeatureSetupSelection,
  explicitDeps?: OnboardingFeatureSetupDeps,
  runtimeContext?: OnboardingFeatureSetupRuntimeContext
): Promise<OnboardingFeatureSetupResult> {
  const corporate = getOrcaBuildProfile() === 'corporate'
  if (corporate) {
    selection = { ...selection, computerUse: false, linearTickets: false }
  }
  const agentRuntime =
    corporate || runtimeContext?.installDisabledReason ? undefined : runtimeContext?.agentRuntime
  const deps = explicitDeps ?? createOnboardingFeatureSetupDeps(agentRuntime)
  const selectedIds = selectedOnboardingFeatureSetupIds(selection)
  const warnings: OnboardingFeatureSetupWarning[] = []
  let cliTouched = false
  let skillCommandsCopied = false
  let skillInstallCommand = buildOnboardingFeatureSetupSkillCommand(selection)
  let computerUsePermissionsOpened = false

  deps.setStorageItem(BROWSER_USE_ENABLED_STORAGE_KEY, selection.browserUse ? '1' : '0')
  deps.setStorageItem(ORCHESTRATION_ENABLED_STORAGE_KEY, selection.orchestration ? '1' : '0')
  if (selection.orchestration) {
    deps.removeStorageItem(ORCHESTRATION_SETUP_DISMISSED_STORAGE_KEY)
  }
  deps.notifyOrchestrationStateChanged()

  if (selectedIds.length === 0) {
    return {
      selectedIds,
      cliTouched,
      skillCommandsCopied,
      skillInstallCommand,
      computerUsePermissionsOpened,
      warnings
    }
  }

  try {
    let status = await deps.getCliStatus()
    if (!status.supported) {
      warnings.push({
        featureId: 'cli',
        message: status.detail ?? 'DevCrew CLI registration is not available on this platform.'
      })
    } else if (status.pathConfigured === null) {
      // Why: an unknown registry read cannot safely drive a PATH read-modify-write.
      warnings.push({
        featureId: 'cli',
        message: status.detail ?? 'DevCrew could not check your Windows user PATH.'
      })
    } else if (status.state !== 'installed' || status.pathConfigured === false) {
      await deps.showCliRegistrationPrompt?.()
      const next = await deps.installCli()
      status = next
      cliTouched = true
      if (next.state !== 'installed') {
        warnings.push({
          featureId: 'cli',
          message: next.detail ?? 'DevCrew CLI registration needs attention.'
        })
      } else if (next.pathConfigured !== true && next.detail) {
        warnings.push({ featureId: 'cli', message: next.detail })
      }
    }
    if (corporate) {
      skillInstallCommand = buildCorporateBundledSkillCommand(selection, status.commandName)
    }
  } catch (error) {
    warnings.push({ featureId: 'cli', message: formatFeatureSetupError(error) })
  }

  if (selection.computerUse) {
    try {
      const status = await deps.getComputerUsePermissionStatus()
      // Missing macOS helpers report permissions as not granted; avoid opening unavailable setup.
      if (status.helperUnavailableReason) {
        warnings.push({
          featureId: 'computerUse',
          message: status.helperUnavailableReason
        })
      } else {
        const needsMacPermissions =
          status.platform === 'darwin' &&
          status.permissions.some((permission) => permission.status !== 'granted')
        if (needsMacPermissions) {
          await deps.openComputerUsePermissionSetup()
          computerUsePermissionsOpened = true
        }
      }
    } catch (error) {
      warnings.push({
        featureId: 'computerUse',
        message: formatFeatureSetupError(error)
      })
    }
  }

  skillCommandsCopied = await copyOnboardingSkillCommand(
    skillInstallCommand === null
      ? null
      : buildSkillCommandForRuntime(skillInstallCommand, agentRuntime),
    deps,
    warnings
  )

  return {
    selectedIds,
    cliTouched,
    skillCommandsCopied,
    skillInstallCommand,
    computerUsePermissionsOpened,
    warnings
  }
}

function formatFeatureSetupError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
