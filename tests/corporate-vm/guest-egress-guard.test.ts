import { describe, expect, it } from 'vitest'
import {
  buildGuestGuardScripts,
  classifyGuestAttempt,
  parseGuestGuardSnapshot,
  createVmGuestEgressGuard
} from './guest-egress-guard'

const sentinel = { address: '192.168.64.1', port: 43123, protocol: 'tcp' as const }
const input = { sessionId: 'abc123', sentinel, controlEndpoints: [] }
const completedSnapshot = (data: string): string =>
  `${data}\nCOUNTER sentinel 0\nCOUNTER rejected 0\n` +
  'HOOK iptables OUTPUT\nHOOK iptables FORWARD\nHOOK ip6tables OUTPUT\nHOOK ip6tables FORWARD\nGUARD_COMPLETE abc123\n'

describe('guest egress boundary', () => {
  it('preserves established and loopback traffic but never broadly trusts private networks', () => {
    const scripts = buildGuestGuardScripts(input)
    expect(scripts.install).toContain('--ctstate ESTABLISHED,RELATED')
    expect(scripts.install).toContain('-o lo -j RETURN')
    expect(scripts.install).toContain('-d 192.168.64.1 -p tcp --dport 43123')
    expect(scripts.install).toContain('ip6tables')
    expect(scripts.install).toContain('-I OUTPUT 1')
    expect(scripts.install).toContain('-I FORWARD 1')
    expect(scripts.install).not.toMatch(/192\.168\.0\.0\/16|10\.0\.0\.0\/8/)
    expect(scripts.remove).toContain('-D OUTPUT -j ORCA_EG_abc123')
    expect(scripts.remove).toContain('-D FORWARD -j ORCA_EG_abc123')
    expect(scripts.read).toContain('for hook in OUTPUT FORWARD; do')
    expect(scripts.read).toContain('rules=$(sudo -n "$fw" -w -S "$hook")')
    expect(scripts.install).toContain('trap cleanup EXIT')
  })

  it('rejects shell-injectable destinations and session identifiers', () => {
    expect(() => buildGuestGuardScripts({ ...input, sessionId: 'a;reboot' })).toThrow()
    expect(() =>
      buildGuestGuardScripts({ ...input, sentinel: { ...sentinel, address: 'host;id' } })
    ).toThrow()
    expect(() => buildGuestGuardScripts({ ...input, sentinel: { ...sentinel, port: 0 } })).toThrow()
  })

  it('parses only tagged destinations, omitting sensitive or unrelated diagnostics', () => {
    const snapshot = parseGuestGuardSnapshot(
      'COUNTER sentinel 1\nCOUNTER rejected 2\n' +
        'kernel: ORCA_abc123_DENY IN= OUT=eth0 SRC=192.168.64.2 DST=203.0.113.10 PROTO=TCP SPT=59100 DPT=443 UID=1000 secret=credential\n' +
        'kernel: ORCA_other_DENY DST=203.0.113.11 PROTO=TCP DPT=443\n',
      'abc123'
    )
    expect(snapshot).toEqual({
      sentinelPackets: 1,
      rejectedPackets: 2,
      destinations: [
        { address: '203.0.113.10', port: 443, protocol: 'tcp', disposition: 'rejected' }
      ]
    })
    expect(JSON.stringify(snapshot)).not.toContain('credential')
  })

  it('fails closed when counters cannot be read', () => {
    expect(() => parseGuestGuardSnapshot('', 'abc123')).toThrow()
    expect(() =>
      parseGuestGuardSnapshot('COUNTER sentinel 0\nCOUNTER rejected nope', 'abc123')
    ).toThrow()
    expect(() =>
      parseGuestGuardSnapshot(
        'COUNTER sentinel 0\nCOUNTER rejected 0\nORCA_abc123_DENY DST=',
        'abc123'
      )
    ).toThrow('Malformed guest firewall log')
  })

  it('does not let shell pipelines hide firewall or kernel-log read failures', () => {
    const scripts = buildGuestGuardScripts(input)
    expect(scripts.read).toContain('table=$(sudo -n "$fw"')
    expect(scripts.read).toContain('kernel_log=$(sudo -n dmesg)')
    expect(scripts.read).not.toContain('sudo -n dmesg |')
  })

  it('does not report zero when the completed snapshot was truncated', async () => {
    const guard = createVmGuestEgressGuard({
      ...input,
      runtimeId: 'vm1',
      execute: async () => 'COUNTER sentinel 0\nCOUNTER rejected 0\n'
    })
    await guard.install()
    await expect(guard.observe({ scenario: 'idle' })).rejects.toThrow('incomplete')
  })

  it('fails a completed snapshot missing one family forwarding hook', async () => {
    const guard = createVmGuestEgressGuard({
      ...input,
      runtimeId: 'vm1',
      execute: async () =>
        completedSnapshot('COUNTER sentinel 0\nCOUNTER rejected 0\n').replace(
          'HOOK ip6tables FORWARD\n',
          ''
        )
    })
    await guard.install()
    await expect(guard.observe({ scenario: 'idle' })).rejects.toThrow('hook integrity')
  })

  it('fails missing log evidence even for an otherwise explicit provider operation', async () => {
    const guard = createVmGuestEgressGuard({
      ...input,
      runtimeId: 'vm1',
      execute: async () => completedSnapshot('COUNTER sentinel 1\nCOUNTER rejected 0\n')
    })
    await guard.install()
    const result = await guard.observe({
      scenario: 'explicit-codex',
      initiatedBy: { kind: 'provider-operation', provider: 'codex', operation: 'test' },
      processEvidence: { executable: 'codex', pid: 12 }
    })
    expect(result.unexpectedPackets).toBe(1)
    expect(result.attempts).toMatchObject([
      { expected: false, process: 'unknown', destination: null }
    ])
  })

  it('fails counter resets and removes the guard after a failed observation', async () => {
    const executions: string[] = []
    let reads = 0
    const guard = createVmGuestEgressGuard({
      ...input,
      runtimeId: 'vm1',
      execute: async (script) => {
        executions.push(script)
        if (!script.includes('COUNTER')) {
          return ''
        }
        return completedSnapshot(`COUNTER sentinel 0\nCOUNTER rejected ${reads++ === 0 ? 1 : 0}\n`)
      }
    })
    await guard.install()
    await guard.observe({ scenario: 'idle' })
    await expect(guard.observe({ scenario: 'idle' })).rejects.toThrow('reset or truncated')
    await guard.remove()
    expect(executions.at(-1)).toContain('-D OUTPUT -j ORCA_EG_abc123')
  })

  it('removes partial rules when installation rejects before completion', async () => {
    const executions: string[] = []
    const guard = createVmGuestEgressGuard({
      ...input,
      runtimeId: 'vm1',
      execute: async (script) => {
        executions.push(script)
        if (script.includes('trap cleanup EXIT')) {
          throw new Error('SSH connection lost')
        }
        return ''
      }
    })
    await expect(guard.install()).rejects.toThrow('SSH connection lost')
    await guard.remove()
    expect(executions.length).toBeGreaterThan(1)
    expect(executions.at(-1)).not.toContain('trap cleanup EXIT')
    expect(executions.at(-1)).toContain('-D OUTPUT -j ORCA_EG_abc123')
  })

  it('reports the actual Python executable separately from correlated provider identity', () => {
    expect(
      classifyGuestAttempt({
        runtimeId: 'vm1',
        scenario: 'explicit-claude',
        sentinel,
        destination: sentinel,
        disposition: 'sentinel',
        processEvidence: { executable: 'python3', provider: 'claude', pid: 12 },
        initiatedBy: { kind: 'provider-operation', provider: 'claude', operation: 'test' }
      })
    ).toMatchObject({ expected: true, process: 'python3', provider: 'claude', pid: 12 })
  })

  it('uses per-window deltas and observes loopback sentinel NEW traffic before loopback exemption', async () => {
    const loopback = { ...input, sentinel: { ...sentinel, address: '127.0.0.1' } }
    const scripts = buildGuestGuardScripts(loopback)
    expect(scripts.install.indexOf('-d 127.0.0.1')).toBeLessThan(scripts.install.indexOf('-o lo'))
    const log = 'ORCA_abc123_ALLOW DST=127.0.0.1 PROTO=TCP DPT=43123'
    let reads = 0
    const guard = createVmGuestEgressGuard({
      ...loopback,
      runtimeId: 'vm1',
      execute: async (script) => {
        if (!script.includes('COUNTER')) {
          return ''
        }
        return completedSnapshot(
          reads++ === 0
            ? 'COUNTER sentinel 0\nCOUNTER rejected 0\n'
            : `COUNTER sentinel 1\nCOUNTER rejected 0\n${log}\n`
        )
      }
    })
    await guard.install()
    expect((await guard.observe({ scenario: 'idle' })).unexpectedPackets).toBe(0)
    const result = await guard.observe({
      scenario: 'explicit-claude',
      initiatedBy: { kind: 'provider-operation', provider: 'claude', operation: 'test' },
      processEvidence: { executable: 'claude', pid: 20 }
    })
    expect(result.unexpectedPackets).toBe(0)
    expect(result.sentinelPackets).toBe(1)
    expect(result.attempts[0]).toMatchObject({
      expected: true,
      attribution: 'scenario-process-correlation'
    })
  })

  it('never grants credentials alone permission to reach the sentinel', () => {
    expect(
      classifyGuestAttempt({
        runtimeId: 'vm1',
        scenario: 'claude-credential-only',
        sentinel,
        destination: sentinel,
        disposition: 'sentinel'
      })
    ).toMatchObject({ plane: 'vm', expected: false, process: 'unknown' })
  })

  it('correlates explicit provider process evidence with an exact sentinel destination', () => {
    expect(
      classifyGuestAttempt({
        runtimeId: 'vm1',
        scenario: 'explicit-claude',
        sentinel,
        destination: sentinel,
        disposition: 'sentinel',
        processEvidence: { executable: 'claude', pid: 12 },
        initiatedBy: { kind: 'provider-operation', provider: 'claude', operation: 'test' }
      })
    ).toMatchObject({
      expected: true,
      category: 'provider-specific-egress',
      process: 'claude',
      pid: 12
    })
  })

  it('rejects destination mismatches and unsupported attribution', () => {
    const action = { kind: 'provider-operation' as const, provider: 'codex', operation: 'test' }
    expect(
      classifyGuestAttempt({
        runtimeId: 'vm1',
        scenario: 'explicit-codex',
        sentinel,
        destination: { ...sentinel, port: 443 },
        disposition: 'rejected',
        initiatedBy: action,
        processEvidence: { executable: 'codex', pid: 13 }
      })
    ).toMatchObject({ expected: false, failure: 'destination-mismatch' })
    expect(
      classifyGuestAttempt({
        runtimeId: 'vm1',
        scenario: 'explicit-codex',
        sentinel,
        destination: sentinel,
        disposition: 'sentinel',
        initiatedBy: action
      })
    ).toMatchObject({ expected: false, failure: 'missing-attribution' })
  })

  it('requires explicit SCM evidence and exact configured destination', () => {
    const scm = {
      runtimeId: 'vm1',
      scenario: 'explicit-scm',
      sentinel,
      initiatedBy: { kind: 'user-action' as const, action: 'scm-fetch' },
      processEvidence: { executable: 'git' as const, pid: 31 }
    }
    expect(
      classifyGuestAttempt({ ...scm, destination: sentinel, disposition: 'sentinel' })
    ).toMatchObject({ expected: true, process: 'git', category: 'user-initiated-egress' })
    expect(
      classifyGuestAttempt({
        ...scm,
        destination: { ...sentinel, port: 443 },
        disposition: 'rejected'
      })
    ).toMatchObject({ expected: false, failure: 'destination-mismatch' })
  })

  it.each([
    'https://api.onorca.dev',
    'https://github.com/stablyai/orca',
    'https://github.com/stablyai/orca-plugins',
    'https://us.i.posthog.com',
    'https://discord.gg/orca',
    'https://x.com/orca_build',
    'https://twitter.com/orca_build'
  ])(
    'rejects a synthetic legacy destination without resolving or contacting %s',
    (syntheticDestination) => {
      expect(
        classifyGuestAttempt({
          runtimeId: 'vm1',
          scenario: 'forbidden-synthetic',
          sentinel,
          destination: { address: '203.0.113.10', port: 443, protocol: 'tcp' },
          disposition: 'rejected',
          syntheticDestination
        })
      ).toMatchObject({ expected: false, category: 'forbidden-legacy-implicit-dependency' })
    }
  )
})
