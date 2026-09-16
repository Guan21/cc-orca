const PROCESS_EXTENSION_RE = /\.(?:exe|cmd|bat|ps1)$/i
const INTERPRETER_SCRIPT_EXTENSION_RE = /\.(?:js|mjs|cjs)$/i
const STATIC_INTERPRETER_PROCESS_NAMES = new Set([
  'node',
  'python',
  'python3',
  'bash',
  'zsh',
  'sh',
  'fish',
  'pwsh',
  'powershell'
])
const POSIX_INLINE_SHELL_PROCESS_NAMES = new Set(['bash', 'sh', 'zsh'])
const POWERSHELL_INLINE_SHELL_PROCESS_NAMES = new Set(['pwsh', 'powershell'])
const WINDOWS_CMD_INLINE_SHELL_PROCESS_NAMES = new Set(['cmd'])
const ENV_LAUNCHER_PROCESS_NAMES = new Set(['env'])
const PYTHON_PROCESS_RE = /^python(?:\d+(?:\.\d+)*)?$/
const INTERPRETER_OPTIONS_WITH_VALUE = new Set([
  '-r',
  '--require',
  '--import',
  '--loader',
  '--experimental-loader'
])
const INTERPRETER_OPTIONS_WITH_INLINE_SOURCE = new Set(['-e', '--eval', '-p', '--print', '--check'])

export function normalizeProcessName(
  processName: string | null | undefined,
  options: { stripInterpreterScriptExtension?: boolean } = {}
): string {
  if (!processName) {
    return ''
  }
  const unquoted = processName.trim().replace(/^["']|["']$/g, '')
  const basename = unquoted.split(/[\\/]/).pop() ?? unquoted
  const withoutProcessExtension = basename.toLowerCase().replace(PROCESS_EXTENSION_RE, '')
  if (options.stripInterpreterScriptExtension === true) {
    return withoutProcessExtension.replace(INTERPRETER_SCRIPT_EXTENSION_RE, '')
  }
  return withoutProcessExtension
}

export function tokenizeCommandLine(commandLine: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false
  for (let index = 0; index < commandLine.length; index += 1) {
    const char = commandLine[index]
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      const next = commandLine[index + 1]
      if (next && (/\s/.test(next) || next === '"' || next === "'" || next === '\\')) {
        escaped = true
        continue
      }
    }
    if ((char === '"' || char === "'") && quote === null) {
      quote = char
      continue
    }
    if (quote === char) {
      quote = null
      continue
    }
    if (/\s/.test(char) && quote === null) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current) {
    tokens.push(current)
  }
  return tokens
}

function tokenLooksExecutable(token: string, index: number, firstNormalized: string): boolean {
  if (index === 0) {
    return true
  }
  if (!isInterpreterProcessName(firstNormalized)) {
    return false
  }
  // Why: only inspect interpreter script paths. Prompt text can mention other
  // agents ("compare opencode vs orca"), and treating every argv token as an
  // executable would reintroduce the substring-style false identity class that
  // foreground-process detection is meant to avoid.
  return token.includes('/') || token.includes('\\') || PROCESS_EXTENSION_RE.test(token)
}

function isInterpreterProcessName(normalized: string): boolean {
  return STATIC_INTERPRETER_PROCESS_NAMES.has(normalized) || PYTHON_PROCESS_RE.test(normalized)
}

export const isPythonProcessName = (normalized: string): boolean =>
  PYTHON_PROCESS_RE.test(normalized)

const optionName = (token: string): string => token.split('=', 1)[0] ?? ''

function isPosixInlineCommandFlag(token: string): boolean {
  return token.startsWith('-') && !token.startsWith('--') && token.slice(1).includes('c')
}

function findPosixShellInlineCommand(tokens: string[]): string | null {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (isPosixInlineCommandFlag(token)) {
      return tokens[index + 1] ?? null
    }
    if (!token.startsWith('-')) {
      return null
    }
  }
  return null
}

function findPowerShellInlineCommand(tokens: string[]): string | null {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    const normalized = token.toLowerCase()
    if (normalized === '-command' || normalized === '-c' || normalized === '/command') {
      return tokens[index + 1] ?? null
    }
    for (const prefix of ['-command:', '-command=']) {
      if (normalized.startsWith(prefix)) {
        return token.slice(prefix.length)
      }
    }
    if (!token.startsWith('-') && !token.startsWith('/')) {
      return null
    }
  }
  return null
}

function findWindowsCmdInlineCommand(tokens: string[]): string | null {
  for (let index = 1; index < tokens.length; index += 1) {
    const normalized = tokens[index].toLowerCase()
    if (normalized === '/c' || normalized === '/k') {
      return tokens[index + 1] ?? null
    }
    if (!normalized.startsWith('/')) {
      return null
    }
  }
  return null
}

function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)
}

function findEnvLauncherCommand(tokens: string[]): string | null {
  let index = 1
  while (index < tokens.length && isEnvAssignment(tokens[index])) {
    index += 1
  }
  if (tokens[index] === '--') {
    index += 1
  }
  if (index >= tokens.length || tokens[index].startsWith('-')) {
    return null
  }
  return tokens.slice(index).join(' ')
}

export function findWrappedInlineCommand(tokens: string[], firstNormalized: string): string | null {
  if (POSIX_INLINE_SHELL_PROCESS_NAMES.has(firstNormalized)) {
    return findPosixShellInlineCommand(tokens)
  }
  if (POWERSHELL_INLINE_SHELL_PROCESS_NAMES.has(firstNormalized)) {
    return findPowerShellInlineCommand(tokens)
  }
  if (WINDOWS_CMD_INLINE_SHELL_PROCESS_NAMES.has(firstNormalized)) {
    return findWindowsCmdInlineCommand(tokens)
  }
  if (ENV_LAUNCHER_PROCESS_NAMES.has(firstNormalized)) {
    return findEnvLauncherCommand(tokens)
  }
  return null
}

export function findInterpreterEntrypointToken(
  tokens: string[],
  firstNormalized: string
): string | null {
  if (!isInterpreterProcessName(firstNormalized)) {
    return null
  }
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '--') {
      continue
    }
    if (isPythonProcessName(firstNormalized) && token === '-m') {
      return tokens[index + 1] ?? null
    }
    if (token.startsWith('-')) {
      const name = optionName(token)
      if (INTERPRETER_OPTIONS_WITH_INLINE_SOURCE.has(name)) {
        return null
      }
      if (INTERPRETER_OPTIONS_WITH_VALUE.has(name) && name === token) {
        index += 1
      }
      continue
    }
    if (tokenLooksExecutable(token, index, firstNormalized)) {
      return token
    }
  }
  return null
}

export function comparablePath(token: string): string {
  return token
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\/g, '/')
    .toLowerCase()
}
