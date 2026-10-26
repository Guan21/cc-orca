import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const EXPECTED_SYNTHETIC_TESTS = 4

/**
 * Fail closed: a successful CLI process alone does not prove every assertion passed.
 */
export function validateSmokeResults(result) {
  const stats = result?.results?.stats
  const successes = stats?.successes
  const failures = stats?.failures
  const errors = stats?.errors ?? 0
  if (
    !Number.isInteger(successes) ||
    !Number.isInteger(failures) ||
    !Number.isInteger(errors) ||
    successes !== EXPECTED_SYNTHETIC_TESTS ||
    failures !== 0 ||
    errors !== 0
  ) {
    throw new Error(
      `promptfoo smoke rejected: expected exactly ${EXPECTED_SYNTHETIC_TESTS} passes and no failures/errors; got ${JSON.stringify(stats ?? null)}`
    )
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const path = resolve('evals/promptfoo/out/results.json')
  const result = JSON.parse(await readFile(path, 'utf8'))
  validateSmokeResults(result)
  process.stdout.write(`promptfoo synthetic smoke: ${EXPECTED_SYNTHETIC_TESTS} / ${EXPECTED_SYNTHETIC_TESTS} passed\n`)
}
