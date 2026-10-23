import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { MainProjectSourceLifecycleBridge } from './project-source-production-lifecycle'
import { setup } from './__fixtures__/selected-pr-source-composition'
import { deferred, head, ready } from './__fixtures__/selected-pr-head-provider'

async function fixture() {
  const f = await setup()
  const contents = new EventEmitter()
  const window = Object.assign(new EventEmitter(), { webContents: contents })
  const bridge = new MainProjectSourceLifecycleBridge({
    window: window as never,
    credential: { subscribeRevocation: () => () => {} },
    catalog: { invalidate: vi.fn() },
    retire: () => f.composition.invalidate()
  })
  return { ...f, bridge, window, contents }
}

describe('production retirement signals with offline Task C grant and HEAD receipts', () => {
  it('cannot satisfy Task C using partial production observers even with all other fixture gates', async () => {
    const f = await fixture()
    const denied = await setup({ lifecycle: f.bridge.lifecycle })
    expect(denied.composition.readiness().status).toBe('unavailable')
    expect(await denied.run()).toEqual({ status: 'unavailable' })
    expect(denied.readEvidence).not.toHaveBeenCalled()
    expect(denied.readProjection).not.toHaveBeenCalled()
    expect(denied.send).not.toHaveBeenCalled()
    denied.composition.dispose()
    f.bridge.dispose()
    f.composition.dispose()
  })

  it.each(['head', 'projection'] as const)(
    'retires pending %s work on real bridged navigation signals',
    async (phase) => {
      const f = await fixture()
      const entered = deferred<boolean>()
      const pending = deferred<unknown>()
      const original = f.getCurrent()
      if (phase === 'head') {
        f.readEvidence.mockImplementation(async () => {
          entered.resolve(true)
          return (await pending.promise) as ReturnType<typeof head>
        })
      } else {
        f.readProjection.mockImplementation(async () => {
          entered.resolve(true)
          return await pending.promise
        })
      }
      const operation = f.run()
      await entered.promise
      f.contents.emit('will-frame-navigate')
      f.setCurrent({ ...original, selectionRevision: original.selectionRevision + 1 })
      f.contents.emit('did-start-navigation')
      f.setCurrent(original)
      expect((await operation).status).not.toBe('delivered')
      pending.resolve(phase === 'head' ? head(original) : ready())
      await Promise.resolve()
      expect(f.send).not.toHaveBeenCalled()
      expect(await f.run()).toEqual({ status: 'denied' })
      f.bridge.dispose()
      f.composition.dispose()
    }
  )

  it('invalidates the acquired receipt at the final synchronous handoff', async () => {
    const f = await fixture()
    f.beforeDeliver(() => f.window.emit('close'))
    expect((await f.run()).status).not.toBe('delivered')
    expect(f.send).not.toHaveBeenCalled()
    f.bridge.dispose()
    f.composition.dispose()
  })
})
