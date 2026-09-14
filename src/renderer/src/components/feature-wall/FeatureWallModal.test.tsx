// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FeatureWallModal from './FeatureWallModal'

const featureWallMocks = vi.hoisted(() => ({
  state: {
    activeModal: 'feature-wall',
    modalData: {} as Record<string, unknown>,
    closeModal: vi.fn()
  }
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof featureWallMocks.state) => unknown) =>
    selector(featureWallMocks.state)
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
    open ? <div data-feature-wall-dialog="true">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>
}))

vi.mock('./FeatureWallTourSurface', () => ({
  FeatureWallTourSurface: () => <div data-feature-wall-tour="true" />
}))

describe('FeatureWallModal corporate gating', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    featureWallMocks.state.activeModal = 'feature-wall'
    featureWallMocks.state.modalData = {}
    featureWallMocks.state.closeModal.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    document.body.replaceChildren()
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  it('renders the Feature Wall in default Orca', async () => {
    await act(async () => root.render(<FeatureWallModal />))

    expect(container.querySelector('[data-feature-wall-dialog="true"]')).not.toBeNull()
    expect(container.querySelector('[data-feature-wall-tour="true"]')).not.toBeNull()
  })

  it('does not render the upstream Feature Wall in corporate builds', async () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'
    await act(async () => root.render(<FeatureWallModal />))

    expect(container.querySelector('[data-feature-wall-dialog="true"]')).toBeNull()
    expect(container.querySelector('[data-feature-wall-tour="true"]')).toBeNull()
  })
})
