import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { KEYBINDING_DEFINITIONS } from '../../../../shared/keybindings'
import { i18n } from '@/i18n/i18n'
import { useAppStore } from '../../store'
import { WorktreeVisibilitySourceAddForm } from '../sidebar/WorktreeVisibilitySourceAddForm'
import { GeneralEditorSettingsSection } from './GeneralEditorSettingsSection'
import { KeybindingsFileActions } from './KeybindingsFileActions'
import { getGeneralEditorSearchEntries } from './general-editor-search'
import { getTerminalShortcutPolicySearchEntry } from './shortcuts-search'
import { getShortcutTerminalStatus } from './shortcut-terminal-status'
import { ShortcutTerminalPolicyControl } from './ShortcutTerminalPolicyControl'

vi.mock('@/i18n/localized-catalog', () => ({
  createLocalizedCatalog: <T,>(loader: () => T) => loader
}))

vi.mock('../ui/select', () => {
  const Content = ({ children }: { children?: ReactNode }) => <>{children}</>
  return {
    Select: Content,
    SelectContent: Content,
    SelectItem: Content,
    SelectTrigger: Content,
    SelectValue: Content
  }
})

describe.each(['default', 'corporate'] as const)('final visible branding: %s', (profile) => {
  beforeEach(async () => {
    globalThis.__ORCA_BUILD_PROFILE__ = profile
    await i18n.changeLanguage('en')
    useAppStore.setState({ settingsSearchQuery: '' })
  })

  afterEach(() => {
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  it('renders the worktree root description', () => {
    const markup = renderToStaticMarkup(
      <WorktreeVisibilitySourceAddForm disabled={false} onAdd={async () => 'added'} />
    )
    expect(markup).toContain('DevCrew will recognize worktrees beneath this folder.')
    expect(markup).not.toContain('Orca will recognize worktrees')
  })

  it('renders editor descriptions and indexes the same auto-save wording', () => {
    const markup = renderToStaticMarkup(
      <GeneralEditorSettingsSection
        settings={getDefaultSettings('/tmp')}
        updateSettings={vi.fn()}
        fontSuggestions={[]}
      />
    )
    expect(markup).toContain('Configure how DevCrew persists file edits.')
    const description = 'How long DevCrew waits after your last edit before saving automatically.'
    expect(markup).toContain(`${description} First launch defaults to`)
    expect(
      getGeneralEditorSearchEntries().find((entry) => entry.title === 'Auto Save Delay')
        ?.description
    ).toBe(description)
    expect(markup).not.toContain('How long to wait after your last edit')
  })

  it('renders the action that opens the built-in editor', () => {
    const markup = renderToStaticMarkup(<KeybindingsFileActions />)
    expect(markup).toContain('Edit File in DevCrew')
    expect(markup).not.toContain('Edit File in Orca')
  })

  it('describes application priority without changing the policy identifier', () => {
    const markup = renderToStaticMarkup(
      <ShortcutTerminalPolicyControl terminalShortcutPolicy="orca-first" updateSettings={vi.fn()} />
    )
    expect(markup).toContain('DevCrew first')
    const definition = KEYBINDING_DEFINITIONS.find(
      (item) => getShortcutTerminalStatus(item, 'orca-first', true)?.label === 'DevCrew first'
    )
    expect(definition).toBeDefined()
    expect(getShortcutTerminalStatus(definition!, 'terminal-first', true)?.label).toBe(
      'Terminal first'
    )
    const entry = getTerminalShortcutPolicySearchEntry()
    expect(entry.description).toBe(
      profile === 'corporate'
        ? 'Choose whether DevCrew or the focused terminal wins when shortcuts overlap.'
        : 'Choose whether DevCrew or the focused terminal wins when shortcuts overlap.'
    )
    expect(entry.keywords).toContain('devcrew first')
  })
})
