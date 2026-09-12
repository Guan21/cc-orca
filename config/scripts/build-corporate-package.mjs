#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, dirname, extname, join } from 'node:path'

const target = process.argv[2]
const corporateEnv = {
  ...process.env,
  ORCA_BUILD_PROFILE: 'corporate'
}

const TARGET_COMMANDS = new Map([
  [
    '--win',
    [
      ['run', 'build:relay'],
      ['run', 'build:cli'],
      ['run', 'build:electron-vite:corporate'],
      ['run', 'build:web-from-renderer'],
      ['run', 'ensure:electron-runtime'],
      ['exec', 'electron-builder', '--config', 'config/electron-builder.config.cjs', '--win']
    ]
  ],
  [
    '--mac',
    [
      ['run', 'build:relay'],
      ['run', 'build:cli'],
      ['run', 'build:electron-vite:corporate'],
      ['run', 'build:web-from-renderer'],
      ['run', 'build:computer-macos'],
      ['run', 'build:keyboard-layout-macos'],
      ['run', 'build:notification-status-macos'],
      ['run', 'ensure:electron-runtime'],
      ['exec', 'node', 'config/scripts/build-mac-local.mjs']
    ]
  ]
])

if (!TARGET_COMMANDS.has(target) || process.argv.length !== 3) {
  console.error('Usage: node config/scripts/build-corporate-package.mjs --win|--mac')
  process.exit(1)
}

for (const args of TARGET_COMMANDS.get(target)) {
  await runPnpm(args)
}

function runPnpm(args) {
  return new Promise((resolve, reject) => {
    const child = spawnPnpm(args)
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal)
        return
      }
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`pnpm ${args.join(' ')} exited with code ${code ?? 1}`))
    })
  })
}

function spawnPnpm(args) {
  const pnpmLaunch = findPnpmLaunch()
  if (pnpmLaunch) {
    return spawn(pnpmLaunch.command, [...pnpmLaunch.args, ...args], {
      env: corporateEnv,
      stdio: 'inherit'
    })
  }
  return spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
    env: corporateEnv,
    stdio: 'inherit'
  })
}

function findPnpmLaunch() {
  const npmExecPath = process.env.npm_execpath
  if (npmExecPath?.toLowerCase().includes('pnpm') && existsSync(npmExecPath)) {
    if (['.cjs', '.js'].includes(extname(npmExecPath).toLowerCase())) {
      return { command: process.execPath, args: [npmExecPath] }
    }
    return { command: npmExecPath, args: [] }
  }
  for (const pathEntry of (process.env.PATH ?? '').split(delimiter)) {
    if (!pathEntry) {
      continue
    }
    const cjsCandidate = join(dirname(pathEntry), 'pnpm', 'bin', 'pnpm.cjs')
    if (existsSync(cjsCandidate)) {
      return { command: process.execPath, args: [cjsCandidate] }
    }
    const binaryCandidate = join(dirname(pathEntry), 'pnpm', 'pnpm')
    if (existsSync(binaryCandidate)) {
      return { command: binaryCandidate, args: [] }
    }
  }
  return null
}
