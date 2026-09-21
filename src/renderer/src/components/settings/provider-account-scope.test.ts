import { afterEach, describe, expect, it } from 'vitest'
import { getExecutionHostLabel } from '../../../../shared/execution-host'
import {
  getProviderAccountScope,
  getProviderRateLimitScope,
  getRemoteAccountsPaneScope
} from './provider-account-scope'

const LOCAL_HOST_LABEL = getExecutionHostLabel('local')

afterEach(() => {
  delete globalThis.__ORCA_BUILD_PROFILE__
})

describe('getProviderAccountScope', () => {
  it('describes provider accounts as client-owned without an active runtime', () => {
    expect(getProviderAccountScope({ activeRuntimeEnvironmentId: null })).toEqual({
      label: LOCAL_HOST_LABEL,
      description:
        'Credentials and account checks for this provider are owned by this desktop client. Use Settings > Remote Orca Servers > Advanced to edit server-owned credentials.'
    })
  })

  it('describes provider accounts as remote-server-owned with an active runtime', () => {
    expect(getProviderAccountScope({ activeRuntimeEnvironmentId: ' env-1 ' })).toEqual({
      label: 'Remote server: env-1',
      description:
        'Credentials and account checks for this provider are owned by this remote server. Use Settings > Remote Orca Servers > Advanced to edit another default runtime scope.'
    })
  })

  it('describes provider API budgets as host-scoped', () => {
    expect(getProviderRateLimitScope({ activeRuntimeEnvironmentId: null }, 'GitHub')).toEqual({
      label: LOCAL_HOST_LABEL,
      description:
        'GitHub API budget is fetched from the CLI on this desktop client. Use Settings > Remote Orca Servers > Advanced to view server-owned budgets.'
    })
    expect(getProviderRateLimitScope({ activeRuntimeEnvironmentId: ' env-1 ' }, 'GitLab')).toEqual({
      label: 'Remote server: env-1',
      description:
        'GitLab API budget is fetched from the CLI on this remote server. Use Settings > Remote Orca Servers > Advanced to view another default runtime budget.'
    })
  })

  it('uses corporate product identity in remote-server settings links', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    expect(getProviderAccountScope({ activeRuntimeEnvironmentId: null }).description).toContain(
      'Settings > Remote Secure Orca Lite Servers > Advanced'
    )
    expect(getProviderAccountScope({ activeRuntimeEnvironmentId: 'env-1' }).description).toContain(
      'Settings > Remote Secure Orca Lite Servers > Advanced'
    )
    expect(
      getProviderRateLimitScope({ activeRuntimeEnvironmentId: null }, 'GitHub').description
    ).toContain('Settings > Remote Secure Orca Lite Servers > Advanced')
    expect(
      getProviderRateLimitScope({ activeRuntimeEnvironmentId: 'env-1' }, 'GitLab').description
    ).toContain('Settings > Remote Secure Orca Lite Servers > Advanced')
  })
})

describe('getRemoteAccountsPaneScope', () => {
  const LOCAL_ACCOUNTS_KEPT =
    'Accounts managed on this desktop are unchanged. Switch the default runtime back to Local desktop to view them.'

  it('names the owning server once the saved-server list resolves', () => {
    expect(getRemoteAccountsPaneScope(' build-box ')).toEqual({
      label: 'Remote server: build-box',
      description: LOCAL_ACCOUNTS_KEPT
    })
  })

  it('keeps the label bare before the server name is known', () => {
    for (const unnamed of [null, '', '   ']) {
      expect(getRemoteAccountsPaneScope(unnamed)).toEqual({
        label: 'Remote server',
        description: LOCAL_ACCOUNTS_KEPT
      })
    }
  })
})
