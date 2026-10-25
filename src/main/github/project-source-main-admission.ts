import {
  SOURCE_LIFECYCLE_DOMAINS,
  SOURCE_READINESS_GATES,
  type MainSelectedPrCompositionOptions
} from './project-source-composition-contract'

export type MainSourceOperationAdmission = Pick<
  MainSelectedPrCompositionOptions,
  'readiness' | 'lifecycle'
>

/** Capture the reviewed producers once; a replaced options object cannot grant admission. */
export class MainProjectSourceAdmission {
  private readonly cleanup: (() => void)[] = []
  private readonly listeners = new Set<() => void>()
  private available = false
  private epoch = 0
  private checking = false
  readonly readiness: MainSelectedPrCompositionOptions['readiness']
  readonly lifecycle: MainSelectedPrCompositionOptions['lifecycle']

  constructor(
    enabled: boolean,
    options: MainSourceOperationAdmission | undefined,
    retire: () => void
  ) {
    this.readiness = Object.freeze({ ...options?.readiness })
    this.lifecycle = Object.freeze(
      Object.fromEntries(
        SOURCE_LIFECYCLE_DOMAINS.map((domain) => [
          domain,
          (listener: () => void) => this.subscribeChanges(listener)
        ])
      )
    )
    if (
      !enabled ||
      !options ||
      SOURCE_READINESS_GATES.some((gate) => typeof this.readiness?.[gate] !== 'function') ||
      SOURCE_LIFECYCLE_DOMAINS.some((domain) => typeof options.lifecycle?.[domain] !== 'function')
    ) {
      return
    }
    const epoch = this.epoch
    try {
      for (const domain of SOURCE_LIFECYCLE_DOMAINS) {
        const unsubscribe = options.lifecycle![domain]!(() => {
          this.epoch++
          retire()
          this.listeners.forEach((listener) => listener())
        })
        if (typeof unsubscribe !== 'function') {
          throw new Error('SOURCE_UNAVAILABLE')
        }
        this.cleanup.push(unsubscribe)
        if (this.epoch !== epoch) {
          throw new Error('SOURCE_UNAVAILABLE')
        }
      }
      this.available = true
    } catch {
      this.dispose()
    }
  }

  readonly subscribeChanges = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  ready(): boolean {
    if (!this.available || this.checking) {
      return false
    }
    this.checking = true
    const epoch = this.epoch
    try {
      return (
        SOURCE_READINESS_GATES.every(
          (gate) => this.available && this.epoch === epoch && this.readiness?.[gate]?.() === true
        ) &&
        this.available &&
        this.epoch === epoch
      )
    } catch {
      return false
    } finally {
      this.checking = false
    }
  }

  dispose(): void {
    this.available = false
    this.epoch++
    for (const unsubscribe of this.cleanup.splice(0)) {
      try {
        unsubscribe()
      } catch {
        /* Retire every producer independently. */
      }
    }
    this.listeners.clear()
  }
}
