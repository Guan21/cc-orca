import { afterEach, describe, expect, it } from 'vitest'
import { commandTemplateStateLabel } from './repository-source-control-ai-labels'

afterEach(() => {
  delete globalThis.__ORCA_BUILD_PROFILE__
})

describe('repository Source Control AI labels', () => {
  it('uses corporate product wording for inherited default prompts', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    expect(
      commandTemplateStateLabel({
        actionId: 'commitMessage',
        hasOverride: false,
        inheritedTemplate: '{basePrompt}'
      })
    ).toBe('Secure Orca Lite default prompt')
  })

  it('keeps default Orca wording outside corporate builds', () => {
    expect(
      commandTemplateStateLabel({
        actionId: 'commitMessage',
        hasOverride: false,
        inheritedTemplate: '{basePrompt}'
      })
    ).toBe('Orca default prompt')
  })
})
