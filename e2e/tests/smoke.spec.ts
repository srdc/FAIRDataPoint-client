import { test, expect } from '../support/test'
import { env } from '../support/env'
import { appPath, goto, open } from '../support/ui'

const anonymous = { storageState: { cookies: [], origins: [] } }

test.describe('anonymous visitor', () => {
  test.use(anonymous)

  test('home page shows the repository and a login link', async ({ page, entity }) => {
    await open(page, '/')
    await entity.waitLoaded()
    await expect(entity.title()).not.toBeEmpty()
    await expect(page.getByRole('link', { name: /log in/i })).toBeVisible()
    await expect(entity.action('edit')).toHaveCount(0)
  })

  test('protected pages redirect to the login page', async ({ page }) => {
    for (const route of ['/edit', '/my-metadata', '/create-catalog', '/users']) {
      await goto(page, route)
      await expect(page, `${route} should require login`).toHaveURL(/\/login$/)
    }
  })

  test('a wrong password is rejected on the login page', async ({ page }) => {
    await goto(page, '/login')
    await page.locator('input[name=email]').fill(env.user)
    await page.locator('input[name=password]').fill(`wrong-${Date.now()}`)
    await page.locator('[data-cy=login]').click()
    await expect(page.locator('.status-flash__alert--danger')).toHaveText(/Login failed/)
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('signed-in user', () => {
  test('header shows the user menu and the root offers edit and create', async ({ page, entity }) => {
    await open(page, '/')
    await entity.waitLoaded()
    await expect(page.locator('[data-cy=user-menu]')).toBeVisible()
    await expect(entity.action('edit')).toBeVisible()
    await expect(entity.itemList().locator('[data-cy=create]')).toBeVisible()
    await expect(entity.itemList().locator('[data-cy=import]')).toBeVisible()
  })

  test('RDF download buttons serve the requested format', async ({ page, request, entity }) => {
    const pages = ['/']
    await open(page, '/')
    await entity.itemListLoaded()
    const published = entity.itemList().locator('[data-cy=item] a.item__title')
      .filter({ hasNotText: /\[DRAFT\]/ }).first()
    if (await published.count()) pages.push(appPath((await published.getAttribute('href')) as string))

    const failures: string[] = []
    for (const route of pages) {
      await open(page, route)
      for (const [label, type] of [['ttl', 'text/turtle'], ['rdf+xml', 'application/rdf+xml'], ['json-ld', 'application/ld+json']]) {
        const href = await page.locator('a.btn-outline-primary', { hasText: label }).getAttribute('href')

        const res = await request.get(href as string, {
          headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
          maxRedirects: 0,
        })
        const got = res.headers()['content-type'] || ''
        if (res.status() >= 300 && res.status() < 400) {
          failures.push(`${route} ${label}: ${href} -> HTTP ${res.status()} redirect to ${res.headers().location}`
            + ' (the button must get the file directly: the redirect drops ?format=, and an absolute Location may lose the port)')
        } else if (res.status() !== 200 || !got.includes(type)) {
          failures.push(`${route} ${label}: ${href} -> HTTP ${res.status()} ${got}`)
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  test('catalog list opens a catalog page', async ({ page, entity }) => {
    await open(page, '/')
    await entity.itemListLoaded()
    const first = entity.itemList().locator('[data-cy=item] a.item__title').first()
    test.skip((await first.count()) === 0, 'the repository has no catalogs yet')
    const title = (await first.innerText()).replace(/^\[DRAFT\]\s*/, '')
    await first.click()
    await entity.expectAt('catalog')
    await expect(entity.title()).toContainText(title)
  })

  test('search page returns results for the header search', async ({ page }) => {
    await open(page, '/')
    await page.locator('.search-field input').fill('a')
    await page.locator('.search-field input').press('Enter')
    await expect(page).toHaveURL(/\/search\?q=a/)
    await expect(page.locator('.status-flash__alert--danger')).toHaveCount(0)
  })

  test('my metadata dashboard renders', async ({ page }) => {
    await open(page, '/my-metadata')
    await expect(page.locator('.page__title h1')).toBeVisible()
    await expect(page.locator('.status-flash__alert--danger')).toHaveCount(0)
  })
})
