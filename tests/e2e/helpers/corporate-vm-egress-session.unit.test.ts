import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runProcess } from '../../../src/shared/child-process/run-process'
import { CorporateVmGuest, CorporateVmSentinel, quoteGuest } from './corporate-vm-egress-session'

describe('VM acceptance fixtures (semantic coverage only)', () => {
  it('quotes fixture paths without evaluating shell text', () => {
    expect(quoteGuest("/tmp/a'b$()")).toBe("'/tmp/a'\\''b$()'")
  })

  it('uses a dynamic Host-local sentinel with a deterministic SCM fixture', async () => {
    const guest = new CorporateVmGuest()
    const sentinel = new CorporateVmSentinel()
    const checkout = mkdtempSync(path.join(tmpdir(), 'orca-sentinel-fetch-'))
    vi.spyOn(guest.client, 'forwardIn').mockImplementation((address, port, callback) => {
      expect(address).toBe('127.0.0.1')
      expect(port).toBe(0)
      callback?.(undefined, 12345)
      return guest.client
    })
    try {
      await sentinel.start(guest)
      expect(sentinel.port).toBe(12345)
      expect(sentinel.hostPort).toBeGreaterThan(0)
      const origin = `http://127.0.0.1:${sentinel.hostPort}`
      expect(await (await fetch(`${origin}/claude`)).text()).toBe('ok')
      expect(await (await fetch(`${origin}/codex`)).text()).toBe('ok')
      const refs = await fetch(`${origin}/scm/info/refs`)
      expect(refs.status).toBe(200)
      expect(await refs.text()).toMatch(/^[a-f0-9]{40}\trefs\/heads\/main\n$/u)
      expect((await fetch(`${origin}/scm/missing`)).status).toBe(404)
      expect((await fetch(`${origin}/unapproved`)).status).toBe(404)
      expect(sentinel.requests.map((request) => request.capability)).toEqual([
        'claude',
        'codex',
        'scm',
        'scm'
      ])
      expect(
        sentinel.requests.every(
          (request) => Object.keys(request).sort().join(',') === 'capability,timestamp'
        )
      ).toBe(true)
      const env = {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: path.join(checkout, 'no-global-config')
      }
      expect((await runProcess({ program: 'git', args: ['init', checkout], env })).code).toBe(0)
      expect(
        (
          await runProcess({
            program: 'git',
            args: ['-C', checkout, 'fetch', `${origin}/scm`, 'main'],
            env
          })
        ).code
      ).toBe(0)
    } finally {
      await sentinel.stop()
      rmSync(checkout, { recursive: true, force: true })
      guest.client.end()
    }
  })

  it('rejects a container, unsupported provider, and missing guest tools', async () => {
    const guest = new CorporateVmGuest()
    const execute = vi.spyOn(guest, 'execute')
    execute.mockResolvedValueOnce('docker')
    await expect(guest.attestRealVm()).rejects.toThrow('Real Linux VM attestation failed')
    execute.mockResolvedValueOnce('none')
    await expect(guest.attestRealVm()).rejects.toThrow('Real Linux VM attestation failed')
    execute.mockRejectedValueOnce(new Error('missing guest prerequisite'))
    await expect(guest.attestRealVm()).rejects.toThrow('missing guest prerequisite')
    execute.mockResolvedValueOnce('oracle')
    await expect(guest.attestRealVm()).resolves.toBe('oracle')
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('! systemd-detect-virt --container --quiet')
    )
    guest.client.end()
  })
})
