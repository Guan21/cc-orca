import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { CORPORATE_BRANDING_CATALOG_TARGETS } from './corporate-branding-catalog.mjs'

export const CORPORATE_BRANDING_AUDIT_TARGETS = [
  'config/electron-builder.config.cjs',
  'src/main/menu/register-app-menu.ts',
  'src/main/tray/system-tray.ts',
  'src/main/window/createMainWindow.ts',
  'src/main/window/main-window-close-lifecycle.ts',
  'src/main/ipc/notification-options.ts',
  'src/main/ipc/notification-permission-probe.ts',
  'src/main/ipc/startup-notification-registration.ts',
  'src/main/startup/gpu-lifecycle.ts',
  'src/renderer/src/app-shell/TitlebarLeftControls.tsx'
]

export const CORPORATE_BRANDING_LOCALE_TARGETS = CORPORATE_BRANDING_CATALOG_TARGETS

const FORBIDDEN_BRANDING_PATTERNS = [
  /\bSecure Orca Lite\b/g,
  /\bCompany Orca\b/g,
  /productName: 'Orca'/g,
  /\bOrca Mobile\b/g,
  /\b(?:Open|Explore|Quit|About|Welcome to|Getting Started with|Show|Sign in to|Update|Install|Retry|Relaunch|Restart|Close|Connect to|Control|Allow notifications so|This is a test notification from)\s+Orca\b/g,
  /\bOrca\s+(?:notifications|is ready|is still running|allows|will alert|browser|Browser|CLI|server|Relay|Account|surface|app|desktop|window)\b/g,
  /\bOrca\b/g
]

const COMPATIBILITY_ALLOWLIST = [
  {
    relativePath: 'config/electron-builder.config.cjs',
    patterns: [
      /appId = 'com\.stablyai\.orca'/,
      /schemes: \['orca'\]/,
      /Orca Computer Use\.app/,
      /orca-notification-status/,
      /orca-keyboard-layout/,
      /resources\/(?:darwin|win32)\/bin\/orca/,
      /native\/windows-cli-launcher\/\.build\/orca\.exe/,
      /bin\/orca\.(?:cmd|exe)/,
      /orca-ide/,
      /StartupWMClass: 'orca'/,
      /devChannelRepo \?\? 'orca'/,
      /ORCA_[A-Z0-9_]+/
    ]
  },
  {
    relativePath: 'src/main/menu/register-app-menu.ts',
    patterns: [/menu\.exploreOrca/]
  },
  {
    relativePath: 'src/main/tray/system-tray.ts',
    patterns: [/tray\.openOrca/]
  }
]

export function auditCorporateBrandingText({ relativePath, text }) {
  const allowlist = COMPATIBILITY_ALLOWLIST.find((entry) => entry.relativePath === relativePath)
  const findings = []
  const lines = text.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*/')
    ) {
      continue
    }
    if (allowlist?.patterns.some((pattern) => pattern.test(line))) {
      continue
    }
    for (const pattern of FORBIDDEN_BRANDING_PATTERNS) {
      pattern.lastIndex = 0
      const match = pattern.exec(line)
      if (match) {
        findings.push({ relativePath, line: index + 1, match: match[0] })
        break
      }
    }
  }
  return findings
}

export function auditCorporateBrandingLocaleText({ relativePath, text }) {
  const catalog = JSON.parse(text)
  const findings = []

  function visit(value, path) {
    if (typeof value === 'string') {
      const match = /\b(?:Secure Orca Lite|Company Orca|Orca)\b/.exec(value)
      if (match) {
        findings.push({ relativePath, line: 0, match: `${path}: ${value}` })
      }
      return
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${path}[${index}]`))
      return
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, child]) => {
        visit(child, path ? `${path}.${key}` : key)
      })
    }
  }

  visit(catalog, '')
  return findings
}

export async function auditCorporateBrandingFiles(repoRoot = process.cwd()) {
  const findings = []
  for (const relativePath of CORPORATE_BRANDING_AUDIT_TARGETS) {
    const text = await readFile(join(repoRoot, relativePath), 'utf8')
    findings.push(...auditCorporateBrandingText({ relativePath, text }))
  }
  for (const relativePath of CORPORATE_BRANDING_LOCALE_TARGETS) {
    const text = await readFile(join(repoRoot, relativePath), 'utf8')
    findings.push(...auditCorporateBrandingLocaleText({ relativePath, text }))
  }
  const localeSourceNames = (await readdir(join(repoRoot, 'config/scripts'))).filter(
    (name) => name.startsWith('locale-') && /\.(?:mjs|json)$/.test(name)
  )
  for (const name of localeSourceNames) {
    const relativePath = `config/scripts/${name}`
    const text = await readFile(join(repoRoot, relativePath), 'utf8')
    findings.push(...auditCorporateBrandingText({ relativePath, text }))
  }
  return findings
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const findings = await auditCorporateBrandingFiles()
  if (findings.length > 0) {
    console.error('DevCrew corporate branding audit failed:')
    for (const finding of findings) {
      console.error(`${finding.relativePath}:${finding.line}: ${finding.match}`)
    }
    process.exit(1)
  }
  console.log('DevCrew corporate branding audit passed.')
}
