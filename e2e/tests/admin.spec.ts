import { test, expect } from '../support/test'
import { env } from '../support/env'
import { names } from '../support/data'
import { open } from '../support/ui'

test.describe('administration', () => {
  test('users: create a user, find it in the list, remove it', async ({ page, api }) => {
    await open(page, '/users')
    await expect(page.locator('[data-cy=user-item]', { hasText: /./ }).first()).toBeVisible()
    await page.locator('[data-cy=create-user]').first().click()
    await expect(page).toHaveURL(/\/users\/create$/)

    const password = `Ui-${Date.now()}-pw`
    await page.locator('input[name=firstName]').fill(names.user.firstName)
    await page.locator('input[name=lastName]').fill(names.user.lastName)
    await page.locator('input[name=email]').fill(names.user.email)
    await page.locator('select[name=role]').selectOption('USER')
    await page.locator('input[name=password]').fill(password)
    await page.locator('input[name=passwordConfirmation]').fill(password)
    await page.locator('button[data-cy=create-user]').click()

    await page.waitForURL(/\/users$/)
    const row = page.locator('[data-cy=user-item]', { hasText: names.user.lastName })
    await expect(row).toBeVisible()
    expect((await api.users()).some((u) => u.email === names.user.email)).toBe(true)

    page.once('dialog', (dialog) => dialog.accept())
    await row.locator('.dropdown-toggle').click()
    await row.getByRole('menuitem', { name: /Remove/ }).click()
    const alert = page.locator('.status-flash__alert--danger')
    await expect.poll(async () => ((await alert.count()) ? `error: ${await alert.innerText()}` : `rows: ${await row.count()}`))
      .toBe('rows: 0')
    expect((await api.users()).some((u) => u.email === names.user.email)).toBe(false)
  })

  test('API keys: generate one and remove it again', async ({ page, api }) => {
    const before = new Set((await api.apiKeys()).map((k) => k.uuid))
    await open(page, '/api-keys')
    const rows = page.locator('.item-list__item--simple')
    await expect(rows).toHaveCount(before.size)
    await page.getByText('+ Generate API Key').click()
    await expect(rows).toHaveCount(before.size + 1)

    const created = (await api.apiKeys()).find((k) => !before.has(k.uuid))
    expect(created, 'the FDP lists the new key').toBeTruthy()
    const row = rows.filter({ hasText: created.token })
    await expect(row).toBeVisible()
    page.once('dialog', (dialog) => dialog.accept())
    await row.locator('a.text-danger', { hasText: 'Remove' }).click()
    await expect(rows).toHaveCount(before.size)
    expect((await api.apiKeys()).some((k) => k.uuid === created.uuid)).toBe(false)
  })

  test('metadata schemas list the HealthDCAT-AP schemas', async ({ page }) => {
    await open(page, '/schemas')
    for (const schema of ['Catalog', 'Dataset', 'Distribution', 'Resource']) {
      // eslint-disable-next-line no-await-in-loop
      await expect(page.getByRole('link', { name: schema, exact: true }).first(), `schema ${schema}`).toBeVisible()
    }
  })

  test('resource definitions list every entity type', async ({ page }) => {
    await open(page, '/resource-definitions')
    for (const rd of ['Catalog', 'Dataset', 'Distribution', 'CSVW Table Group']) {
      await expect(page.getByText(rd, { exact: true }).first(), `resource definition ${rd}`).toBeVisible()
    }
  })

  test('FDP settings page renders', async ({ page }) => {
    await open(page, '/settings')
    await expect(page.locator('.page__title h1')).toBeVisible()
    await expect(page.locator('.status-flash__alert--danger')).toHaveCount(0)
  })

  test('profile page of the signed-in user renders', async ({ page }) => {
    await open(page, '/users/current')
    await expect(page.locator('input[name=email]')).toHaveValue(env.user)
  })
})
