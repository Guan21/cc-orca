const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { _electron: electron } = require(process.argv[4])

const executablePath = process.argv[2]
const output = process.argv[3]
const log = path.join(output, 'renderer-egress.jsonl')
fs.mkdirSync(output, { recursive: true })
function save(name, value) {
  fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2))
}
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      key !== 'ELECTRON_RUN_AS_NODE' &&
      key !== 'ELECTRON_RENDERER_URL' &&
      key !== 'ORCA_BYPASS_SINGLE_INSTANCE_LOCK' &&
      !key.startsWith('ORCA_E2E_')
  )
)
let app
let page
let scenario = 'startup'
const requests = []
const failures = []
const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' })
  response.end('issue-126-loopback-sentinel')
})
async function main() {
  save('probe-status.json', { phase: 'launching', timeoutMs: 300000 })
  app = await electron.launch({
    executablePath,
    args: [],
    chromiumSandbox: true,
    timeout: 300000,
    env: {
      ...cleanEnv,
      ORCA_BACKGROUND_LAUNCH: '1',
      NODE_ENV: 'production',
      ORCA_STARTUP_DIAGNOSTICS: '1',
      ORCA_CORPORATE_RUNTIME_EGRESS_LOG_PATH: log
    }
  })
  save('probe-status.json', { phase: 'connected' })
  page = await app.firstWindow({ timeout: 180000 })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  cdp.on('Network.requestWillBeSent', (event) => {
    const url = new URL(event.request.url)
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
      return
    }
    requests.push({
      scenario,
      requestId: event.requestId,
      scheme: url.protocol.slice(0, -1),
      hostname: url.hostname,
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      resourceType: event.type,
      loopback: ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    })
  })
  cdp.on('Network.loadingFailed', (event) =>
    failures.push({ requestId: event.requestId, error: event.errorText })
  )
  cdp.on('Network.webSocketCreated', (event) => {
    const url = new URL(event.url)
    requests.push({
      scenario,
      requestId: event.requestId,
      scheme: url.protocol.slice(0, -1),
      hostname: url.hostname,
      port: Number(url.port || (url.protocol === 'wss:' ? 443 : 80)),
      resourceType: 'WebSocket',
      loopback: ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    })
  })
  await page.waitForFunction(() => document.body?.innerText.trim().length > 30, undefined, {
    timeout: 180000
  })
  const windows = await app.evaluate(({ app, BrowserWindow }) => ({
    packaged: app.isPackaged,
    visibleWindows: BrowserWindow.getAllWindows().filter((win) => win.isVisible()).length,
    observerActive: typeof globalThis.__orcaCorporateRuntimeEgressRecord === 'function',
    background: process.env.ORCA_BACKGROUND_LAUNCH,
    security: BrowserWindow.getAllWindows().map((win) => {
      const preferences = win.webContents.getLastWebPreferences()
      return {
        sandbox: preferences.sandbox,
        contextIsolation: preferences.contextIsolation,
        nodeIntegration: preferences.nodeIntegration
      }
    })
  }))
  save('launch.json', windows)
  if (!windows.packaged || windows.visibleWindows || !windows.observerActive) {
    throw new Error('Installed hidden observer launch prerequisite failed')
  }
  if (
    windows.security.some(
      (settings) => !settings.sandbox || !settings.contextIsolation || settings.nodeIntegration
    )
  ) {
    throw new Error('Corporate renderer security preferences changed')
  }
  async function snapshot(label) {
    save(
      `${label}.json`,
      await page.evaluate(() => ({
        controls: [...document.querySelectorAll('button')]
          .filter((el) => el.getClientRects().length)
          .map((el) => ({
            label: el.getAttribute('aria-label'),
            text: el.innerText.slice(0, 80)
          })),
        settings: document.body.innerText.includes('Open In Apps'),
        externalImages: [...document.images]
          .filter((img) => /^https?:/.test(img.currentSrc || img.src))
          .map((img) => new URL(img.currentSrc || img.src).hostname)
      }))
    )
    const snapshotData = JSON.parse(fs.readFileSync(path.join(output, `${label}.json`), 'utf8'))
    if (snapshotData.externalImages.length) {
      throw new Error('Remote image resource present in renderer snapshot')
    }
    await page
      .screenshot({
        path: path.join(output, `${label}.png`),
        timeout: 15000,
        mask: [
          page.locator('.xterm-screen'),
          page.locator('.editor-header-path'),
          page.getByText(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|[A-Z]:[\\/]Users[\\/]/)
        ]
      })
      .catch((error) => {
        const timedOut = error.name === 'TimeoutError'
        save(`${label}-screenshot-status.json`, {
          status: timedOut ? 'BLOCKED' : 'FAIL',
          reason: timedOut
            ? 'Hidden renderer screenshot timed out; DOM and request observation continue'
            : 'Hidden renderer screenshot failed'
        })
        if (!timedOut) {
          throw error
        }
      })
  }
  await snapshot('startup')
  const closeProjectMap = page.getByRole('button', {
    name: 'Close DevCrew Project Map',
    exact: true
  })
  if (await closeProjectMap.count()) {
    await closeProjectMap.click({ timeout: 30000 })
  }
  const backToApp = page.getByRole('button', { name: 'Back to app', exact: true })
  if (await backToApp.count()) {
    await backToApp.click({ timeout: 30000 })
  }
  const scopeStarted = Date.now()
  for (let cycle = 1; cycle <= 2; cycle++) {
    scenario = `settings-${cycle}`
    await app.evaluate(() => globalThis.__orcaCorporateRuntimeEgressSetScenario?.('open-settings'))
    await page.getByRole('button', { name: 'Settings', exact: true }).click({ timeout: 30000 })
    await page
      .getByRole('button', { name: 'General', exact: true })
      .first()
      .click({ timeout: 30000 })
    await page.getByText('Open In Apps', { exact: true }).waitFor({ timeout: 30000 })
    await page.getByText('VS Code', { exact: true }).first().waitFor({ timeout: 30000 })
    if (
      cycle === 2 &&
      (await page.getByText('Issue 126 unsaved icon fixture', { exact: true }).count())
    ) {
      throw new Error('Temporary custom draft unexpectedly persisted')
    }
    await snapshot(`settings-${cycle}`)
    if (cycle === 1) {
      await page.getByRole('button', { name: 'Add app', exact: true }).click()
      const presets = await page.getByRole('menuitem').allTextContents()
      const glyphs = await page.getByRole('menuitem').locator('svg').count()
      save('preset-menu-icons.json', { entries: presets, glyphs })
      if (!presets.some((label) => label.includes('VS Code')) || glyphs < presets.length) {
        throw new Error('Preset icon menu not exercised')
      }
      await snapshot('preset-menu')
      await page.getByRole('menuitem', { name: 'Custom app', exact: true }).click()
      await page
        .getByPlaceholder('App name', { exact: true })
        .fill('Issue 126 unsaved icon fixture')
      await snapshot('custom-draft')
      // Empty command prevents this temporary custom draft from reaching persisted settings.
    }
    await new Promise((resolve) => setTimeout(resolve, 30000))
    await page.getByRole('button', { name: 'Back to app', exact: true }).click({ timeout: 30000 })
    await snapshot(`closed-${cycle}`)
  }
  scenario = 'post-settings-idle'
  await app.evaluate(() => globalThis.__orcaCorporateRuntimeEgressSetScenario?.('idle'))
  await new Promise((resolve) => setTimeout(resolve, 30000))
  const scopeEnded = Date.now()
  const unexpected = requests.filter((request) => !request.loopback)
  save('settings-cdp.json', {
    observer: 'independent CDP Network.requestWillBeSent',
    requests: [...requests],
    failures: [...failures],
    unexpected
  })
  if (unexpected.length) {
    throw new Error('Unexpected non-loopback request during Settings scope')
  }
  const scopedRecords = fs
    .readFileSync(log, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter(
      (record) =>
        Date.parse(record.timestamp) >= scopeStarted && Date.parse(record.timestamp) <= scopeEnded
    )
  const unexpectedRuntime = scopedRecords.filter(
    (record) => record.destination && !record.destination.loopback
  )
  save('settings-observer.json', {
    scopeStarted,
    scopeEnded,
    recordCount: scopedRecords.length,
    unexpected: unexpectedRuntime
  })
  if (unexpectedRuntime.length) {
    throw new Error('Unexpected non-loopback runtime record during Settings scope')
  }
  scenario = 'controlled-loopback'
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const transfer = await page.evaluate(async (port) => {
    try {
      await fetch(
        `http://127.0.0.1:${port}/issue-126-controlled?token=issue126-redaction-fixture`,
        {
          mode: 'no-cors',
          cache: 'no-store'
        }
      )
      return { status: 'completed' }
    } catch (error) {
      return { status: 'rejected', errorType: error.name }
    }
  }, port)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const records = fs
    .readFileSync(log, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const attribution = records.filter(
    (record) =>
      record.destination?.hostname === '127.0.0.1' &&
      record.destination.port === port &&
      record.process?.kind === 'renderer' &&
      record.source === 'electron-session-web-request' &&
      record.initiatedBy?.kind === 'app-lifecycle' &&
      record.decision?.status === 'disabled' &&
      record.decision.reason === 'automatic_app_egress_requires_explicit_enablement'
  )
  const independent = requests.filter(
    (request) => request.scenario === scenario && request.port === port
  )
  save('controlled-observer.json', {
    controlledDestination: { hostname: '127.0.0.1', port },
    transfer,
    cdpRequests: independent,
    attribution
  })
  if (!independent.length || !attribution.length) {
    throw new Error('Missing independent controlled request or renderer observer attribution')
  }
  if (fs.readFileSync(log, 'utf8').includes('issue126-redaction-fixture')) {
    throw new Error('Sensitive query fixture leaked into runtime evidence')
  }
  const policy = await page.evaluate(async () => {
    const results = []
    for (const keys of [['telemetryGetConsentState'], ['linear', 'status'], ['jira', 'status']]) {
      const method = keys.reduce((value, key) => value?.[key], window.api)
      if (typeof method !== 'function') {
        results.push({ method: keys.join('.'), verdict: 'BLOCKED' })
        continue
      }
      try {
        await method()
        results.push({ method: keys.join('.'), verdict: 'FAIL' })
      } catch (error) {
        results.push({
          method: keys.join('.'),
          verdict: String(error?.message || error).includes(
            'Capability disabled in corporate build'
          )
            ? 'PASS'
            : 'FAIL'
        })
      }
    }
    try {
      const spawned = await window.api.pty.spawn({
        cols: 80,
        rows: 24,
        launchAgent: 'cursor',
        command: 'cursor'
      })
      await window.api.pty.kill(spawned.id)
      results.push({ method: 'pty.spawn.cursor', verdict: 'FAIL' })
    } catch (error) {
      results.push({
        method: 'pty.spawn.cursor',
        verdict: String(error?.message || error).includes('AGENT_NOT_ALLOWED_BY_ORG_POLICY')
          ? 'PASS'
          : 'FAIL'
      })
    }
    return results
  })
  save('restricted-policy.json', policy)
  if (policy.some((result) => result.verdict !== 'PASS')) {
    throw new Error('Restricted Corporate policy verification failed')
  }
  save('result.json', {
    verdict: 'PASS',
    settingsCycles: 2,
    scopedIdleSeconds: 90,
    unexpectedRequests: 0,
    controlledRendererAttribution: attribution.length,
    independentControlledRequests: independent.length,
    productionApproval: false
  })
}
main()
  .catch(async (error) => {
    if (!fs.existsSync(path.join(output, 'settings-cdp.json'))) {
      save('settings-cdp.json', {
        observer: 'independent CDP Network.requestWillBeSent',
        incomplete: true,
        requests: requests.filter((request) => request.scenario !== 'controlled-loopback'),
        failures,
        unexpected: requests.filter(
          (request) => request.scenario !== 'controlled-loopback' && !request.loopback
        )
      })
    }
    save('result.json', {
      verdict: 'FAIL',
      message: String(error.message).replace(/[A-Z]:\\Users\\[^\\\s]+/gi, '<user>')
    })
    if (page) {
      const controls = await page
        .evaluate(() =>
          [...document.querySelectorAll('button')]
            .filter((el) => el.getClientRects().length)
            .map((el) => ({
              label: el.getAttribute('aria-label'),
              text: el.innerText.slice(0, 80)
            }))
        )
        .catch(() => [])
      save('failure-controls-private.json', { scenario, controls })
    }
    process.exitCode = 1
  })
  .finally(async () => {
    save('all-cdp.json', { requests, failures })
    if (app) {
      try {
        await app.close()
        save('diagnostic-cleanup.json', { gracefulClose: true })
      } catch {
        save('diagnostic-cleanup.json', { gracefulClose: false })
        process.exitCode = 1
      }
    }
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve))
    }
  })
