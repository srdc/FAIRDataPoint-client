import fs from 'fs'
import path from 'path'
import { test, expect } from '../support/test'
import { registerCreated } from '../support/api'
import { env } from '../support/env'
import { names, descriptions, fixture } from '../support/data'
import { open, waitForImportPage } from '../support/ui'

test.describe('Excel import', () => {
  test.skip(!env.excelFile, 'set FDP_EXCEL_FILE to run the Excel import')

  test(`${env.excelEntity}: extract with the extractor and publish`, async ({ page, form, entity, api }) => {
    const file = path.resolve(env.excelFile)
    expect(fs.existsSync(file), `FDP_EXCEL_FILE ${file} exists`).toBe(true)

    const catalogId = await api.create('catalog', fixture('catalog', {
      TITLE: names.excelCatalog,
      DESCRIPTION: descriptions.catalog,
      PARENT: env.apiUrl,
    }))
    let parentRoute = `/catalog/${catalogId}`
    if (env.excelEntity === 'csvw') {
      const datasetId = await api.create('dataset', fixture('dataset', {
        TITLE: names.dataset,
        DESCRIPTION: descriptions.dataset,
        IDENTIFIER: `e2e-test-excel-${catalogId}`,
        PARENT: `${env.apiUrl}/catalog/${catalogId}`,
      }))
      parentRoute = `/dataset/${datasetId}`
    }

    await open(page, `${parentRoute}/import-${env.excelEntity}`)
    await waitForImportPage(page)
    await page.locator('[data-cy=import-source]').selectOption('excel')
    await page.locator('[data-cy=excel-mode]').selectOption(env.excelMode)
    await page.locator('[data-cy=excel-file]').setInputFiles(file)
    await page.locator('[data-cy=excel-extract]').click()

    const extractError = page.locator('.status-flash__alert--danger')
    const preview = page.locator('#shacl--form')
    const entityUrl = new RegExp(`/${env.excelEntity}/[^/]+$`)
    await expect.poll(async () => {
      if (await extractError.count()) return `error: ${await extractError.first().innerText()}`
      if (await preview.count()) return 'preview'
      if (entityUrl.test(page.url())) return 'published'
      return 'running'
    }, { timeout: env.excelTimeoutMs, intervals: [2_000] }).not.toBe('running')

    if (await extractError.count()) {
      const log = await page.locator('.extract-log').innerText().catch(() => '')
      throw new Error(`Extraction failed: ${await extractError.first().innerText()}\n${log}`)
    }
    if (await preview.count()) {
      await form.waitUntilReady()
      await form.save()
    }

    const id = await entity.expectAt(env.excelEntity)
    registerCreated(env.excelEntity, id)
    await expect(entity.title()).not.toBeEmpty()
    expect(await api.exists(env.excelEntity, id)).toBe(true)
  })
})
