import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '../../i18n/i18n'
import { IntegrationsPane } from './IntegrationsPane'

vi.mock('./source-control-integration-cards', () => ({
  AzureDevOpsIntegrationCard: () => null,
  BitbucketIntegrationCard: () => null,
  GiteaIntegrationCard: () => null,
  GitHubIntegrationCard: () => null,
  GitLabIntegrationCard: () => null
}))

vi.mock('./task-tracker-integration-cards', () => ({
  JiraIntegrationCard: () => <span>Jira connect action</span>,
  LinearIntegrationCard: () => <span>Linear connect action</span>
}))

vi.mock('./use-integration-provider-status-refresh', () => ({
  useIntegrationProviderStatusRefresh: vi.fn()
}))

function renderPane(): string {
  return renderToStaticMarkup(<IntegrationsPane />)
}

describe('IntegrationsPane', () => {
  beforeEach(async () => {
    delete globalThis.__ORCA_BUILD_PROFILE__
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  it('preserves default DevCrew identity in provider descriptions', () => {
    const markup = renderPane()

    expect(markup).toContain('source hosts DevCrew can use')
    expect(markup).toContain('issue trackers DevCrew can use')
  })

  it('uses corporate product identity in provider descriptions', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    const markup = renderPane()

    expect(markup).toContain('source hosts DevCrew can use')
    expect(markup).toContain('require administrator authorization')
    expect(markup).not.toContain('Linear connect action')
    expect(markup).not.toContain('Jira connect action')
    expect(markup).not.toContain('source hosts Orca can use')
    expect(markup).not.toContain('issue trackers Orca can use')
  })
})
