/**
 * #191 G2-C3: inert Preload receiver seam. Not imported/installed by preload
 * index or the public projectSource bridge. It never authorizes a Main operation.
 */
import {
  readSelectedPrViewClear,
  readSelectedPrViewFacts,
  type SelectedPrViewFacts
} from '../shared/github/project-source-renderer-view-contract'

const FACT_CHANNEL = 'devCrew:privateSelectedPrFacts:v1'
const CLEAR_CHANNEL = 'devCrew:clearPrivateSelectedPrFacts:v1'

type Listener = (event: unknown, payload: unknown) => void
type IpcEvents = {
  on(channel: string, listener: Listener): unknown
  removeListener(channel: string, listener: Listener): unknown
}
type Options = Readonly<{
  enabled?: boolean
  nowMs?(): number
  onFacts(message: SelectedPrViewFacts): void
  onClear(): void
}>

/** Ordered Main IPC event relay with no dynamic channels or raw event exposure. */
export function installSelectedPrPreloadReceiver(ipc: IpcEvents, options: Options): () => void {
  if (options.enabled !== true) {
    return () => undefined
  }
  let retired = false
  let deliveredRevision = -1
  let clearedRevision = -1
  let notifying = false
  const clear = (): void => {
    if (notifying) return
    notifying = true
    try {
      options.onClear()
    } catch {
      // Do not expose a raw exception or revive stale facts.
    } finally {
      notifying = false
    }
  }
  const remove = (): void => {
    try { ipc.removeListener(FACT_CHANNEL, onFacts) } catch { /* fail closed */ }
    try { ipc.removeListener(CLEAR_CHANNEL, onClear) } catch { /* fail closed */ }
  }
  const retire = (): void => {
    if (retired) return
    retired = true
    remove()
    clear()
  }
  const onFacts: Listener = (_event, raw) => {
    if (retired || notifying) return
    const message = readSelectedPrViewFacts(raw, (options.nowMs ?? Date.now)())
    if (!message) {
      retire()
      return
    }
    if (message.revision <= deliveredRevision || message.revision <= clearedRevision) return
    deliveredRevision = message.revision
    try {
      options.onFacts(message)
    } catch {
      retire()
    }
  }
  const onClear: Listener = (_event, raw) => {
    if (retired) return
    const message = readSelectedPrViewClear(raw)
    if (!message) {
      retire()
      return
    }
    if (message.revision < deliveredRevision || message.revision <= clearedRevision) return
    clearedRevision = message.revision
    clear()
  }
  try {
    ipc.on(FACT_CHANNEL, onFacts)
    ipc.on(CLEAR_CHANNEL, onClear)
  } catch {
    retire()
  }
  return retire
}
