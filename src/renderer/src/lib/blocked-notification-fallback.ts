import { toast } from 'sonner'
import { getProductDisplayName } from '../../../shared/product-display-name'
import { translate } from '@/i18n/i18n'

// Why: agent completions can dispatch in bursts; one in-app pointer at the
// broken OS setting per session teaches the fix without nagging.
let shownThisSession = false

/**
 * In-app stand-in for a native notification that macOS silently swallowed
 * (dispatch returned 'blocked-by-system'): tells the user notifications are
 * off at the OS level and deep-links to the app's System Settings pane.
 */
export function showBlockedNotificationFallbackToast(): void {
  if (shownThisSession) {
    return
  }
  shownThisSession = true
  const productName = getProductDisplayName()
  toast.warning(
    translate(
      'auto.lib.blocked.notification.fallback.de50bef680',
      'macOS is blocking {{productName}} notifications',
      { productName }
    ),
    {
      description: translate(
        'auto.components.onboarding.mac.notification.permission.card.721d2bedb6',
        'Turn on Allow notifications for {{productName}} in System Settings.',
        { productName }
      ),
      action: {
        label: translate(
          'auto.components.onboarding.NotificationStep.4f6a1da718',
          'Open System Settings'
        ),
        onClick: () => {
          void window.api.notifications.openSystemSettings()
        }
      }
    }
  )
}
