// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JiraSetupSteps } from './TaskSourceSimpleSetup'

const mocks = vi.hoisted(() => ({
  dialogOpen: [] as boolean[]
}))

vi.mock('@/components/jira-connect-dialog', () => ({
  JiraConnectDialog: ({ open }: { open: boolean }) => {
    mocks.dialogOpen.push(open)
    return null
  }
}))

afterEach(() => {
  cleanup()
  mocks.dialogOpen = []
  delete globalThis.__ORCA_BUILD_PROFILE__
})

describe('JiraSetupSteps', () => {
  it('does not mount credential dialogs or expose connection actions in Corporate', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'
    const rendered = render(
      <JiraSetupSteps
        connected={false}
        checking={false}
        visible
        canHide
        onToggleVisible={vi.fn()}
        onConnected={vi.fn()}
        onOpenIntegrations={vi.fn()}
      />
    )
    expect(rendered.queryByRole('button')).toBeNull()
    expect(rendered.getByText(/administrator authorization/)).toBeDefined()
    expect(mocks.dialogOpen).toEqual([])
  })

  it('routes connected credential management to Integrations', () => {
    const onOpenIntegrations = vi.fn()
    const rendered = render(
      <JiraSetupSteps
        connected
        checking={false}
        visible
        canHide
        onToggleVisible={vi.fn()}
        onConnected={vi.fn()}
        onOpenIntegrations={onOpenIntegrations}
      />
    )

    fireEvent.click(rendered.getByRole('button', { name: 'Manage keys' }))

    expect(onOpenIntegrations).toHaveBeenCalledOnce()
    expect(mocks.dialogOpen.at(-1)).toBe(false)
  })
})
