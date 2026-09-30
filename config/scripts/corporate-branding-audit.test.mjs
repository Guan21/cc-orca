import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CORPORATE_BRANDING_AUDIT_TARGETS,
  CORPORATE_BRANDING_LOCALE_TARGETS,
  auditCorporateBrandingLocaleText,
  auditCorporateBrandingText
} from './corporate-branding-audit.mjs'
import { replaceCorporateBranding } from './corporate-branding-catalog.mjs'

describe('corporate branding audit', () => {
  it('rejects user-visible Orca branding in product-facing text', () => {
    expect(
      auditCorporateBrandingText({
        relativePath: 'src/main/menu/register-app-menu.ts',
        text: "label: 'Explore Orca'"
      })
    ).toEqual([
      {
        line: 1,
        match: 'Explore Orca',
        relativePath: 'src/main/menu/register-app-menu.ts'
      }
    ])
  })

  it('rejects stale translated app-shell branding keys', () => {
    expect(
      auditCorporateBrandingLocaleText({
        relativePath: 'src/renderer/src/i18n/locales/en.json',
        text: JSON.stringify({
          menu: { exploreOrca: 'Explore Orca' },
          tray: { openOrca: 'Open DevCrew' },
          auto: { App: { '5096cbbc86': 'DevCrew' } }
        })
      })
    ).toEqual([
      {
        line: 0,
        match: 'menu.exploreOrca: Explore Orca',
        relativePath: 'src/renderer/src/i18n/locales/en.json'
      }
    ])
  })

  it('allows documented compatibility identifiers without hiding adjacent leaks', () => {
    const text = [
      "appId: 'com.stablyai.orca'",
      "protocols: [{ name: 'DevCrew', schemes: ['orca'] }]",
      "productName: 'Orca'"
    ].join('\n')

    expect(
      auditCorporateBrandingText({
        relativePath: 'config/electron-builder.config.cjs',
        text
      })
    ).toEqual([
      {
        line: 3,
        match: "productName: 'Orca'",
        relativePath: 'config/electron-builder.config.cjs'
      }
    ])
  })

  it('scans curated product-facing surfaces rather than the whole repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'corporate-branding-audit-'))
    await writeFile(join(root, 'product.txt'), 'Open DevCrew\n', 'utf8')
    await writeFile(join(root, 'internal.txt'), 'orca://pair\n', 'utf8')

    expect(CORPORATE_BRANDING_AUDIT_TARGETS).toContain('config/electron-builder.config.cjs')
    expect(CORPORATE_BRANDING_LOCALE_TARGETS).toContain('src/renderer/src/i18n/locales/en.json')
    expect(CORPORATE_BRANDING_LOCALE_TARGETS).toContain(
      'src/renderer/src/i18n/en-runtime-required.json'
    )
    expect(CORPORATE_BRANDING_AUDIT_TARGETS).not.toContain('src/shared/pairing.ts')
  })

  it('changes product copy without changing the legacy command spelling', () => {
    expect(replaceCorporateBranding('Open Orca and run `orca status`.')).toBe(
      'Open DevCrew and run `orca status`.'
    )
  })
})
