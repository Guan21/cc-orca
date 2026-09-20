// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store'
import { GeneralUpdateSettingsSection } from './GeneralUpdateSettingsSection'

vi.mock('./GeneralRemoteServerUpdates', () => ({ GeneralRemoteServerUpdates: () => null }))
vi.mock('./ReleaseChannelSection', () => ({ ReleaseChannelSection: () => null }))

beforeEach(() => {
  delete globalThis.__ORCA_BUILD_PROFILE__
  useAppStore.setState({
    updateStatus: { state: 'available', version: '1.4.200', changelog: null }
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      updater: {
        check: vi.fn(),
        download: vi.fn(),
        getVersion: vi.fn().mockResolvedValue('1.4.199')
      }
    }
  })
})

afterEach(() => {
  delete globalThis.__ORCA_BUILD_PROFILE__
  cleanup()
  useAppStore.setState({ updateStatus: { state: 'idle' } })
})

it('is unavailable in corporate builds', () => {
  globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

  render(<GeneralUpdateSettingsSection />)

  expect(screen.queryByRole('button', { name: 'Check for Updates' })).toBeNull()
  expect(screen.queryByText('Updates')).toBeNull()
})

it('describes the available action as a download', () => {
  render(<GeneralUpdateSettingsSection />)

  expect(screen.getByRole('button', { name: 'Download Update (1.4.200)' })).toBeTruthy()
  expect(screen.getByText(/is available\. Click "Download Update" to download it\./)).toBeTruthy()
  expect(screen.queryByText(/download and install it/)).toBeNull()
})
