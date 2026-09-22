import { afterEach, describe, expect, it } from 'vitest'
import { listBoundAgentTabActions, resolveDefaultAgentForNewTab } from './agent-tab-shortcuts'

describe('listBoundAgentTabActions', () => {
  afterEach(() => {
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  it('returns only agents whose per-agent action has a user-assigned chord', () => {
    expect(
      listBoundAgentTabActions(
        {
          'tab.newAgent.claude': ['Mod+Alt+Shift+C'],
          'tab.newAgent.codex': [],
          'tab.newTerminal': ['Mod+T']
        },
        []
      )
    ).toEqual([{ agent: 'claude', actionId: 'tab.newAgent.claude' }])
  })

  it('skips disabled agents even when their action is bound', () => {
    expect(
      listBoundAgentTabActions(
        {
          'tab.newAgent.claude': ['Mod+Alt+Shift+C'],
          'tab.newAgent.codex': ['Mod+Alt+Shift+X']
        },
        ['claude']
      )
    ).toEqual([{ agent: 'codex', actionId: 'tab.newAgent.codex' }])
  })

  it('skips corporate-disallowed agents even when their action is bound', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    expect(
      listBoundAgentTabActions(
        {
          'tab.newAgent.claude': ['Mod+Alt+Shift+C'],
          'tab.newAgent.codex': ['Mod+Alt+Shift+X'],
          'tab.newAgent.gemini': ['Mod+Alt+Shift+G'],
          'tab.newAgent.opencode': ['Mod+Alt+Shift+O'],
          'tab.newAgent.grok': ['Mod+Alt+Shift+R']
        },
        []
      )
    ).toEqual([
      { agent: 'claude', actionId: 'tab.newAgent.claude' },
      { agent: 'codex', actionId: 'tab.newAgent.codex' }
    ])
  })

  it('returns nothing without overrides', () => {
    expect(listBoundAgentTabActions(undefined, [])).toEqual([])
    expect(listBoundAgentTabActions({}, null)).toEqual([])
  })
})

describe('resolveDefaultAgentForNewTab', () => {
  afterEach(() => {
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  it('prefers the configured default agent when detected and enabled', () => {
    expect(
      resolveDefaultAgentForNewTab({
        defaultTuiAgent: 'codex',
        detectedAgentIds: ['claude', 'codex'],
        disabledTuiAgents: []
      })
    ).toBe('codex')
  })

  it('falls back to the auto-pick order when the default is blank', () => {
    // Why: 'blank' configures agent-less new workspaces, but an explicit
    // new-agent-tab chord still wants an agent.
    expect(
      resolveDefaultAgentForNewTab({
        defaultTuiAgent: 'blank',
        detectedAgentIds: ['codex', 'claude'],
        disabledTuiAgents: []
      })
    ).toBe('claude')
  })

  it('skips disabled agents and returns null when nothing is launchable', () => {
    expect(
      resolveDefaultAgentForNewTab({
        defaultTuiAgent: 'claude',
        detectedAgentIds: ['claude'],
        disabledTuiAgents: ['claude']
      })
    ).toBeNull()
    expect(
      resolveDefaultAgentForNewTab({
        defaultTuiAgent: null,
        detectedAgentIds: null,
        disabledTuiAgents: []
      })
    ).toBeNull()
  })

  it('does not resolve a corporate-disallowed default or fallback agent', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    expect(
      resolveDefaultAgentForNewTab({
        defaultTuiAgent: 'gemini',
        detectedAgentIds: ['gemini', 'opencode'],
        disabledTuiAgents: []
      })
    ).toBeNull()
  })
})
