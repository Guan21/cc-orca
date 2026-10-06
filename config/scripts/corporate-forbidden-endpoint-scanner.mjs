import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const DEFAULT_POLICY_PATH = 'config/corporate-forbidden-endpoints.json'
const DEFAULT_BASELINE_PATH = 'config/corporate-forbidden-endpoint-baseline.json'
const DEFAULT_BASELINE_CEILING_PATH = 'config/corporate-forbidden-endpoint-baseline-ceiling.json'
const FAILING_SEVERITIES = new Set(['forbidden'])
const BACKTICK = '`'

function normalizePath(path) {
  return path.replaceAll('\\', '/')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function endpointTailPattern() {
  return '(?::\\d+)?(?:[/?#][^\\s\'"<>`}\\])]+)?'
}

function compileRule(rule) {
  const match = rule.match
  if (!match || typeof rule.id !== 'string' || typeof rule.reason !== 'string') {
    throw new Error(`[corporate-endpoint-scan] invalid rule: ${JSON.stringify(rule)}`)
  }
  if (match.kind === 'domain') {
    const domain = escapeRegExp(match.domain.toLowerCase())
    const subdomain = match.includeSubdomains ? `(?:[a-z0-9-]+\\.)*` : ''
    return {
      ...rule,
      regex: new RegExp(
        `(?<![a-z0-9.-])(?:https?:\\/\\/)?${subdomain}${domain}${endpointTailPattern()}`,
        'gi'
      )
    }
  }
  if (match.kind === 'host') {
    return {
      ...rule,
      regex: new RegExp(
        `(?<![a-z0-9.-])(?:https?:\\/\\/)?${escapeRegExp(match.host.toLowerCase())}${endpointTailPattern()}`,
        'gi'
      )
    }
  }
  if (match.kind === 'githubRepository') {
    const owner = escapeRegExp(match.owner.toLowerCase())
    const repository = escapeRegExp(match.repository.toLowerCase())
    return {
      ...rule,
      regex: new RegExp(
        `(?<![a-z0-9.-])(?:https?:\\/\\/)?github\\.com\\/${owner}\\/${repository}(?:\\.git)?(?=$|[/?#\\s'"<>${BACKTICK}},\\]])(?:[/?#][^\\s'"<>${BACKTICK}}\\])]+)?`,
        'gi'
      )
    }
  }
  if (match.kind === 'urlPrefix') {
    return {
      ...rule,
      regex: new RegExp(
        `(?<![a-z0-9.-])${escapeRegExp(match.prefix)}(?:[/?#][^\\s'"<>${BACKTICK}}\\])]+)?`,
        'gi'
      )
    }
  }
  throw new Error(`[corporate-endpoint-scan] unsupported match kind: ${match.kind}`)
}

export function loadCorporateEndpointPolicy(policyPath = DEFAULT_POLICY_PATH) {
  const absolutePolicyPath = resolve(policyPath)
  const policy = JSON.parse(readFileSync(absolutePolicyPath, 'utf8'))
  if (!Array.isArray(policy?.rules) || !policy?.scan) {
    throw new Error(`[corporate-endpoint-scan] invalid policy at ${policyPath}`)
  }
  return {
    ...policy,
    rules: policy.rules.map(compileRule),
    scan: {
      ...policy.scan,
      textExtensions: new Set(policy.scan.textExtensions),
      excludeFilePatterns: (policy.scan.excludeFilePatterns ?? []).map(
        (pattern) => new RegExp(pattern)
      )
    }
  }
}

function lineNumberForOffset(source, offset) {
  let line = 1
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1
    }
  }
  return line
}

export function scanCorporateEndpointText({ policy, relativePath, source }) {
  const violations = []
  for (const rule of policy.rules) {
    rule.regex.lastIndex = 0
    for (const match of source.matchAll(rule.regex)) {
      violations.push({
        ruleId: rule.id,
        severity: rule.severity,
        scope: rule.scope,
        reason: rule.reason,
        file: normalizePath(relativePath),
        line: lineNumberForOffset(source, match.index ?? 0),
        match: match[0]
      })
    }
  }
  return violations.sort(compareViolations)
}

function compareViolations(left, right) {
  const leftLine = left.line ?? 0
  const rightLine = right.line ?? 0
  return (
    left.file.localeCompare(right.file) ||
    leftLine - rightLine ||
    left.ruleId.localeCompare(right.ruleId) ||
    left.match.localeCompare(right.match)
  )
}

function isPathInside(root, candidate) {
  const fromRoot = relative(root, candidate)
  return fromRoot !== '' && !fromRoot.startsWith('..') && !isAbsolute(fromRoot)
}

function shouldScanFile(policy, relativePath) {
  const normalized = normalizePath(relativePath)
  if (!policy.scan.includePaths.some((path) => normalized === path || normalized.startsWith(path))) {
    return false
  }
  if (policy.scan.excludePaths.some((path) => normalized === path || normalized.startsWith(path))) {
    return false
  }
  if (policy.scan.excludePathContains.some((part) => normalized.includes(part))) {
    return false
  }
  if (policy.scan.excludeFilePatterns.some((pattern) => pattern.test(normalized))) {
    return false
  }
  return policy.scan.textExtensions.has(extname(normalized))
}

function collectScanFiles(cwd, policy) {
  const root = resolve(cwd)
  const files = []
  const visit = (absolutePath) => {
    const metadata = statSync(absolutePath)
    if (metadata.isDirectory()) {
      for (const entry of readdirSync(absolutePath).sort()) {
        const child = join(absolutePath, entry)
        const relativePath = normalizePath(relative(root, child))
        if (policy.scan.excludePaths.some((path) => relativePath === path || relativePath.startsWith(path))) {
          continue
        }
        visit(child)
      }
      return
    }
    if (!metadata.isFile()) {
      return
    }
    const relativePath = normalizePath(relative(root, absolutePath))
    if (shouldScanFile(policy, relativePath)) {
      files.push({ path: absolutePath, relativePath })
    }
  }
  for (const includePath of policy.scan.includePaths) {
    const absolutePath = resolve(root, includePath)
    if (!existsSync(absolutePath) || !isPathInside(root, absolutePath)) {
      continue
    }
    visit(absolutePath)
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

function readBaseline(cwd, baselinePath) {
  const path = resolve(cwd, baselinePath)
  if (!existsSync(path)) {
    return []
  }
  const baseline = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(baseline?.violations)) {
    throw new Error(`[corporate-endpoint-scan] invalid baseline at ${baselinePath}`)
  }
  return baseline.violations.map((entry) => ({
    ...entry,
    file: normalizePath(entry.file)
  }))
}

function readBaselineCeiling(cwd, policy, baselineEntries) {
  if (baselineEntries.length === 0) {
    return []
  }
  const ceilingPath = policy.contract?.baselineCeilingPath ?? DEFAULT_BASELINE_CEILING_PATH
  const path = resolve(cwd, ceilingPath)
  if (!existsSync(path)) {
    throw new Error(
      `[corporate-endpoint-scan] baseline ceiling missing at ${ceilingPath}; ` +
        'current baseline entries cannot be verified as #91-approved debt'
    )
  }
  const ceiling = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(ceiling?.violations)) {
    throw new Error(`[corporate-endpoint-scan] invalid baseline ceiling at ${ceilingPath}`)
  }
  return ceiling.violations.map((entry) => ({
    ...entry,
    file: normalizePath(entry.file)
  }))
}

function baselineKey(violation, includeLine) {
  const line = includeLine ? `:${violation.line}` : ''
  return `${violation.ruleId}\0${violation.file}${line}\0${violation.match}`
}

function baselineCeilingKey(violation) {
  const line = violation.line === undefined ? '<portable>' : String(violation.line)
  return `${violation.ruleId}\0${violation.file}\0${line}\0${violation.match}`
}

function findBaselineExpansion(baselineEntries, ceilingEntries) {
  const approved = new Map()
  for (const entry of ceilingEntries) {
    const key = baselineCeilingKey(entry)
    approved.set(key, (approved.get(key) ?? 0) + 1)
  }
  const expansion = []
  for (const entry of baselineEntries) {
    const key = baselineCeilingKey(entry)
    const remaining = approved.get(key) ?? 0
    if (remaining === 0) {
      expansion.push(entry)
      continue
    }
    approved.set(key, remaining - 1)
  }
  return expansion.sort(compareViolations)
}

function applyBaseline(violations, baselineEntries) {
  const exact = new Map()
  const portable = new Map()
  for (const entry of baselineEntries) {
    const bucket = entry.line === undefined ? portable : exact
    const key = baselineKey(entry, entry.line !== undefined)
    bucket.set(key, (bucket.get(key) ?? 0) + 1)
  }
  const active = []
  const baselined = []
  for (const violation of violations) {
    const exactKey = baselineKey(violation, true)
    const portableKey = baselineKey(violation, false)
    if ((exact.get(exactKey) ?? 0) > 0) {
      exact.set(exactKey, exact.get(exactKey) - 1)
      baselined.push(violation)
    } else if ((portable.get(portableKey) ?? 0) > 0) {
      portable.set(portableKey, portable.get(portableKey) - 1)
      baselined.push(violation)
    } else {
      active.push(violation)
    }
  }
  return { active, baselined }
}

export function runCorporateForbiddenEndpointScan({
  cwd = process.cwd(),
  policyPath = DEFAULT_POLICY_PATH,
  baselinePath = DEFAULT_BASELINE_PATH,
  useBaseline = true
} = {}) {
  const policy = loadCorporateEndpointPolicy(resolve(cwd, policyPath))
  const files = collectScanFiles(cwd, policy)
  const detected = files.flatMap((file) =>
    scanCorporateEndpointText({
      policy,
      relativePath: file.relativePath,
      source: readFileSync(file.path, 'utf8')
    })
  )
  const failingDetected = detected.filter((violation) => FAILING_SEVERITIES.has(violation.severity))
  const baseline = useBaseline ? readBaseline(cwd, baselinePath) : []
  const baselineCeiling = useBaseline ? readBaselineCeiling(cwd, policy, baseline) : []
  const baselineExpansion = useBaseline ? findBaselineExpansion(baseline, baselineCeiling) : []
  const { active, baselined } = applyBaseline(failingDetected, baseline)
  const reviewRequired = detected.filter((violation) => violation.severity === 'review-required')
  return {
    filesScanned: files.length,
    detected,
    baselined,
    baselineExpansion,
    violations: active,
    reviewRequired,
    exitCode: active.length > 0 || baselineExpansion.length > 0 ? 1 : 0
  }
}

export function formatViolations(violations) {
  if (violations.length === 0) {
    return ''
  }
  return violations
    .map(
      (violation) => `Corporate forbidden endpoint detected

Rule: ${violation.ruleId}
File: ${violation.file}:${violation.line}
Match: ${violation.match}
Reason: ${violation.reason}`
    )
    .join('\n\n')
}

export function formatBaselineExpansion(entries) {
  if (entries.length === 0) {
    return ''
  }
  return entries
    .map(
      (entry) => `Corporate forbidden endpoint baseline expansion rejected

Rule: ${entry.ruleId}
File: ${entry.file}${entry.line === undefined ? '' : `:${entry.line}`}
Match: ${entry.match}
Reason: #90 may remove entries from the temporary #91 baseline, but new baseline entries are not allowed without updating the audited baseline ceiling.`
    )
    .join('\n\n')
}

function printResult(result) {
  if (result.baselineExpansion.length > 0) {
    console.error(formatBaselineExpansion(result.baselineExpansion))
    console.error(
      `\n[corporate-endpoint-scan] ${result.baselineExpansion.length} unapproved baseline expansion(s), ${result.violations.length} new forbidden violation(s), ${result.baselined.length} baselined violation(s), ${result.filesScanned} file(s) scanned.`
    )
    return
  }
  if (result.violations.length > 0) {
    console.error(formatViolations(result.violations))
    console.error(
      `\n[corporate-endpoint-scan] ${result.violations.length} new forbidden violation(s), ${result.baselined.length} baselined violation(s), ${result.filesScanned} file(s) scanned.`
    )
    return
  }
  if (result.reviewRequired.length > 0) {
    console.warn(formatViolations(result.reviewRequired))
  }
  console.log(
    `[corporate-endpoint-scan] OK — ${result.filesScanned} file(s) scanned, ${result.baselined.length} known #90 baseline violation(s), 0 new forbidden violation(s).`
  )
}

function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--no-baseline') {
      options.useBaseline = false
    } else if (arg === '--policy') {
      options.policyPath = argv[++index]
    } else if (arg === '--baseline') {
      options.baselinePath = argv[++index]
    } else {
      throw new Error(`[corporate-endpoint-scan] unknown argument: ${arg}`)
    }
  }
  return options
}

const currentFilePath = import.meta.filename
if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(currentFilePath).href) {
  try {
    const result = runCorporateForbiddenEndpointScan(parseArgs(process.argv.slice(2)))
    printResult(result)
    process.exitCode = result.exitCode
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
