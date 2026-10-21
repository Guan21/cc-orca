import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ verify: vi.fn(() => true) }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return { ipcMain: new EventEmitter() }
})
vi.mock('./project-source-window-document', () => ({
  verifyProjectSourceWindowDocument: mocks.verify
}))
import { ipcMain } from 'electron'
import {
  ensureProjectSourceSelectionRetirementResponder,
  registerProjectSourceSelectionRetirement
} from './project-source-selection-retirement'

const channel = 'devCrew:clearProjectSourceSelection'
const cleanups: (() => void)[] = []
function fixture() {
  const sender = Object.assign(new EventEmitter(), { session: {} })
  const window = { webContents: sender }
  const clear = vi.fn()
  const options = {
    window: window as never,
    producer: { clear },
    expectedDocumentUrl: 'file:///app/renderer/index.html',
    currentAppProfile: () => 'personal' as const
  }
  cleanups.push(registerProjectSourceSelectionRetirement(options))
  const event = { sender, senderFrame: {}, returnValue: undefined as unknown }
  return { sender, clear, event, options }
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
  mocks.verify.mockReset().mockReturnValue(true)
})

describe('deny-only project source selection retirement IPC', () => {
  it('installs one deny responder before any eligible window exists', () => {
    ensureProjectSourceSelectionRetirementResponder()
    ensureProjectSourceSelectionRetirementResponder()
    const event = { sender: {}, returnValue: undefined as unknown }
    ipcMain.emit(channel, event)
    expect(event.returnValue).toBe(false)
    expect(ipcMain.listenerCount(channel)).toBe(1)
  })

  it('synchronously clears only its verified owner without accepting a selection payload', () => {
    const f = fixture()
    ipcMain.emit(channel, f.event)
    expect(f.event.returnValue).toBe(true)
    expect(f.clear).toHaveBeenCalledExactlyOnceWith()
    expect(mocks.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        approvedWindow: f.options.window,
        approvedSession: f.sender.session
      }),
      f.sender,
      f.event.senderFrame
    )
  })

  it.each(['window', 'contents', 'frame', 'document', 'session', 'profile'])(
    'rejects an invalid %s attestation',
    () => {
      const f = fixture()
      mocks.verify.mockReturnValue(false)
      ipcMain.emit(channel, f.event)
      expect(f.event.returnValue).toBe(false)
      expect(f.clear).not.toHaveBeenCalled()
    }
  )

  it('rejects unknown senders and any renderer selection or revision argument', () => {
    const f = fixture()
    const other = { ...f.event, sender: {} }
    ipcMain.emit(channel, other)
    ipcMain.emit(channel, f.event, { revision: 5, projectId: 'forged' })
    expect(other.returnValue).toBe(false)
    expect(f.event.returnValue).toBe(false)
    expect(f.clear).not.toHaveBeenCalled()
  })

  it('does not overwrite an existing owner and isolates independent windows', () => {
    const first = fixture()
    const second = fixture()
    expect(() => registerProjectSourceSelectionRetirement(first.options)).toThrow()
    ipcMain.emit(channel, second.event)
    expect(first.clear).not.toHaveBeenCalled()
    expect(second.clear).toHaveBeenCalledOnce()
    expect(ipcMain.listenerCount(channel)).toBe(1)
  })

  it('cleans up its owner on destruction while preserving a deny-only responder', () => {
    const f = fixture()
    f.sender.emit('destroyed')
    expect(ipcMain.listenerCount(channel)).toBe(1)
    expect(f.sender.listenerCount('destroyed')).toBe(0)
    cleanups[0]!()
    ipcMain.emit(channel, f.event)
    expect(f.event.returnValue).toBe(false)
    expect(f.clear).not.toHaveBeenCalled()
    expect(ipcMain.listenerCount(channel)).toBe(1)
  })

  it('returns false rather than leaking exceptions through synchronous IPC', () => {
    const f = fixture()
    f.clear.mockImplementation(() => {
      throw new Error('retired')
    })
    ipcMain.emit(channel, f.event)
    expect(f.event.returnValue).toBe(false)
  })
})
