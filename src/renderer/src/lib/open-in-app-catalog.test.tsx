import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OpenInMenuSetting } from '../components/settings/OpenInMenuSetting'
import { getOpenInAppPresets, OpenInApplicationIcon } from './open-in-app-catalog'

afterEach(() => vi.unstubAllGlobals())

describe('Corporate Open In Apps icons', () => {
  it.each(['code', ' CODE ', 'cursor', 'zed', 'custom-editor', 'https://private.example'])(
    'renders %s without an automatic external image',
    (command) => {
      vi.stubGlobal('__ORCA_BUILD_PROFILE__', 'corporate')
      const markup = renderToStaticMarkup(
        <OpenInApplicationIcon application={{ command }} size={16} />
      )
      expect(markup).toContain('<svg')
      expect(markup).not.toContain('<img')
      expect(markup).not.toMatch(/(?:src|href)="https?:|google|gstatic|private\.example/)
    }
  )

  it('renders configured preset and custom Settings rows locally without updating them', () => {
    vi.stubGlobal('__ORCA_BUILD_PROFILE__', 'corporate')
    const updateSettings = vi.fn()
    const applications = [
      ...getOpenInAppPresets().map(({ id, label, command }) => ({ id, label, command })),
      { id: 'custom', label: 'Custom editor', command: 'my-editor --wait' }
    ]
    const markup = renderToStaticMarkup(
      <OpenInMenuSetting applications={applications} updateSettings={updateSettings} />
    )
    for (const application of applications) {
      expect(markup).toContain(application.label)
    }
    expect(markup).toContain('my-editor --wait')
    expect(markup).not.toContain('<img')
    expect(markup).not.toMatch(/(?:src|href)="https?:|google|gstatic/)
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('preserves the default profile preset icon', () => {
    vi.stubGlobal('__ORCA_BUILD_PROFILE__', 'default')
    const markup = renderToStaticMarkup(<OpenInApplicationIcon application={{ command: 'zed' }} />)
    expect(markup).toContain('<img')
    expect(markup).toContain('dark:invert')
  })
})
