import { afterEach, describe, expect, it, vi } from 'vitest'
import { jiraRequest, jiraRequestBinary, requestWithCredentials } from './authenticated-request'

const { proxySetup, httpClient } = vi.hoisted(() => ({
  proxySetup: vi.fn(),
  httpClient: vi.fn()
}))

vi.mock('../network/proxy-settings', () => ({ ensureElectronProxyFromEnvironment: proxySetup }))
vi.mock('../network/http-client', () => ({ getMainHttpClient: httpClient }))
vi.mock('../observability/tracer', () => ({
  withSpan: (_name: string, operation: () => unknown) => operation()
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('Corporate Jira transport boundary', () => {
  it('rejects credential requests, saved clients and attachment downloads before HTTP/proxy access', async () => {
    vi.stubEnv('ORCA_BUILD_PROFILE', 'corporate')
    const client = {
      site: {
        id: 'saved',
        siteUrl: 'https://jira.example.test',
        email: 'fixture@example.test',
        displayName: 'Fixture',
        accountId: 'fixture'
      },
      authorization: 'Bearer fixture'
    }

    await expect(
      requestWithCredentials(
        client.site.siteUrl,
        client.site.email,
        'fixture',
        '/rest/api/3/myself'
      )
    ).rejects.toThrow('administrator authorization')
    await expect(jiraRequest(client, '/rest/api/3/search')).rejects.toThrow(
      'administrator authorization'
    )
    await expect(jiraRequestBinary(client, '/attachments/fixture.png')).rejects.toThrow(
      'administrator authorization'
    )
    expect(proxySetup).not.toHaveBeenCalled()
    expect(httpClient).not.toHaveBeenCalled()
  })
})
