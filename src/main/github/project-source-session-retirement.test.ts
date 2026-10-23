import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MainProjectSourceIntegration } from './project-source-main-integration'

const mocks = vi.hoisted(() => ({
  options: [] as ConstructorParameters<typeof MainProjectSourceIntegration>[0][],
  dispose: vi.fn(),
  revoke: vi.fn()
}))
vi.mock('./project-source-main-integration', () => ({
  MainProjectSourceIntegration: class {
    constructor(options: ConstructorParameters<typeof MainProjectSourceIntegration>[0]) {
      mocks.options.push(options)
    }
    dispose = mocks.dispose
    revoke = mocks.revoke
  }
}))
import { MainProjectSourceBootstrap } from './project-source-main-bootstrap'

function windowFixture(session = {}) {
  const contents = Object.assign(new EventEmitter(), { session, isDestroyed: () => false })
  return Object.assign(new EventEmitter(), { webContents: contents, isDestroyed: () => false })
}
function fixture() {
  const catalog = { subscribe: () => () => {}, invalidate: vi.fn() }
  const owner = new MainProjectSourceBootstrap({
    catalog: catalog as never,
    expectedDocumentUrl: 'file:///app/index.html',
    currentAppProfile: () => 'personal',
    currentProfileIdentity: () => 'profile'
  })
  return { owner, catalog }
}
beforeEach(() => {
  mocks.options.length = 0
  vi.clearAllMocks()
})

describe('#176 Main Session retirement (offline Electron fixtures)', () => {
  it('retires the previous owner before the actual main-window factory can publish a Session', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/main/startup/main-window-controller.ts'),
      'utf8'
    )
    const retire = source.indexOf('state.projectSourceBootstrap?.retireMainWindow()')
    const create = source.indexOf('const window = createMainWindow(')
    expect(retire).toBeGreaterThanOrEqual(0)
    expect(retire).toBeLessThan(create)
  })

  it('retires A before replacement and never reuses its credential monitor after Session A-B-A', () => {
    const { owner } = fixture()
    const sessionA = {}
    const sessionB = {}
    const first = windowFixture(sessionA)
    expect(owner.attachMainWindow(first as never)).toBe(true)
    owner.retireMainWindow()
    expect(mocks.dispose).toHaveBeenCalledOnce()
    expect(first.eventNames()).toHaveLength(0)
    expect(first.webContents.eventNames()).toHaveLength(0)
    expect(owner.attachMainWindow(windowFixture(sessionB) as never)).toBe(true)
    owner.retireMainWindow()
    expect(owner.attachMainWindow(windowFixture(sessionA) as never)).toBe(true)
    expect(mocks.options[0].origin.approvedSession).toBe(sessionA)
    expect(mocks.options[1].origin.approvedSession).toBe(sessionB)
    expect(mocks.options[2].origin.approvedSession).toBe(sessionA)
    expect(new Set(mocks.options.map((options) => options.credential)).size).toBe(3)
    expect(mocks.options.every((options) => options.enabled === false)).toBe(true)
    owner.dispose()
  })

  it.each(['explicit', 'destroyed'] as const)(
    'rejects reentrant attachment throughout %s retirement callbacks',
    (transition) => {
      const { owner, catalog } = fixture()
      const first = windowFixture()
      const next = windowFixture()
      owner.attachMainWindow(first as never)
      let nested: boolean | undefined
      catalog.invalidate.mockImplementationOnce(() => {
        nested = owner.attachMainWindow(next as never)
      })
      if (transition === 'explicit') {
        owner.retireMainWindow()
      } else {
        first.webContents.emit('destroyed')
      }
      expect(nested).toBe(false)
      expect(mocks.options).toHaveLength(1)
      expect(owner.attachMainWindow(next as never)).toBe(true)
      owner.dispose()
    }
  )

  it('retirement is idempotent and a disposed owner cannot reattach', () => {
    const { owner } = fixture()
    const window = windowFixture()
    owner.attachMainWindow(window as never)
    owner.retireMainWindow()
    owner.retireMainWindow()
    expect(mocks.dispose).toHaveBeenCalledOnce()
    owner.dispose()
    expect(owner.attachMainWindow(window as never)).toBe(false)
  })
})
