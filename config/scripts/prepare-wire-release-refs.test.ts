import { describe, expect, it, vi } from 'vitest'
import { PINNED_WIRE_RELEASES, prepareWireReleaseRefs } from './prepare-wire-release-refs.mjs'

describe('wire release provenance', () => {
  function gitFixture() {
    const refs = new Map<string, string>()
    const git = vi.fn((args: string[]) => {
      if (args[0] === 'fetch') {
        for (const release of PINNED_WIRE_RELEASES) {
          refs.set(`refs/tags/${release.tag}`, release.object)
          refs.set(`refs/tags/${release.tag}^{commit}`, release.commit)
        }
        return ''
      }
      const ref = args.at(-1)!
      if (!refs.has(ref)) {
        throw new Error('missing ref')
      }
      return refs.get(ref)!
    })
    return { refs, git }
  }

  it('fetches only fixed upstream tags when the fork has none', () => {
    const { git } = gitFixture()
    prepareWireReleaseRefs(git)
    const fetch = git.mock.calls.find(([args]) => args[0] === 'fetch')![0]
    expect(fetch).toEqual([
      'fetch',
      '--no-tags',
      'https://github.com/stablyai/orca.git',
      ...PINNED_WIRE_RELEASES.map(({ tag }) => `refs/tags/${tag}:refs/tags/${tag}`)
    ])
  })

  it('fetches only missing tags and preserves available verified releases', () => {
    const { refs, git } = gitFixture()
    const release = PINNED_WIRE_RELEASES[0]
    refs.set(`refs/tags/${release.tag}`, release.object)
    refs.set(`refs/tags/${release.tag}^{commit}`, release.commit)
    prepareWireReleaseRefs(git)
    const fetch = git.mock.calls.find(([args]) => args[0] === 'fetch')![0]
    expect(fetch.slice(3)).toEqual(
      PINNED_WIRE_RELEASES.slice(1).map(({ tag }) => `refs/tags/${tag}:refs/tags/${tag}`)
    )
  })

  it('surfaces network failure instead of skipping compatibility tests', () => {
    expect(() =>
      prepareWireReleaseRefs((args: string[]) => {
        if (args[0] === 'fetch') {
          throw new Error('fetch failed')
        }
        throw new Error('missing ref')
      })
    ).toThrow('fetch failed')
  })
  it('does not fetch when all exact tag objects and commits are available', () => {
    const { git } = gitFixture()
    prepareWireReleaseRefs(git)
    git.mockClear()
    prepareWireReleaseRefs(git)
    expect(git.mock.calls.some(([args]) => args[0] === 'fetch')).toBe(false)
  })

  it.each(['object', 'commit'] as const)(
    'rejects a mismatched %s without overwriting it',
    (field) => {
      const { refs, git } = gitFixture()
      prepareWireReleaseRefs(git)
      git.mockClear()
      const release = PINNED_WIRE_RELEASES[0]
      refs.set(`refs/tags/${release.tag}${field === 'commit' ? '^{commit}' : ''}`, '0'.repeat(40))
      expect(() => prepareWireReleaseRefs(git)).toThrow(/provenance mismatch/)
      expect(git.mock.calls.some(([args]) => args[0] === 'fetch')).toBe(false)
    }
  )

  it('fails closed when the fetched tag identity changes', () => {
    let fetched = false
    expect(() =>
      prepareWireReleaseRefs((args: string[]) => {
        if (args[0] === 'fetch') {
          fetched = true
          return ''
        }
        if (!fetched) {
          throw new Error('missing')
        }
        return '0'.repeat(40)
      })
    ).toThrow(/provenance mismatch/)
  })
})
