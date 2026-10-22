import { test, expect } from '../support/test'
import { registerCreated } from '../support/api'
import { env } from '../support/env'
import { names, descriptions, values, fixtureFile } from '../support/data'
import { flowState } from '../support/state'
import { appPath, open, waitForImportPage } from '../support/ui'

const need = (what: keyof ReturnType<typeof flowState.get>) => {
  const id = flowState.get()[what]
  test.skip(!id, `needs the ${what} from an earlier step`)
  return id as string
}

test.describe('metadata lifecycle', () => {
  test('catalog: the create form rejects an empty submission', async ({ page, form, entity }) => {
    await open(page, '/')
    await entity.itemList().locator('[data-cy=create]').click()
    await expect(page).toHaveURL(/\/create-catalog$/)
    await form.waitUntilReady()

    await form.save()
    await expect(form.submitError()).toContainText('Unable to save entity data.')
    await expect(form.fieldErrors().filter({ hasText: 'Title is required.' })).toBeVisible()
    await expect(page).toHaveURL(/\/create-catalog$/)
  })

  test('catalog: create through the form', async ({ page, form, entity }) => {
    await open(page, '/create-catalog')
    await form.waitUntilReady()
    await form.openTab('Mandatory')

    await form.fill('Title', names.catalog)
    const publisher = form.field('Publisher')
    await form.fill('Publisher name', values.publisherName, { within: publisher })
    await form.fill('Email', values.contactEmail, { within: form.field('Contact point (cpov)', publisher) })
    await form.fill('Description', descriptions.catalog)
    await form.fill('Applicable legislation', values.legislation)
    await form.saveAndLeave(/^\/catalog\/[^/]+$/)

    const id = await entity.expectAt('catalog')
    registerCreated('catalog', id)
    flowState.set({ catalog: id })
    await expect(entity.title()).toHaveText(`[DRAFT] ${names.catalog}`)
    await expect(entity.description()).toHaveText(descriptions.catalog)
  })

  test('catalog: edit the draft (title and description)', async ({ page, form, entity, api }) => {
    const catalog = need('catalog')
    await open(page, `/catalog/${catalog}`)
    await entity.action('edit').click()
    await expect(page).toHaveURL(new RegExp(`/catalog/${catalog}/edit$`))
    await form.waitUntilReady()
    expect(await form.value('Title')).toBe(names.catalog)

    await form.fill('Title', names.catalogEdited)
    await form.fill('Description', descriptions.catalogEdited)
    await form.saveAndLeave(new RegExp(`^/catalog/${catalog}$`))

    await entity.waitLoaded()
    await expect(entity.title()).toHaveText(`[DRAFT] ${names.catalogEdited}`)
    await expect(entity.description()).toHaveText(descriptions.catalogEdited)
    const { body } = await api.getTurtle('catalog', catalog)
    expect(body).toContain(names.catalogEdited)
    expect(body).not.toContain(`"${names.catalog}"`)
  })

  test('dataset: import a Turtle file, review the preview form and save', async ({ page, form, entity }) => {
    const catalog = need('catalog')
    await open(page, `/catalog/${catalog}`)
    await entity.itemList().locator('[data-cy=import]').click()
    await expect(page).toHaveURL(new RegExp(`/catalog/${catalog}/import-dataset$`))
    await waitForImportPage(page)

    await page.locator('[data-cy=import-source]').selectOption('ttl')
    await page.locator('[data-cy=import-ttl-file]').setInputFiles(fixtureFile('dataset', {
      TITLE: names.dataset,
      DESCRIPTION: descriptions.dataset,
      IDENTIFIER: `e2e-test-${catalog}`,
      // Deliberately another parent: the import page must relink the dataset to this catalog.
      PARENT: `${env.apiUrl}/catalog/not-this-one`,
    }))

    await form.waitUntilReady()
    await form.openTab('Mandatory')
    expect(await form.value('Title')).toBe(names.dataset)
    await form.saveAndLeave(/^\/dataset\/[^/]+$/)

    const id = await entity.expectAt('dataset')
    registerCreated('dataset', id)
    flowState.set({ dataset: id })
    await expect(entity.title()).toHaveText(`[DRAFT] ${names.dataset}`)
    // Breadcrumbs lead back to the catalog it was imported into.
    await expect(page.locator('.breadcrumbs')).toContainText(/E2E test catalog/)
  })

  test('catalog lists the imported dataset', async ({ page, entity }) => {
    const catalog = need('catalog')
    need('dataset')
    await open(page, `/catalog/${catalog}`)
    await expect(entity.itemList().locator('[data-cy=item]', { hasText: names.dataset })).toBeVisible()
  })

  test('my metadata lists the new catalog', async ({ page }) => {
    need('catalog')
    await open(page, '/my-metadata')
    await expect(page.getByText(/E2E test catalog/).filter({ hasText: names.catalog.split(' ').pop() as string }).first())
      .toBeVisible()
  })

  test('data dictionary: CSVW import publishes directly and lists the variables', async ({ page, entity }) => {
    const dataset = need('dataset')
    await open(page, `/dataset/${dataset}`)
    await page.locator('[data-cy=import-inline-child]').first().click()
    await expect(page).toHaveURL(new RegExp(`/dataset/${dataset}/import-csvw$`))
    await waitForImportPage(page)

    await page.locator('[data-cy=import-source]').selectOption('ttl')
    await page.locator('[data-cy=import-ttl-file]').setInputFiles(fixtureFile('csvw', {
      TITLE: names.csvw,
      PARENT: `${env.apiUrl}/dataset/${dataset}`,
    }))

    const id = await entity.expectAt('csvw')
    registerCreated('csvw', id)
    flowState.set({ csvw: id })
    const pager = page.locator('[data-cy=content-pager]')
    await expect(pager).toContainText(`of ${values.variables.length}`)
    for (const variable of values.variables) {
      await expect(pager.getByText(variable, { exact: true }).first()).toBeVisible()
    }
  })

  test('dataset shows the data dictionary inline', async ({ page, entity }) => {
    const dataset = need('dataset')
    need('csvw')
    await open(page, `/dataset/${dataset}`)
    await entity.waitLoaded()
    await expect(entity.metadataItem('Variables')).toContainText(names.csvw)
  })

  test('publish: catalog and dataset leave draft state', async ({ page, entity, api }) => {
    const ids = flowState.get()
    need('catalog')
    for (const prefix of ['catalog', 'dataset'] as const) {
      const id = ids[prefix]
      if (!id) continue
      await open(page, `/${prefix}/${id}`)
      await entity.publish()
      expect((await api.getMeta(prefix, id)).state.current, `${prefix} state`).toBe('PUBLISHED')
    }
  })

  test('dataset: edit the published dataset (adds a keyword)', async ({ page, form, entity, api }) => {
    const dataset = need('dataset')
    await open(page, `/dataset/${dataset}/edit`)
    await form.waitUntilReady()
    await form.openTab('Optional')
    await form.fill('Keyword', values.keyword)
    await form.saveAndLeave(new RegExp(`^/dataset/${dataset}$`))

    await entity.waitLoaded()
    await expect(entity.metadataItem('Keyword')).toContainText(values.keyword)
    expect((await api.getTurtle('dataset', dataset)).body).toContain(values.keyword)
  })

  test('search finds the published catalog', async ({ page, api }) => {
    const catalog = need('catalog')
    const { body } = await api.getTurtle('catalog', catalog)
    const title = body.includes(names.catalogEdited) ? names.catalogEdited : names.catalog
    await open(page, '/')
    await page.locator('.search-field input').fill(title)
    await page.locator('.search-field input').press('Enter')
    await expect(page).toHaveURL(/\/search\?q=/)
    await expect(page.getByRole('link', { name: title }).first()).toBeVisible({ timeout: 30_000 })
  })

  test('settings page of the catalog shows its members', async ({ page }) => {
    const catalog = need('catalog')
    await open(page, `/catalog/${catalog}`)
    await page.locator('.page__actions [data-cy=settings]').click()
    await expect(page).toHaveURL(new RegExp(`/catalog/${catalog}/settings$`))
    await expect(page.locator('.status-flash__alert--danger')).toHaveCount(0)
    await expect(page.locator('.page__title h1')).toBeVisible()
  })

  test('distribution: create through the form', async ({ page, form, entity }) => {
    const dataset = need('dataset')
    await open(page, `/dataset/${dataset}`)
    await entity.itemList().locator('[data-cy=create]').click()
    await expect(page).toHaveURL(new RegExp(`/dataset/${dataset}/create-distribution$`))
    await form.waitUntilReady()

    await form.openTab('Mandatory')
    await form.fill('Access url', values.accessUrl)
    await form.fill('Applicable legislation', values.legislation)
    await form.saveAndLeave(/^\/distribution\/[^/]+$/)

    const id = await entity.expectAt('distribution')
    registerCreated('distribution', id)
    flowState.set({ distribution: id })
    await expect(entity.title()).toContainText('[DRAFT]')
  })

  test('distribution: an untitled distribution keeps the dashboard and its page working', async ({ page, entity, api }) => {
    // dct:title is optional for a Distribution
    const distribution = need('distribution')
    await open(page, '/my-metadata')
    const alert = page.locator('.status-flash__alert--danger')
    expect(await alert.count() ? await alert.innerText() : 'no error', 'My Metadata while an untitled distribution exists')
      .toBe('no error')

    await open(page, `/distribution/${distribution}`)
    await entity.waitLoaded()
    await expect(entity.title()).not.toContainText('undefined')
    await entity.publish()
    expect((await api.getMeta('distribution', distribution)).state.current).toBe('PUBLISHED')
  })

  test('distribution: filling a field on the optional tab still saves', async ({ page, form, entity }) => {
    const dataset = need('dataset')
    await open(page, `/dataset/${dataset}/create-distribution`)
    await form.waitUntilReady()
    await form.openTab('Mandatory')
    await form.fill('Access url', `${values.accessUrl}/optional-tab`)
    await form.fill('Applicable legislation', values.legislation)

    await form.openTab('Optional')
    await form.fill('Title', names.distribution)
    await form.saveAndLeave(/^\/distribution\/[^/]+$/)

    const id = await entity.expectAt('distribution')
    registerCreated('distribution', id)
    await expect(entity.title()).toHaveText(`[DRAFT] ${names.distribution}`)
  })

  test('distribution: edit adds a title', async ({ page, form, entity }) => {
    const distribution = need('distribution')
    await open(page, `/distribution/${distribution}/edit`)
    await form.waitUntilReady()
    await form.openTab('Optional')
    await form.fill('Title', names.distributionEdited)
    await form.saveAndLeave(new RegExp(`^/distribution/${distribution}$`))

    await entity.waitLoaded()
    await expect(entity.title()).toContainText(names.distributionEdited)
  })

  test('delete: distribution, data dictionary, dataset and catalog through the UI', async ({ page, entity, api }) => {
    test.skip(!env.cleanup, 'FDP_CLEANUP=0: the created metadata is kept')
    const ids = flowState.get()
    need('catalog')

    if (ids.distribution) {
      await open(page, `/distribution/${ids.distribution}`)
      await entity.delete()
      await expect(page).toHaveURL(new RegExp(`/dataset/${ids.dataset}$`))
      await entity.waitLoaded()
      await expect(entity.itemList().locator(`[data-cy=item] a[href*="${ids.distribution}"]`)).toHaveCount(0)
    }
    if (ids.csvw) {
      await open(page, `/csvw/${ids.csvw}`)
      await entity.delete()
      await expect(page).toHaveURL(new RegExp(`/dataset/${ids.dataset}$`))
    }
    if (ids.dataset) {
      await open(page, `/dataset/${ids.dataset}`)
      await entity.delete()
      await expect(page).toHaveURL(new RegExp(`/catalog/${ids.catalog}$`))
      await entity.waitLoaded()
      await expect(entity.itemList().locator('[data-cy=item]', { hasText: names.dataset })).toHaveCount(0)
    }
    await open(page, `/catalog/${ids.catalog}`)
    await entity.delete()
    await page.waitForURL((url) => appPath(url.toString()) === '/')

    for (const [prefix, id] of Object.entries(ids)) {
      expect(await api.exists(prefix, id as string), `${prefix}/${id} should be gone`).toBe(false)
    }
  })
})
