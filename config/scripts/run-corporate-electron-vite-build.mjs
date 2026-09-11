import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const buildScript = fileURLToPath(new URL('./run-electron-vite-build.mjs', import.meta.url))

const child = spawn(process.execPath, [buildScript, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ORCA_BUILD_PROFILE: 'corporate'
  }
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
