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
  app = await electron.launch({
    executablePath,
    args: [],
    chromiumSandbox: true,
    timeout: 180000,
    env: {
      ...cleanEnv,
      ORCA_BACKGROUND_LAUNCH: '1',
      NODE_ENV: 'production',
      ORCA_CORPORATE_RUNTIME_EGRESS_LOG_PATH: log
    }
  })
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
  await page.waitForFunction(() => document.body?.innerText.trim().length > 30, undefined, {
    timeout: 180000
  })
  const windows = await app.evaluate(({ app, BrowserWindow }) => ({
    packaged: app.isPackaged,
    visibleWindows: BrowserWindow.getAllWindows().filter((win) => win.isVisible()).length,
    observerActive: typeof globalThis.__orcaCorporateRuntimeEgressRecord === 'function',
    background: process.env.ORCA_BACKGROUND_LAUNCH
  }))
  save('launch.json', windows)
  if (!windows.packaged || windows.visibleWindows || !windows.observerActive) {
    throw new Error('Installed hidden observer launch prerequisite failed')
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
    await page.screenshot({
      path: path.join(output, `${label}.png`),
      mask: [
        page.locator('.xterm-screen'),
        page.locator('.editor-header-path'),
        page.getByText(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|[A-Z]:[\\/]Users[\\/]/)
      ]
    })
  }
  await snapshot('startup')
  const scopeStarted = Date.now()
  for (let cycle = 1; cycle <= 2; cycle++) {
    scenario = `settings-${cycle}`
    await app.evaluate(() => globalThis.__orcaCorporateRuntimeEgressSetScenario?.('open-settings'))
    await page.keyboard.press('Control+,')
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
      save('preset-menu.json', { entries: presets, glyphs })
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
  await page.evaluate(async (port) => {
    await fetch(`http://127.0.0.1:${port}/issue-126-controlled`, {
      mode: 'no-cors',
      cache: 'no-store'
    })
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
    cdpRequests: independent,
    attribution
  })
  if (!independent.length || !attribution.length) {
    throw new Error('Missing independent controlled request or renderer observer attribution')
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
      await app.close().catch(() => {})
    }
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve))
    }
  })
