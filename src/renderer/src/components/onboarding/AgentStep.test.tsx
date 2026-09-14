import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AGENT_CATALOG } from '@/lib/agent-catalog'
import { AgentStep } from './AgentStep'
import { TooltipProvider } from '@/components/ui/tooltip'

describe('AgentStep', () => {
  afterEach(() => {
    delete globalThis.__ORCA_BUILD_PROFILE__
  })

  it('shows the collapsed fallback agents summary', () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AgentStep
          selectedAgent={null}
          onSelect={vi.fn()}
          detectedSet={new Set([AGENT_CATALOG[0].id])}
          isDetecting={false}
          yoloPermissions
          onYoloPermissionsChange={vi.fn()}
        />
      </TooltipProvider>
    )

    expect(html).toContain(`Show ${AGENT_CATALOG.length - 1} more agents→`)
    expect(html).toContain('data-agent-grid-scroll')
    expect(html).toContain('data-slot="checkbox"')
    expect(html).toContain('Yolo / Dangerously skip permissions')
    expect(html).not.toContain('role="radiogroup"')
  })

  it('shows only corporate-supported agents and hides yolo controls in corporate builds', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AgentStep
          selectedAgent={null}
          onSelect={vi.fn()}
          detectedSet={new Set(['claude', 'codex', 'gemini'])}
          isDetecting={false}
          yoloPermissions
          onYoloPermissionsChange={vi.fn()}
        />
      </TooltipProvider>
    )

    expect(html).toContain('Claude Code')
    expect(html).toContain('Codex')
    expect(html).not.toContain('Gemini')
    expect(html).not.toContain('Yolo')
    expect(html).not.toContain('Dangerously skip permissions')
  })

  it('describes missing corporate agents as externally managed tools', () => {
    globalThis.__ORCA_BUILD_PROFILE__ = 'corporate'

    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AgentStep
          selectedAgent="claude"
          onSelect={vi.fn()}
          detectedSet={new Set(['codex'])}
          isDetecting={false}
          yoloPermissions
          onYoloPermissionsChange={vi.fn()}
        />
      </TooltipProvider>
    )

    expect(html).toContain(
      "Claude Code</span> isn&#x27;t available on your PATH yet. Install or configure it on this workstation, then retry detection."
    )
    expect(html).not.toContain('will set it as your default')
    expect(html).not.toContain('install it any time')
  })

  it('labels the fallback agents summary as hide when expanded', () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AgentStep
          selectedAgent={AGENT_CATALOG[1].id}
          onSelect={vi.fn()}
          detectedSet={new Set([AGENT_CATALOG[0].id])}
          isDetecting={false}
          yoloPermissions
          onYoloPermissionsChange={vi.fn()}
        />
      </TooltipProvider>
    )

    expect(html).toContain('Hide agents')
    expect(html).not.toContain(`Show ${AGENT_CATALOG.length - 1} more agents→`)
  })
})
