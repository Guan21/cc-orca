import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ window: vi.fn(), dialog: vi.fn() }))
vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: { fromWebContents: mocks.window },
  dialog: { showMessageBox: mocks.dialog }
}))

import { fixture, HEAD, response } from './project-source-main-refresh-fixture'
import {
  SOURCE_LIFECYCLE_DOMAINS,
  SOURCE_READINESS_GATES
} from './project-source-composition-contract'
import { MainSelectedPrFactDeliveryFence } from './project-source-main-pr-evidence-delivery'

const eventFor = (f: ReturnType<typeof fixture>) => f.event as never

async function registered() {
  const f = fixture(mocks)
  expect(await f.integration.register(eventFor(f))).toBe('registered')
  return f
}

describe('G2-C1 Main registration and one bounded selected PR refresh (offline)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dialog.mockResolvedValue({ response: 1 })
  })

  it('separately consents registration and refresh, deriving HEAD and facts from one fixed read', async () => {
    const f = await registered()
    const send = vi.fn()
    expect(mocks.dialog).toHaveBeenCalledTimes(1)
    expect(f.executeRaw).toHaveBeenCalledTimes(1)
    expect(await f.integration.refreshSelected(eventFor(f), send)).toEqual({ status: 'delivered' })
    expect(mocks.dialog).toHaveBeenCalledTimes(2)
    expect(mocks.dialog.mock.calls[0][1].title).toContain('repository registration')
    expect(mocks.dialog.mock.calls[1][1].title).not.toContain('repository registration')
    expect(f.executeRaw).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(f.executeRaw.mock.calls[1])).toContain('SelectedPrRead')
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0]).toMatchObject({
      version: 1,
      projectId: 'p',
      prNumber: 42,
      headSha: HEAD
    })
    expect(send.mock.calls[0][0].snapshot).toMatchObject({
      attestation: 'not_verified_by_projection',
      agentExecution: 'unknown',
      taskCompletion: 'unknown'
    })
    f.integration.dispose()
  })

  it('permits another separately consented Refresh without repeating repository registration', async () => {
    const f = await registered()
    const send = vi.fn()
    expect(await f.integration.refreshSelected(eventFor(f), send)).toEqual({ status: 'delivered' })
    expect(await f.integration.refreshSelected(eventFor(f), send)).toEqual({ status: 'delivered' })
    expect(send).toHaveBeenCalledTimes(2)
    expect(f.executeRaw).toHaveBeenCalledTimes(3)
    expect(mocks.dialog.mock.calls.map((call) => call[1].title)).toEqual([
      'DevCrew — GitHub repository registration',
      'DevCrew — GitHub project read',
      'DevCrew — GitHub project read'
    ])
    f.integration.dispose()
  })

  it('requires a reviewed Main sink before showing refresh consent or reading', async () => {
    const f = await registered()
    expect(await f.integration.refreshSelected(eventFor(f))).toEqual({ status: 'denied' })
    expect(f.executeRaw).toHaveBeenCalledTimes(1)
    expect(mocks.dialog).toHaveBeenCalledTimes(1)
    f.integration.dispose()
  })

  it('rejects revocation at the final G1 handoff before the sink', async () => {
    const f = await registered()
    const original = MainSelectedPrFactDeliveryFence.prototype.deliver
    const spy = vi
      .spyOn(MainSelectedPrFactDeliveryFence.prototype, 'deliver')
      .mockImplementation(function (this: MainSelectedPrFactDeliveryFence, projection) {
        f.integration.revoke()
        return original.call(this, projection)
      })
    const send = vi.fn()
    try {
      expect((await f.integration.refreshSelected(eventFor(f), send)).status).not.toBe('delivered')
      expect(spy).toHaveBeenCalledOnce()
      expect(send).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
      f.integration.dispose()
    }
  })

  it.each(SOURCE_READINESS_GATES)(
    'rejects false %s readiness before registration or refresh consent',
    async (gate) => {
      const f = await registered()
      f.readinessState[gate] = false
      expect(await f.integration.refreshSelected(eventFor(f), vi.fn())).toEqual({
        status: 'denied'
      })
      expect(f.executeRaw).toHaveBeenCalledTimes(1)
      expect(mocks.dialog).toHaveBeenCalledTimes(1)
      f.integration.dispose()
      const beforeRegistration = fixture(mocks)
      beforeRegistration.readinessState[gate] = 'throw'
      expect(await beforeRegistration.integration.register(eventFor(beforeRegistration))).toBe(
        'denied'
      )
      expect(beforeRegistration.executeRaw).not.toHaveBeenCalled()
      beforeRegistration.integration.dispose()
    }
  )

  it('rejects grant expiration while the response awaits', async () => {
    const f = await registered()
    vi.useFakeTimers()
    const send = vi.fn()
    f.executeRaw.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 16 * 60_000)
      return JSON.stringify(response())
    })
    try {
      expect((await f.integration.refreshSelected(eventFor(f), send)).status).not.toBe('delivered')
      expect(send).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      f.integration.dispose()
    }
  })

  it('requires new consent after cancellation and after rejected Checks', async () => {
    const f = await registered()
    mocks.dialog.mockResolvedValueOnce({ response: 0 })
    expect((await f.integration.refreshSelected(eventFor(f), vi.fn())).status).toBe('denied')
    const raw = response()
    raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.totalCount = 2
    f.executeRaw.mockResolvedValueOnce(JSON.stringify(raw))
    expect((await f.integration.refreshSelected(eventFor(f), vi.fn())).status).not.toBe('delivered')
    expect(await f.integration.refreshSelected(eventFor(f), vi.fn())).toEqual({
      status: 'delivered'
    })
    expect(f.executeRaw).toHaveBeenCalledTimes(3)
    expect(mocks.dialog).toHaveBeenCalledTimes(4)
    f.integration.dispose()
  })

  it.each(['registration', 'refresh'])(
    'cancelling %s performs no corresponding request',
    async (operation) => {
      const f = fixture(mocks)
      if (operation === 'refresh') {
        expect(await f.integration.register(eventFor(f))).toBe('registered')
      }
      mocks.dialog.mockResolvedValue({ response: 0 })
      const send = vi.fn()
      if (operation === 'registration') {
        expect(await f.integration.register(eventFor(f))).toBe('denied')
      } else {
        expect((await f.integration.refreshSelected(eventFor(f), send)).status).not.toBe(
          'delivered'
        )
      }
      expect(f.executeRaw).toHaveBeenCalledTimes(operation === 'registration' ? 0 : 1)
      expect(send).not.toHaveBeenCalled()
      f.integration.dispose()
    }
  )

  it.each([
    [
      'repository numeric identity',
      (raw: ReturnType<typeof response>) => {
        raw.data.node.databaseId = 322
      }
    ],
    [
      'repository node identity',
      (raw: ReturnType<typeof response>) => {
        raw.data.node.id = 'R_other'
      }
    ],
    [
      'selected PR',
      (raw: ReturnType<typeof response>) => {
        raw.data.node.pullRequest.number = 43
      }
    ],
    [
      'commit HEAD linkage',
      (raw: ReturnType<typeof response>) => {
        raw.data.node.pullRequest.commits.nodes[0].commit.oid = 'b'.repeat(40)
      }
    ],
    [
      'suite HEAD linkage',
      (raw: ReturnType<typeof response>) => {
        raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.nodes[0].commit.oid =
          'b'.repeat(40)
      }
    ],
    [
      'incomplete suite count',
      (raw: ReturnType<typeof response>) => {
        raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.totalCount = 2
      }
    ],
    [
      'paginated Checks',
      (raw: ReturnType<typeof response>) => {
        raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.nodes[0].checkRuns.pageInfo.hasNextPage = true
      }
    ]
  ] as const)('rejects %s without supplementary requests', async (_name, mutate) => {
    const f = await registered()
    const raw = response()
    mutate(raw)
    f.executeRaw.mockResolvedValueOnce(JSON.stringify(raw))
    const send = vi.fn()
    expect((await f.integration.refreshSelected(eventFor(f), send)).status).not.toBe('delivered')
    expect(f.executeRaw).toHaveBeenCalledTimes(2)
    expect(send).not.toHaveBeenCalled()
    f.integration.dispose()
  })

  it('rejects partial GraphQL errors with no fact delivery', async () => {
    const f = await registered()
    f.executeRaw.mockResolvedValueOnce(
      JSON.stringify({ ...response(), errors: [{ message: 'denied' }] })
    )
    const send = vi.fn()
    expect((await f.integration.refreshSelected(eventFor(f), send)).status).not.toBe('delivered')
    expect(send).not.toHaveBeenCalled()
    f.integration.dispose()
  })

  it.each(['disabled', 'missing composition'])(
    '%s never invokes an offline source during refresh',
    async (mode) => {
      const f = fixture(mocks, mode !== 'disabled', mode !== 'missing composition')
      if (mode === 'missing composition') {
        expect(await f.integration.register(eventFor(f))).toBe('denied')
      }
      const send = vi.fn()
      expect((await f.integration.refreshSelected(eventFor(f), send)).status).not.toBe('delivered')
      expect(f.executeRaw).not.toHaveBeenCalled()
      expect(mocks.dialog).not.toHaveBeenCalled()
      f.integration.dispose()
    }
  )

  it.each(SOURCE_LIFECYCLE_DOMAINS)(
    'retires %s during the read before delivery',
    async (domain) => {
      const f = await registered()
      const send = vi.fn()
      f.executeRaw.mockImplementationOnce(async () => {
        f.lifecycleListeners.get(domain)!()
        return JSON.stringify(response())
      })
      expect((await f.integration.refreshSelected(eventFor(f), send)).status).not.toBe('delivered')
      expect(send).not.toHaveBeenCalled()
      f.integration.dispose()
    }
  )

  it.each(['catalog ABA', 'lost catalog event', 'document', 'session', 'principal', 'revoke'])(
    'rejects %s while the selected read awaits',
    async (change) => {
      const f = await registered()
      const send = vi.fn()
      f.executeRaw.mockImplementationOnce(async () => {
        if (change === 'catalog ABA') {
          f.catalog.selectCurrent({ ...f.selected, prNumber: 43 })
          f.catalog.selectCurrent(f.selected)
        } else if (change === 'lost catalog event') {
          f.project.updatedAt += 1
        } else if (change === 'document') {
          f.sender.emit('will-navigate')
        } else if (change === 'session') {
          f.sender.session = { label: 'replacement' }
        } else if (change === 'principal') {
          f.rotate()
        } else {
          f.integration.revoke()
        }
        return JSON.stringify(response())
      })
      expect((await f.integration.refreshSelected(eventFor(f), send)).status).not.toBe('delivered')
      expect(send).not.toHaveBeenCalled()
      f.integration.dispose()
    }
  )

  it('rejects reentrant registration and refresh from the source callback', async () => {
    const f = await registered()
    const reentrantSend = vi.fn()
    f.executeRaw.mockImplementationOnce(async () => {
      expect(await f.integration.register(eventFor(f))).toBe('denied')
      expect(await f.integration.refreshSelected(eventFor(f), reentrantSend)).toEqual({
        status: 'denied'
      })
      return JSON.stringify(response())
    })
    const send = vi.fn()
    expect(await f.integration.refreshSelected(eventFor(f), send)).toEqual({ status: 'delivered' })
    expect(send).toHaveBeenCalledOnce()
    expect(reentrantSend).not.toHaveBeenCalled()
    expect(f.executeRaw).toHaveBeenCalledTimes(2)
    f.integration.dispose()
  })

  it('rejects reentrant operations from the final synchronous sink', async () => {
    const f = await registered()
    const nestedSend = vi.fn()
    let nested: Promise<unknown>[] = []
    expect(
      await f.integration.refreshSelected(eventFor(f), () => {
        nested = [
          f.integration.register(eventFor(f)),
          f.integration.refreshSelected(eventFor(f), nestedSend)
        ]
      })
    ).toEqual({ status: 'delivered' })
    expect(await Promise.all(nested)).toEqual(['denied', { status: 'denied' }])
    expect(nestedSend).not.toHaveBeenCalled()
    expect(f.executeRaw).toHaveBeenCalledTimes(2)
    f.integration.dispose()
  })
})
