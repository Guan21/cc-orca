import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

// Published upstream artifacts, pinned independently of mutable tag names.
export const PINNED_WIRE_RELEASES = [
  {
    tag: 'v1.4.184',
    object: '284a244a12dfe266f62c103cc6b1b1d13203e0b4',
    commit: '2307f2ebbe1c1e737c0b12d920bb0a208332db2c'
  },
  {
    tag: 'v1.4.190',
    object: '43268cadff07d513a73181741090ece06a364fd6',
    commit: '6e4f817101daa18d82824b69243d9079baa9c416'
  },
  {
    tag: 'v1.4.197',
    object: '9a94a4e2d6849aba4795278f1b1bcc4ad88ecd2e',
    commit: '5ee4ace516080891731d100f843b074408a9ce0e'
  }
]
const UPSTREAM = 'https://github.com/stablyai/orca.git'

function assertRelease(git, release, object) {
  const commit = git(['rev-parse', '--verify', `refs/tags/${release.tag}^{commit}`])
  if (object !== release.object || commit !== release.commit) {
    throw new Error(
      `Wire release provenance mismatch for ${release.tag}: expected ${release.object} / ${release.commit}, got ${object} / ${commit}`
    )
  }
}

export function prepareWireReleaseRefs(
  git = (args) =>
    execFileSync('git', args, {
      cwd: resolve(import.meta.dirname, '../..'),
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim()
) {
  const missing = []
  for (const release of PINNED_WIRE_RELEASES) {
    let object
    try {
      object = git(['show-ref', '--verify', '--hash', `refs/tags/${release.tag}`])
    } catch {
      missing.push(release)
      continue
    }
    assertRelease(git, release, object)
  }
  if (missing.length > 0) {
    git([
      'fetch',
      '--no-tags',
      UPSTREAM,
      ...missing.map(({ tag }) => `refs/tags/${tag}:refs/tags/${tag}`)
    ])
  }
  for (const release of PINNED_WIRE_RELEASES) {
    assertRelease(git, release, git(['show-ref', '--verify', '--hash', `refs/tags/${release.tag}`]))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  prepareWireReleaseRefs()
  console.log(
    `Verified wire release refs: ${PINNED_WIRE_RELEASES.map(({ tag }) => tag).join(', ')}`
  )
}
