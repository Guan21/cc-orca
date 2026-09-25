import { afterEach, describe, expect, it } from 'vitest'

import { getCliCommandTerminalUsageDetail, getCliCommandUsageDetail } from './cli-branding-copy'

describe('cli branding copy', () => {
  afterEach(() => {
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  it('uses corporate product wording for terminal registration while preserving the macOS command path', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    expect(getCliCommandTerminalUsageDetail('/usr/local/bin/orca')).toBe(
      'Register /usr/local/bin/orca to use Secure Orca Lite from the terminal.'
    )
  })

  it('keeps default terminal registration wording and the macOS command path', () => {
    expect(getCliCommandTerminalUsageDetail('/usr/local/bin/orca')).toBe(
      'Register /usr/local/bin/orca to use Orca from the terminal.'
    )
  })

  it('keeps Windows corporate registration wording focused on the literal orca CLI', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    expect(getCliCommandUsageDetail('C:\\Secure Orca Lite\\bin\\orca.exe')).toBe(
      'Register C:\\Secure Orca Lite\\bin\\orca.exe to use the `orca` CLI from Command Prompt or PowerShell.'
    )
  })
})
