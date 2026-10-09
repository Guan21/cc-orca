// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CliSkillSetupTerminal } from './CliSkillSetupTerminal'

const mocks = vi.hoisted(() => {
  process.env.ORCA_SKILLS_REPOSITORY_URL = 'https://github.example.test/devcrew/skills'
  return {
    runtime: {
      agentRuntime: { runtime: 'wsl' as const, wslDistro: 'Missing', label: 'WSL Missing' },
      installDisabledReason: 'The selected WSL distro is unavailable.',
      terminalShellOverride: 'powershell.exe'
    },
    terminalCommand: '',
    forceHostRuntime: false
  }
})

vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => mocks.runtime
}))

vi.mock('@/components/onboarding/OnboardingInlineCommandTerminal', () => ({
  OnboardingInlineCommandTerminal: ({
    command,
    prepareCommandForShell,
    shellOverride,
    forceHostRuntime
  }: {
    command: string
    prepareCommandForShell?: (command: string, shellOverride?: string) => string
    shellOverride?: string
    forceHostRuntime?: boolean
  }) => {
    mocks.terminalCommand = prepareCommandForShell?.(command, shellOverride) ?? command
    mocks.forceHostRuntime = Boolean(forceHostRuntime)
    return null
  }
}))

describe('CliSkillSetupTerminal', () => {
  beforeEach(() => {
    mocks.terminalCommand = ''
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        platform: { get: () => ({ platform: 'win32' }) }
      }
    })
  })

  afterEach(() => {
    cleanup()
    Reflect.deleteProperty(window, 'api')
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  it('runs the Windows host fallback when the selected WSL runtime needs repair', () => {
    render(
      <TooltipProvider>
        <CliSkillSetupTerminal />
      </TooltipProvider>
    )

    expect(mocks.terminalCommand).toMatch(/^cmd\.exe \/d \/s \/c /)
    expect(mocks.terminalCommand).not.toContain('wsl.exe')
  })

  it('uses the installed launcher and bundled skills without npx in Corporate', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'
    render(
      <TooltipProvider>
        <CliSkillSetupTerminal commandName="orca-ide" />
      </TooltipProvider>
    )
    expect(mocks.terminalCommand).toBe(
      'orca-ide skills install --skill orca-cli --skill orchestration --agent claude-code,codex'
    )
    expect(mocks.forceHostRuntime).toBe(true)
  })
})
