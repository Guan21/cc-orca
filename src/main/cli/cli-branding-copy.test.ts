import { afterEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'

import { getCliCommandTerminalUsageDetail, getCliCommandUsageDetail } from './cli-branding-copy'
import { getBundledLauncherPath } from './bundled-cli-launcher-path'

describe('cli branding copy', () => {
  afterEach(() => {
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  it.each([
    ['darwin', 'orca'],
    ['win32', 'orca.exe'],
    ['linux', 'orca-ide']
  ] as const)('preserves the %s packaged compatibility launcher', (platform, name) => {
    expect(getBundledLauncherPath(platform, 'resources')).toBe(join('resources', 'bin', name))
  })

  it('uses corporate product wording for terminal registration while preserving the macOS command path', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    expect(getCliCommandTerminalUsageDetail('/usr/local/bin/orca')).toBe(
      'Register /usr/local/bin/orca to use the DevCrew CLI from the terminal. The command name is retained for compatibility.'
    )
  })

  it('keeps default terminal registration wording and the macOS command path', () => {
    expect(getCliCommandTerminalUsageDetail('/usr/local/bin/orca')).toBe(
      'Register /usr/local/bin/orca to use the DevCrew CLI from the terminal. The command name is retained for compatibility.'
    )
  })

  it('explains the Windows compatibility command as the DevCrew CLI', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    expect(getCliCommandUsageDetail('C:\\DevCrew\\bin\\orca.exe')).toBe(
      'Register C:\\DevCrew\\bin\\orca.exe to use the DevCrew CLI from Command Prompt or PowerShell. The command name is retained for compatibility.'
    )
  })
})
