// @vitest-environment happy-dom

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { GeneralSupportSection } from './GeneralSupportSection'
import { getGeneralSupportSearchEntries } from './general-support-search'

describe('GeneralSupportSection corporate profile gating', () => {
  afterEach(() => {
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  it('keeps the upstream support prompt visible in the default build', () => {
    const html = renderToStaticMarkup(<GeneralSupportSection hasPrecedingSections={false} />)

    expect(html).toContain('Support Orca')
    expect(getGeneralSupportSearchEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Star Orca on GitHub'
        })
      ])
    )
  })

  it('hides the upstream support prompt and search entry in corporate builds', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    const html = renderToStaticMarkup(<GeneralSupportSection hasPrecedingSections={false} />)

    expect(html).toBe('')
    expect(getGeneralSupportSearchEntries()).toEqual([])
  })
})
