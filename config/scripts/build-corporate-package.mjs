#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { resolvePnpmCliInvocation } from './pnpm-cli-invocation.mjs'

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
  const { command, prefixArgs, shell } = resolvePnpmCliInvocation()
  return spawn(command, [...prefixArgs, ...args], {
    env: corporateEnv,
    stdio: 'inherit',
    shell
  })
}
