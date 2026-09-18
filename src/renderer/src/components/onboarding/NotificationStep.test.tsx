import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { NotificationStep } from './NotificationStep'
import {
  MacNotificationPermissionCard,
  resolveMacNotificationPermissionState
} from '../notifications/mac-notification-permission-card'

function createSettings(
  notificationOverrides: Partial<GlobalSettings['notifications']> = {}
): GlobalSettings {
  return {
    notifications: {
      enabled: true,
      agentTaskComplete: true,
      terminalBell: true,
      suppressWhenFocused: true,
      customSoundId: 'system',
      customSoundPath: null,
      customSoundVolume: 80,
      ...notificationOverrides
    }
  } as GlobalSettings
}

describe('NotificationStep', () => {
  const previousBuildProfile = globalThis.__ORCA_BUILD_PROFILE__

  beforeEach(() => {
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  afterEach(() => {
    if (previousBuildProfile === undefined) {
      delete globalThis.__ORCA_BUILD_PROFILE__
    } else {
      globalThis.__ORCA_BUILD_PROFILE__ = previousBuildProfile
    }
  })

  it('renders sound setup without the old notification source switches', () => {
    const html = renderToStaticMarkup(
      <NotificationStep settings={createSettings()} updateSettings={vi.fn()} />
    )

    expect(html).toContain('Notification Sound')
    expect(html).toContain('role="combobox"')
    expect(html).toContain('Send Test Notification')
    expect(html).not.toContain('aria-pressed')
    expect(html).not.toContain('Agent task complete')
    expect(html).not.toContain('Terminal bell')
    expect(html).not.toContain('Set up agent features')
    expect(html).not.toContain('Connect task sources')
  })

  it('keeps default notification setup product copy on Orca', () => {
    const stepHtml = renderToStaticMarkup(
      <NotificationStep settings={createSettings()} updateSettings={vi.fn()} />
    )
    const permissionHtml = renderToStaticMarkup(
      <MacNotificationPermissionCard state="awaiting-permission" />
    )
    const blockedHtml = renderToStaticMarkup(<MacNotificationPermissionCard state="blocked" />)

    expect(stepHtml).toContain(
      'Pick the alert Orca plays after a desktop notification is delivered.'
    )
    expect(permissionHtml).toContain('Allow notifications for Orca')
    expect(blockedHtml).toContain('macOS is not delivering Orca notifications')
    expect(blockedHtml).toContain('Turn on Allow notifications for Orca in System Settings.')
  })

  it('uses the corporate product name in notification setup product copy', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    const stepHtml = renderToStaticMarkup(
      <NotificationStep settings={createSettings()} updateSettings={vi.fn()} />
    )
    const permissionHtml = renderToStaticMarkup(
      <MacNotificationPermissionCard state="awaiting-permission" />
    )
    const blockedHtml = renderToStaticMarkup(<MacNotificationPermissionCard state="blocked" />)

    expect(stepHtml).toContain(
      'Pick the alert Secure Orca Lite plays after a desktop notification is delivered.'
    )
    expect(permissionHtml).toContain('Allow notifications for Secure Orca Lite')
    expect(blockedHtml).toContain('macOS is not delivering Secure Orca Lite notifications')
    expect(blockedHtml).toContain(
      'Turn on Allow notifications for Secure Orca Lite in System Settings.'
    )
    expect(permissionHtml).not.toContain('for Orca')
    expect(blockedHtml).not.toContain('delivering Orca notifications')
  })

  it('does not render an onboarding volume slider for non-system sounds', () => {
    const html = renderToStaticMarkup(
      <NotificationStep
        settings={createSettings({ customSoundId: 'two-tone' })}
        updateSettings={vi.fn()}
      />
    )

    expect(html).not.toContain('Notification sound volume')
    expect(html).not.toContain('80%')
  })

  it('does not render a macOS permission card before the delivery probe resolves', () => {
    const html = renderToStaticMarkup(
      <NotificationStep settings={createSettings()} updateSettings={vi.fn()} />
    )

    expect(html).not.toContain('Open System Settings')
    expect(html).not.toContain('Notifications are enabled')
  })
})

describe('resolveMacNotificationPermissionState', () => {
  it('hides the card when notifications are unsupported', () => {
    expect(resolveMacNotificationPermissionState('unsupported', false)).toBeNull()
    expect(resolveMacNotificationPermissionState('unsupported', true)).toBeNull()
  })

  it('maps delivered probes to enabled', () => {
    expect(resolveMacNotificationPermissionState('delivered', false)).toBe('enabled')
    expect(resolveMacNotificationPermissionState('delivered', true)).toBe('enabled')
  })

  it('maps a pending authorization decision to the awaiting card', () => {
    expect(resolveMacNotificationPermissionState('awaiting-decision', false)).toBe(
      'awaiting-permission'
    )
    expect(resolveMacNotificationPermissionState('awaiting-decision', true)).toBe(
      'awaiting-permission'
    )
  })

  it('treats a first-ever rejection as an unanswered permission dialog', () => {
    expect(resolveMacNotificationPermissionState('blocked', false)).toBe('awaiting-permission')
  })

  it('treats a rejection after a prior prompt as blocked', () => {
    expect(resolveMacNotificationPermissionState('blocked', true)).toBe('blocked')
  })
})
