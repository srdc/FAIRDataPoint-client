import { test, expect } from '../support/test'
import { env } from '../support/env'
import { appPath, open } from '../support/ui'

test.describe('root (FAIR Data Point) metadata', () => {
  test('edit form shows the fields without blank tabs', async ({ page, form, entity }) => {
    await open(page, '/')
    await entity.action('edit').click()
    await expect(page).toHaveURL(/\/edit$/)
    await form.waitUntilReady()

    const tabs = await form.tabs().allInnerTexts()
    for (const label of tabs) {
      expect(label.trim(), `tab labels: ${JSON.stringify(tabs)}`).not.toBe('')
    }
    await expect(form.field('Title')).toBeVisible()
    await expect(form.field('Description')).toBeVisible()
  })

  test('saving the unchanged form keeps the root metadata', async ({ page, form, entity, api }) => {
    test.skip(!env.rootSave, 'FDP_ROOT_SAVE=0')
    const before = await api.getTurtle('', '')
    expect(before.status).toBe(200)

    await open(page, '/edit')
    await form.waitUntilReady()
    const title = await form.value('Title')
    await form.save()

    await expect.poll(async () => {
      if (await form.submitError().count()) return 'rejected'
      return appPath(page.url()) === '/' ? 'saved' : 'pending'
    }, { timeout: 30_000 }).not.toBe('pending')
    if (await form.submitError().count()) {
      await page.locator('a.collapse-link', { hasText: 'View report' }).click()
      const report = await page.locator('#raw-error').innerText()
      const paths = [...report.matchAll(/resultPath\s+([^;\s]+)/g)].map((m) => m[1])
      throw new Error(
        `The FDP rejected the unchanged root metadata (failing properties: ${paths.join(', ') || 'see report'}). `
        + 'The stored root does not satisfy its own shapes, so nobody can save it from the edit page.',
      )
    }

    await entity.waitLoaded()
    await expect(entity.title()).toHaveText(title)

    const after = await api.getTurtle('', '')
    const catalogs = (ttl: string) => new Set(ttl.match(/<[^>]*\/catalog\/[^>]+>/g) || []).size
    expect(catalogs(after.body)).toBe(catalogs(before.body))
  })
})
