import type { Session } from 'electron'
import { getProxySessionApplicationReadiness } from './proxy-settings'
import { observeCorporateRuntimeEgressRendererRequest } from './corporate-runtime-egress-installation'

/** Hold default-session requests until the newest app-wide proxy transition settles. */
export function installElectronProxyRequestGuard(proxySession: Session): void {
  proxySession.webRequest.onBeforeRequest((details, callback) => {
    const egressBlocked = observeCorporateRuntimeEgressRendererRequest(details.url)
    const readiness = getProxySessionApplicationReadiness(proxySession)
    const answer = (ready: boolean): void =>
      callback(ready && !egressBlocked ? {} : { cancel: true })
    if (typeof readiness === 'boolean') {
      answer(readiness)
    } else {
      void readiness.then(answer)
    }
  })
}
