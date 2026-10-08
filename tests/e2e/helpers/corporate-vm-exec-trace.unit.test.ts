import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runProcess } from '../../../src/shared/child-process/run-process'
import { createVmProviderExecTrace } from './corporate-vm-exec-trace'

describe('continuous guest exec evidence (semantic coverage only)', () => {
  async function fixture(
    trace: string,
    stats = 'overrun: 0\ncommit overrun: 0\ndropped events: 0\n'
  ) {
    const root = mkdtempSync(path.join(tmpdir(), 'orca-exec-evidence-'))
    mkdirSync(path.join(root, 'events/sched/sched_process_exec'), { recursive: true })
    mkdirSync(path.join(root, 'per_cpu/cpu0'), { recursive: true })
    writeFileSync(path.join(root, 'tracing_on'), '1')
    writeFileSync(path.join(root, 'events/sched/sched_process_exec/enable'), '1')
    writeFileSync(path.join(root, 'per_cpu/cpu0/stats'), stats)
    writeFileSync(path.join(root, 'trace'), trace)
    const scripts: string[] = []
    const guard = createVmProviderExecTrace({
      sessionId: 'fixture1',
      execute: async (script) => {
        scripts.push(script)
        if (!script.includes("<<'PY'")) {
          return ''
        }
        const sanitizer = script.split("<<'PY'\n")[1].split('\nPY')[0]
        const result = await runProcess({
          program: process.platform === 'win32' ? 'python' : 'python3',
          args: ['-', root],
          input: sanitizer
        })
        if (result.code !== 0) {
          throw new Error('Guest trace prerequisite or evidence invalid')
        }
        return result.stdout
      }
    })
    await guard.install()
    return { root, scripts, guard, cleanup: () => rmSync(root, { recursive: true, force: true }) }
  }

  it('retains short-lived execution events and returns only safe names and PIDs', async () => {
    const sample = await fixture(
      [
        'shell-12 [000] 42.00: sched_process_exec: filename=/private/claude pid=55 old_pid=55',
        'shell-13 [000] 42.01: sched_process_exec: filename=/private/\\x63odex pid=56 old_pid=56',
        'shell-14 [000] 42.02: sched_process_exec: filename=/private/\\156ode pid=57 old_pid=57',
        'shell-15 [000] 42.03: sched_process_exec: filename=/private/nodejs pid=58 old_pid=58',
        'shell-16 [000] 42.04: sched_process_exec: filename=/secret-sensitive-fixture/python3 pid=59 old_pid=59'
      ].join('\n')
    )
    try {
      const evidence = await sample.guard.observeQuiet()
      expect(evidence).toEqual({
        overruns: 0,
        providerLaunches: [
          { process: 'claude', pid: 55 },
          { process: 'codex', pid: 56 },
          { process: 'node', pid: 57 },
          { process: 'nodejs', pid: 58 }
        ]
      })
      expect(JSON.stringify(evidence)).not.toContain('private')
      expect(JSON.stringify(evidence)).not.toContain('secret')
      expect(sample.scripts[1]).toContain('trap cleanup EXIT')
      await sample.guard.remove()
      expect(sample.scripts.at(-1)).toContain('sudo -n rmdir "$instance"')
    } finally {
      sample.cleanup()
    }
  })

  it.each(['overrun: 1', 'commit overrun: 1', 'dropped events: 1'])(
    'fails closed on lost event evidence: %s',
    async (stats) => {
      const sample = await fixture('', `overrun: 0\ncommit overrun: 0\n${stats}\n`)
      try {
        await expect(sample.guard.observeQuiet()).rejects.toThrow('evidence lost')
      } finally {
        sample.cleanup()
      }
    }
  )

  it('rejects disabled tracing and malformed event records', async () => {
    const sample = await fixture('42: sched_process_exec: malformed')
    try {
      await expect(sample.guard.observeQuiet()).rejects.toThrow('evidence invalid')
      writeFileSync(path.join(sample.root, 'trace'), '')
      writeFileSync(path.join(sample.root, 'tracing_on'), '0')
      await expect(sample.guard.observeQuiet()).rejects.toThrow('evidence invalid')
    } finally {
      sample.cleanup()
    }
  })

  it('removes a partially installed instance after installation fails', async () => {
    const scripts: string[] = []
    const guard = createVmProviderExecTrace({
      sessionId: 'partial1',
      execute: async (script) => {
        scripts.push(script)
        if (script.includes('trap cleanup EXIT')) {
          throw new Error('install interrupted')
        }
        return ''
      }
    })
    await expect(guard.install()).rejects.toThrow('install interrupted')
    await guard.remove()
    expect(scripts.at(-1)).toContain('sudo -n rmdir "$instance"')
    expect(scripts[0]).toContain('sudo -n test ! -d "$instance"')
    expect(scripts[0]).toContain('sudo -n test -d "$base/instances"')
  })
})
