// @vitest-environment happy-dom

import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import {
  ORCA_CLI_SKILL_INSTALL_COMMAND,
  ORCA_CLI_SKILL_UPDATE_COMMAND
} from '@/lib/agent-feature-install-commands'
import { CliSection } from './CliSection'

const capturedPanel = vi.hoisted(() => ({
  canUseLocalSkillFreshness: true,
  props: null as null | {
    command: string
    installedCommand: string
    preInstallNotice?: string
    terminalRuntime?: { runtime: 'host' | 'wsl'; wslDistro?: string | null; label: string }
    freshnessSkillName?: string
    getPrerequisiteStatus: () => Promise<unknown>
    onBeforeOpenTerminal: () => Promise<void>
  },
  useInstalledAgentSkill: vi.fn()
}))
const toastError = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))

vi.mock('@/hooks/useInstalledAgentSkills', () => ({
  GLOBAL_AGENT_SKILL_SOURCE_KINDS: ['global'],
  useInstalledAgentSkill: capturedPanel.useInstalledAgentSkill
}))

vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({
    canUseLocalSkillFreshness: capturedPanel.canUseLocalSkillFreshness
  })
}))

capturedPanel.useInstalledAgentSkill.mockReturnValue({
  installed: false,
  loading: false,
  error: null,
  refresh: vi.fn()
})

afterEach(() => {
  cleanup()
  capturedPanel.canUseLocalSkillFreshness = true
  toastError.mockReset()
  delete globalThis.__ORCA_BUILD_PROFILE__
  vi.unstubAllGlobals()
})

vi.mock('./AgentSkillSetupPanel', () => ({
  AgentSkillSetupPanel: function AgentSkillSetupPanel(props: {
    command: string
    installedCommand: string
    freshnessSkillName?: string
    preInstallNotice?: string
    getPrerequisiteStatus: () => Promise<unknown>
    onBeforeOpenTerminal: () => Promise<void>
  }) {
    capturedPanel.props = props
    return <div data-testid="agent-skill-setup-panel" />
  }
}))

vi.mock('./CliRegistrationDialog', () => ({
  CliRegistrationDialog: function CliRegistrationDialog() {
    return null
  }
}))

vi.mock('./WslCliRegistration', () => ({
  WslCliRegistration: function WslCliRegistration() {
    return null
  }
}))

describe('CliSection project runtime defaults', () => {
  it('uses corporate product wording while preserving the orca CLI command', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    const markup = renderToStaticMarkup(
      <CliSection currentPlatform="darwin" settings={getDefaultSettings('/tmp')} />
    )

    expect(markup).toContain('Secure Orca Lite CLI')
    expect(markup).toContain('Use the `orca` command')
    expect(markup).toContain('Secure Orca Lite-aware')
    expect(markup).not.toContain('Use Orca from your terminal')
    expect(capturedPanel.props?.preInstallNotice).toBe(
      'Before opening setup, Secure Orca Lite may show a system prompt to register the `orca` CLI command on PATH.'
    )
  })

  it('keeps default product wording for default builds', () => {
    const markup = renderToStaticMarkup(
      <CliSection currentPlatform="darwin" settings={getDefaultSettings('/tmp')} />
    )

    expect(markup).toContain('Orca CLI')
    expect(markup).toContain('Use Orca from your terminal')
    expect(capturedPanel.props?.preInstallNotice).toBe(
      'Before opening setup, Orca may show a system prompt to register the Orca CLI command on PATH.'
    )
  })

  it('exposes freshness only for a resolved local host runtime', () => {
    const settings = getDefaultSettings('/tmp')
    renderToStaticMarkup(<CliSection currentPlatform="darwin" settings={settings} />)
    expect(capturedPanel.props?.freshnessSkillName).toBe('orca-cli')

    capturedPanel.canUseLocalSkillFreshness = false
    renderToStaticMarkup(<CliSection currentPlatform="darwin" settings={settings} />)
    expect(capturedPanel.props?.freshnessSkillName).toBeUndefined()

    capturedPanel.canUseLocalSkillFreshness = true
    renderToStaticMarkup(
      <CliSection
        currentPlatform="win32"
        settings={{
          ...settings,
          localWindowsRuntimeDefault: { kind: 'wsl', distro: 'Ubuntu' }
        }}
        wslSupportedPlatform
        wslAvailable
      />
    )
    expect(capturedPanel.props?.freshnessSkillName).toBeUndefined()
  })

  it('passes the default project WSL distro to CLI skill prerequisite checks', async () => {
    const getWslInstallStatus = vi
      .fn()
      .mockResolvedValue({ supported: true, state: 'installed', pathConfigured: true })
    vi.stubGlobal('window', {
      api: {
        cli: {
          getInstallStatus: vi.fn(),
          getWslInstallStatus,
          installWsl: vi.fn()
        },
        shell: { openPath: vi.fn() }
      }
    })

    renderToStaticMarkup(
      <CliSection
        currentPlatform="win32"
        settings={{
          ...getDefaultSettings('/tmp'),
          localAgentRuntime: 'host',
          localWindowsRuntimeDefault: { kind: 'wsl', distro: 'Ubuntu' }
        }}
        wslSupportedPlatform
        wslAvailable
        wslCapabilitiesLoading={false}
      />
    )

    await capturedPanel.props?.getPrerequisiteStatus()
    await capturedPanel.props?.onBeforeOpenTerminal()

    expect(capturedPanel.useInstalledAgentSkill).toHaveBeenCalledWith(
      'orca-cli',
      expect.objectContaining({
        discoveryTarget: { runtime: 'wsl', wslDistro: 'Ubuntu' },
        sourceKinds: ['global']
      })
    )
    expect(capturedPanel.props?.command).toBe(ORCA_CLI_SKILL_INSTALL_COMMAND)
    expect(capturedPanel.props?.installedCommand).toBe(ORCA_CLI_SKILL_UPDATE_COMMAND)
    expect(capturedPanel.props?.terminalRuntime).toEqual({
      runtime: 'wsl',
      wslDistro: 'Ubuntu',
      label: 'WSL Ubuntu'
    })
    expect(getWslInstallStatus).toHaveBeenCalledWith({ distro: 'Ubuntu' })
    expect(getWslInstallStatus).toHaveBeenCalledTimes(2)
  })

  it('renders an inline unknown PATH state without offering a mutation', async () => {
    const getInstallStatus = vi.fn().mockResolvedValue({
      platform: 'win32',
      commandName: 'orca',
      commandPath: 'C:\\Program Files\\Orca\\resources\\bin\\orca.exe',
      pathDirectory: 'C:\\Program Files\\Orca\\resources\\bin',
      pathConfigured: null,
      launcherPath: 'C:\\Program Files\\Orca\\resources\\bin\\orca.exe',
      installMethod: 'wrapper',
      supported: true,
      state: 'installed',
      currentTarget: 'C:\\Program Files\\Orca\\resources\\bin\\orca.exe',
      unsupportedReason: null,
      detail: 'Orca could not read the Windows user PATH registry value.'
    })
    Object.assign(window, {
      api: {
        cli: {
          getInstallStatus,
          getWslInstallStatus: vi.fn(),
          install: vi.fn(),
          remove: vi.fn()
        },
        shell: { openPath: vi.fn() }
      }
    })

    render(<CliSection currentPlatform="win32" settings={getDefaultSettings('/tmp')} />)

    expect(await screen.findByText(/could not read the Windows user PATH/i)).toBeDefined()
    const registrationSwitch = screen.getByRole('switch') as HTMLButtonElement
    expect(registrationSwitch.disabled).toBe(true)
    expect(registrationSwitch.getAttribute('aria-checked')).toBe('false')
    expect(toastError).not.toHaveBeenCalled()
  })
})
