import { afterEach, describe, expect, it } from 'vitest'
import { docPreviewAssetNotice, docPreviewFailureDetail } from './doc-preview-failure-messages'

describe('document preview failure copy', () => {
  afterEach(() => {
    delete (globalThis as { __ORCA_BUILD_PROFILE__?: unknown }).__ORCA_BUILD_PROFILE__
  })

  it('preserves default DevCrew wording', () => {
    expect(docPreviewFailureDetail('unreadable')).toBe(
      'DevCrew could not read this file from the workspace.'
    )
    expect(
      docPreviewAssetNotice([
        { grantId: 'grant-1', relativePath: 'image.png', reason: 'unreadable' }
      ])
    ).toBe('DevCrew could not read image.png from the workspace.')
  })

  it('uses the corporate product name', () => {
    ;(globalThis as { __ORCA_BUILD_PROFILE__?: 'corporate' }).__ORCA_BUILD_PROFILE__ = 'corporate'

    expect(docPreviewFailureDetail('unreadable')).toBe(
      'DevCrew could not read this file from the workspace.'
    )
    expect(
      docPreviewAssetNotice([
        { grantId: 'grant-1', relativePath: 'image.png', reason: 'unreadable' }
      ])
    ).toBe('DevCrew could not read image.png from the workspace.')
  })
})
