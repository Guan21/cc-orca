import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

await run(process.execPath, [
  join(root, 'node_modules', 'vitest', 'vitest.mjs'),
  'run',
  '--config',
  'config/vitest.config.ts',
  'src/main/network/corporate-runtime-egress-observer.test.ts'
])

await run(process.execPath, [
  join(root, 'node_modules', '@playwright', 'test', 'cli.js'),
  'test',
  'tests/e2e/corporate-runtime-egress.spec.ts',
  '--config',
  'tests/playwright.config.ts',
  '--project',
  'electron-headless',
  '--workers=1'
])

function run(command, args) {
  return new Promise((resolve, reject) => {
    if (command.endsWith('vitest.mjs') && !existsSync(command)) {
      reject(new Error(`Missing test runner: ${command}`))
      return
    }
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        ORCA_BACKGROUND_LAUNCH: '1',
        ORCA_E2E_CORPORATE_BUILD: '1'
      }
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited with signal ${signal}`))
        return
      }
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`))
        return
      }
      resolve()
    })
  })
}
