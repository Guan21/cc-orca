import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const CORPORATE_BRANDING_CATALOG_TARGETS = [
  'src/renderer/src/i18n/en-runtime-required.json',
  'src/renderer/src/i18n/locales/en.json',
  'src/renderer/src/i18n/locales/es.json',
  'src/renderer/src/i18n/locales/fr.json',
  'src/renderer/src/i18n/locales/ja.json',
  'src/renderer/src/i18n/locales/ko.json',
  'src/renderer/src/i18n/locales/zh.json'
]

const CORPORATE_BRANDING_REPLACEMENTS = [
  [/Secure Orca Lite/g, 'DevCrew'],
  [/Company Orca/g, 'DevCrew'],
  [/Secure Orca/g, 'DevCrew'],
  [/Orca Mobile/g, 'DevCrew Mobile'],
  [/Orca Browser/g, 'DevCrew Browser'],
  [/Remote Orca Servers/g, 'Remote DevCrew Servers'],
  [/Remote Orca Server/g, 'Remote DevCrew Server'],
  [/Orca Relay/g, 'DevCrew Relay'],
  [/Orca Cloud/g, 'DevCrew Cloud'],
  [/Orca CLI/g, 'DevCrew CLI'],
  [/\bOrca\b/g, 'DevCrew']
]

const SOURCE_COMPATIBILITY_MARKERS = [
  'X-Orca-Agent-Hook-Token',
  'Orca Computer Use.app',
  'Orca Computer Use',
  'Orca.app',
  'Orca-*.ips',
  '/opt/Orca'
]

export function replaceCorporateBranding(value) {
  return CORPORATE_BRANDING_REPLACEMENTS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    value
  )
}

export function replaceCorporateBrandingSourceLiteral(value) {
  const protectedValues = []
  let source = value
  for (const marker of SOURCE_COMPATIBILITY_MARKERS) {
    const placeholder = `__CORPORATE_BRANDING_COMPATIBILITY_${protectedValues.length}__`
    if (source.includes(marker)) {
      protectedValues.push([placeholder, marker])
      source = source.replaceAll(marker, placeholder)
    }
  }
  source = replaceCorporateBranding(source)
  for (const [placeholder, marker] of protectedValues) {
    source = source.replaceAll(placeholder, marker)
  }
  return source
}

function transformCatalogValue(value) {
  if (typeof value === 'string') {
    return replaceCorporateBranding(value)
  }
  if (Array.isArray(value)) {
    return value.map(transformCatalogValue)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, transformCatalogValue(child)])
    )
  }
  return value
}

export function transformCorporateBrandingCatalog(catalog) {
  return transformCatalogValue(catalog)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const repoRoot = process.cwd()
  for (const relativePath of CORPORATE_BRANDING_CATALOG_TARGETS) {
    const absolutePath = resolve(repoRoot, relativePath)
    const catalog = JSON.parse(await readFile(absolutePath, 'utf8'))
    const transformed = transformCorporateBrandingCatalog(catalog)
    await writeFile(absolutePath, `${JSON.stringify(transformed, null, 2)}\n`, 'utf8')
  }
  console.log(`Updated ${CORPORATE_BRANDING_CATALOG_TARGETS.length} corporate locale catalogs.`)
}
