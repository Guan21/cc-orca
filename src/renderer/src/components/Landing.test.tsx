// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Landing from './Landing'

const landingMocks = vi.hoisted(() => ({
  state: {
    repos: [] as unknown[],
    openModal: vi.fn()
  },
  starState: 'not-starred' as const,
  setStarState: vi.fn()
}))

vi.mock('../store', () => ({
  useAppStore: (selector: (state: typeof landingMocks.state) => unknown) =>
    selector(landingMocks.state)
}))

vi.mock('./landing-preflight-runtime', () => ({
  useLandingPreflightRuntime: () => ({ preflightIssues: [] })
}))

vi.mock('./landing-github-star-state', () => ({
  useLandingOrcaStarState: () => [landingMocks.starState, landingMocks.setStarState]
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutKeyDetails: () => ({ keys: [], doubleTap: false })
}))

vi.mock('./ShortcutKeyCombo', () => ({
  ShortcutKeyCombo: () => <span data-shortcut-key-combo="true" />
}))

describe('Landing corporate branding', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    landingMocks.state.repos = []
    landingMocks.state.openModal.mockClear()
    landingMocks.setStarState.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    document.body.replaceChildren()
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  it('keeps the upstream logo and GitHub support prompt in default Orca', async () => {
    await act(async () => root.render(<Landing />))

    expect(container.querySelector('img[alt="Orca logo"]')).not.toBeNull()
    expect(container.textContent).toContain('ORCA')
    expect(container.textContent).toContain('Star on GitHub')
  })

  it('uses text-only corporate branding and hides upstream GitHub promotion', async () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'
    await act(async () => root.render(<Landing />))

    expect(container.querySelector('img[alt="Orca logo"]')).toBeNull()
    expect(container.textContent).toContain('Secure Orca Lite')
    expect(container.textContent).not.toContain('ORCA')
    expect(container.textContent).not.toContain('Star on GitHub')
    expect(container.textContent).not.toContain('Open GitHub')
  })
})
