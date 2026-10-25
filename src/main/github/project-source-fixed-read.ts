import { ProjectSourceNativeGhError } from '../git/command-runner/project-source-native-gh'

export type MainNativeFixedReadRequest = Readonly<{
  operation: 'repositoryRegistration' | 'selectedPrRead'
  query: string
  variables: Readonly<Record<string, string | number>>
  deadlineMs: number
  signal: AbortSignal
}>
export type MainNativeFixedReadExecutor = (request: MainNativeFixedReadRequest) => Promise<string>

/** An injected offline source cannot extend Main's deadline by ignoring cancellation. */
export async function executeMainFixedRead(
  request: MainNativeFixedReadRequest,
  execute: MainNativeFixedReadExecutor
): Promise<string> {
  if (request.signal.aborted || Date.now() >= request.deadlineMs) {
    throw new ProjectSourceNativeGhError(request.signal.aborted ? 'ABORTED' : 'DEADLINE')
  }
  const pending = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: () => void = () => undefined
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => {
      pending.abort()
      reject(new ProjectSourceNativeGhError('ABORTED'))
    }
    request.signal.addEventListener('abort', abort, { once: true })
    timer = setTimeout(
      () => {
        pending.abort()
        reject(new ProjectSourceNativeGhError('DEADLINE'))
      },
      Math.max(0, request.deadlineMs - Date.now())
    )
  })
  try {
    if (request.signal.aborted) {
      abort()
      return await cancelled
    }
    return await Promise.race([
      execute(Object.freeze({ ...request, signal: pending.signal })),
      cancelled
    ])
  } finally {
    clearTimeout(timer)
    request.signal.removeEventListener('abort', abort)
  }
}
