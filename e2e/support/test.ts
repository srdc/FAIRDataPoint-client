import { test as base, expect } from '@playwright/test'
import { FdpApi } from './api'
import { EntityPage, ShaclForm, trackPageErrors } from './ui'

type Fixtures = {
  form: ShaclForm
  entity: EntityPage
  pageErrors: string[]
  browserLog: string[]
}

type WorkerFixtures = {
  api: FdpApi
}

const NOISE = [/\/label\?iri=/, /fonts\.googleapis\.com/, /fonts\.gstatic\.com/]
const isNoise = (url: string) => NOISE.some((re) => re.test(url))

export const test = base.extend<Fixtures, WorkerFixtures>({
  api: [async ({}, use) => {
    const api = await FdpApi.login()
    await use(api)
    await api.dispose()
  }, { scope: 'worker' }],

  form: async ({ page }, use) => {
    await use(new ShaclForm(page))
  },

  entity: async ({ page }, use) => {
    await use(new EntityPage(page))
  },

  browserLog: [async ({ page }, use, testInfo) => {
    const log: string[] = []
    const started = Date.now()
    const stamp = () => `+${((Date.now() - started) / 1000).toFixed(1)}s`

    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type()) && !isNoise(msg.location().url || '')
        && !msg.text().startsWith('Failed to load resource')) {
        log.push(`${stamp()} console.${msg.type()}: ${msg.text().split('\n')[0]}`)
      }
    })
    page.on('pageerror', (err) => log.push(`${stamp()} page error: ${err.message}`))
    page.on('requestfailed', (req) => {
      if (!isNoise(req.url())) log.push(`${stamp()} request failed: ${req.method()} ${req.url()} (${req.failure()?.errorText})`)
    })
    page.on('response', async (res) => {
      const req = res.request()
      const mutating = req.method() !== 'GET' && req.method() !== 'OPTIONS'
      if ((mutating || res.status() >= 400) && !isNoise(res.url())) {
        let body = ''
        if (res.status() >= 400) {
          body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)
        }
        log.push(`${stamp()} ${req.method()} ${res.status()} ${res.url()}${body ? `  ${body}` : ''}`)
      }
    })
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) log.push(`${stamp()} page: ${frame.url()}`)
    })

    await use(log)

    if (log.length) {
      await testInfo.attach('browser-log', { body: log.join('\n'), contentType: 'text/plain' })
    }
  }, { auto: true }],

  pageErrors: [async ({ page }, use) => {
    const errors = trackPageErrors(page)
    await use(errors)
    expect(errors, 'uncaught errors in the client').toEqual([])
  }, { auto: true }],
})

export { expect }
