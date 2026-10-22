import { expect, Locator, Page } from '@playwright/test'
import { env } from './env'

/**
 * Page helpers for the FDP client
 */

const escapeXPath = (text: string) => (text.includes('"') ? `concat("${text.split('"').join('", \'"\', "')}")` : `"${text}"`)

/** The generated SHACL form (create, edit and import-preview pages). */
export class ShaclForm {
  readonly root: Locator

  /** Console errors seen while the form is open (the client logs failed saves there). */
  readonly consoleErrors: string[] = []

  constructor(readonly page: Page) {
    this.root = page.locator('#shacl--form')
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) {
        this.consoleErrors.push(msg.text().split('\n')[0])
      }
    })
  }

  async waitUntilReady(): Promise<void> {
    await expect(this.root).toBeVisible()
    await expect(this.root.locator('.form__group').first()).toBeVisible()
  }

  /** Tab labels of the top-level form (empty when the shapes declare no sh:group). */
  tabs(): Locator {
    return this.root.locator(':scope > .form-renderer > .tabs > .tab')
  }

  async openTab(name: string): Promise<void> {
    const tab = this.tabs().filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) })
    if (await tab.count()) await tab.first().click()
  }

  /**
   * The .form__group of the field labelled `label` (the label is sh:name, capitalised the way
   * the client shows it, e.g. "Applicable legislation", "Contact point (cpov)").
   * Pass `within` to look inside a nested node-shape field, e.g. Publisher > Publisher name.
   */
  field(label: string, within?: Locator): Locator {
    const scope = within || this.root
    return scope
      .locator('.form__group')
      .filter({ has: this.page.locator(`xpath=./label[normalize-space(.)=${escapeXPath(label)}]`) })
      .first()
  }

  /** Inputs that belong to a field itself, not to fields nested inside it. */
  private ownInputs(group: Locator): Locator {
    const editors = ':is(input, select, textarea)'
    return group.locator(
      `:scope > ul > li > .d-flex > .input-wrapper ${editors}, :scope > div > div > .d-flex > .input-wrapper ${editors}`,
    )
  }

  private addButton(group: Locator): Locator {
    return group.locator(':scope > button', { hasText: 'Add' })
  }

  /** Types `value` into the n-th value of a field, clicking "Add" first when needed. */
  async fill(label: string, value: string, opts: { within?: Locator, index?: number } = {}): Promise<void> {
    const group = this.field(label, opts.within)
    await expect(group, `form field "${label}"`).toBeVisible()
    const index = opts.index || 0
    const inputs = this.ownInputs(group)
    while ((await inputs.count()) <= index) {
      await this.addButton(group).click()
    }
    const input = inputs.nth(index)
    await input.fill(value)
    await input.blur()
  }

  /** Current value of the n-th input of a field. */
  async value(label: string, opts: { within?: Locator, index?: number } = {}): Promise<string> {
    return this.ownInputs(this.field(label, opts.within)).nth(opts.index || 0).inputValue()
  }

  /** Picks an option of an enum/boolean select by its visible text. */
  async select(label: string, optionText: string, opts: { within?: Locator } = {}): Promise<void> {
    const group = this.field(label, opts.within)
    const select = this.ownInputs(group).first()
    await select.selectOption({ label: optionText })
  }

  /** For optional nested fields (e.g. Custodian) that start collapsed behind "Add". */
  async addNode(label: string, within?: Locator): Promise<Locator> {
    const group = this.field(label, within)
    if ((await group.locator(':scope .form-renderer').count()) === 0) {
      await this.addButton(group).click()
    }
    return group
  }

  async save(): Promise<void> {
    await this.root.locator('[data-cy=save]').click()
  }

  /**
   * Clicks Save and waits until the client navigates to `leavesTo`. Fails with the FDP's
   * validation report when the save is rejected, and with a clear message when the client
   * never finishes (Save stays disabled under "Loading...").
   */
  async saveAndLeave(leavesTo: RegExp, timeout = 30_000): Promise<void> {
    await this.save()
    let outcome = 'pending'
    try {
      await expect.poll(async () => {
        if (leavesTo.test(appPath(this.page.url()))) outcome = 'saved'
        else if (await this.submitError().isVisible()) outcome = 'rejected'
        else outcome = 'pending'
        return outcome
      }, { timeout }).not.toBe('pending')
    } catch {
      throw new Error(
        `Save did not finish within ${timeout / 1000}s: the page neither moved on nor showed an error`
        + ` (the form is stuck on "Loading..."). Client console: ${this.consoleErrors.join(' | ') || 'none'}`,
      )
    }
    if (outcome === 'rejected') {
      throw new Error(`The FDP rejected the form: ${await this.submitError().innerText()}\n${await this.report()}`)
    }
  }

  /** The raw SHACL report behind "View report", trimmed to the result lines. */
  async report(): Promise<string> {
    const link = this.page.locator('a.collapse-link', { hasText: 'View report' })
    if (!(await link.count())) return ''
    await link.first().click()
    const raw = await this.page.locator('#raw-error').innerText().catch(() => '')
    const lines = raw.split('\n').filter((l) => /resultPath|resultMessage|focusNode|ConstraintComponent/.test(l))
    return (lines.length ? lines : raw.split('\n')).slice(0, 40).join('\n')
  }

  /** The red banner the create/edit pages show when the FDP rejects the data. */
  submitError(): Locator {
    return this.page.locator('.status-flash__alert--danger').first()
  }

  /** Inline per-field validation messages (from the FDP's SHACL report). */
  fieldErrors(): Locator {
    return this.root.locator('.invalid-feedback')
  }

  async rdfPreview(): Promise<string> {
    await this.root.locator('a.collapse-link', { hasText: 'View RDF' }).click()
    return this.root.locator('#rdf-view').innerText()
  }
}

/** Entity view pages: /, /catalog/:id, /dataset/:id, ... */
export class EntityPage {
  constructor(readonly page: Page) {}

  title(): Locator {
    return this.page.locator('.page__title h1').first()
  }

  description(): Locator {
    return this.page.locator('p.description').first()
  }

  action(name: 'edit' | 'settings' | 'delete' | 'publish'): Locator {
    return this.page.locator(`.page__actions [data-cy=${name}]`)
  }

  itemList(): Locator {
    return this.page.locator('[data-cy=item-list]')
  }

  /** Waits until the child list has loaded (items or its "There are no ..." text). */
  async itemListLoaded(): Promise<Locator> {
    const list = this.itemList()
    await expect(list.locator('[data-cy=item], .item-list__empty').first()).toBeVisible()
    return list
  }

  metadataBlock(): Locator {
    return this.page.locator('.entity-metadata')
  }

  /** The "<label>" entry in the metadata column (field labels are sh:name, capitalised). */
  metadataItem(label: string): Locator {
    return this.page.locator('.entity-metadata__item')
      .filter({ has: this.page.locator('h3', { hasText: new RegExp(`^\\s*${label}\\s*$`, 'i') }) })
      .first()
  }

  async waitLoaded(): Promise<void> {
    await expect(this.page.locator('.loader')).toHaveCount(0, { timeout: 30_000 })
    const alert = this.page.locator('.status-flash__alert--danger')
    if (!(await this.title().count()) && await alert.count()) {
      throw new Error(`${appPath(this.page.url())} did not load: ${await alert.first().innerText()}`)
    }
    await expect(this.title(), `page title of ${appPath(this.page.url())}`).toBeVisible()
  }

  /** Waits for /<prefix>/<id> and returns the id. */
  async expectAt(prefix: string): Promise<string> {
    const pattern = new RegExp(`/${prefix}/([^/?#]+)$`)
    await this.page.waitForURL(pattern, { timeout: 60_000 })
    await this.waitLoaded()
    return (this.page.url().match(pattern) as RegExpMatchArray)[1]
  }

  /** Clicks an action that asks window.confirm() and accepts the dialog. */
  async confirmAction(name: 'delete' | 'publish'): Promise<void> {
    this.page.once('dialog', (dialog) => dialog.accept())
    await this.action(name).click()
  }

  async publish(): Promise<void> {
    await expect(this.title()).toContainText('[DRAFT]')
    await this.confirmAction('publish')
    await expect(this.title()).not.toContainText('[DRAFT]', { timeout: 30_000 })
  }

  async delete(): Promise<void> {
    const from = this.page.url()
    await this.confirmAction('delete')
    await this.page.waitForURL((url) => url.toString() !== from, { timeout: 30_000 })
  }
}

/**
 * Import pages: wait until the entity spec and parent have loaded (the breadcrumbs appear
 * then). A file chosen earlier is parsed without the spec and the form reports
 * "The form configuration is not valid."
 */
export async function waitForImportPage(page: Page): Promise<void> {
  await expect(page.locator('.breadcrumbs')).toBeVisible()
  await expect(page.locator('[data-cy=import-source]')).toBeVisible()
}

/** The client's own path prefix (empty when it is served at the root of its host). */
export const publicPath = new URL(env.uiUrl).pathname.replace(/\/+$/, '')

/** A browser URL as a client route: '/catalog/x' whether or not the client has a path prefix. */
export function appPath(url: string): string {
  const { pathname } = new URL(url, env.uiUrl)
  return (publicPath && pathname.startsWith(publicPath) ? pathname.slice(publicPath.length) : pathname) || '/'
}

/** Navigates to a client route ('/login', '/catalog/<id>', ...). */
export async function goto(page: Page, route: string): Promise<void> {
  await page.goto(`${env.uiUrl}${route}`)
}

/** Opens a client route, waiting for the SPA to finish its first data load. */
export async function open(page: Page, route: string): Promise<void> {
  await goto(page, route)
  await expect(page.locator('#app')).toBeVisible()
  await expect(page.locator('.loader')).toHaveCount(0, { timeout: 30_000 })
}

/** Fails the test on uncaught page errors, which are otherwise silent in the SPA. */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}
