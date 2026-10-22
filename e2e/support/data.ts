import fs from 'fs'
import path from 'path'
import { env, paths } from './env'

/**
 * Names and fixture files for one run
 */

export const runId: string = process.env.FDP_RUN_ID || 'local'

export const names = {
  catalog: `${env.namePrefix} catalog ${runId}`,
  catalogEdited: `${env.namePrefix} catalog ${runId} (edited)`,
  dataset: `${env.namePrefix} dataset ${runId}`,
  distribution: `${env.namePrefix} distribution ${runId}`,
  distributionEdited: `${env.namePrefix} distribution ${runId} (edited)`,
  csvw: `${env.namePrefix} variables ${runId}`,
  excelCatalog: `${env.namePrefix} excel catalog ${runId}`,
  apiCatalog: `${env.namePrefix} api catalog ${runId}`,
  user: { firstName: 'E2E', lastName: `Test ${runId}`, email: `e2e-test-${runId}@example.org` },
}

export const descriptions = {
  catalog: `Catalog created by the STAGE E2E tests (run ${runId}).`,
  catalogEdited: `Catalog description edited by the STAGE E2E tests (run ${runId}).`,
  dataset: `Dataset imported from Turtle by the STAGE E2E tests (run ${runId}).`,
}

export const values = {
  legislation: 'http://data.europa.eu/eli/reg/2025/327/oj',
  publisherName: 'STAGE E2E tests',
  contactEmail: 'e2e-tests@example.org',
  accessUrl: 'https://example.org/stage/e2e-tests/access',
  keyword: `e2e-test-${runId}`.toLowerCase(),
  variables: ['age', 'bmi', 'smoker'],
}

/** Placeholder subject used in fixtures; the FDP mints the real IRI on POST. */
export const newSubject = () => `${env.apiUrl}/new`

/** Reads fixtures/<name>.ttl and fills its {{PLACEHOLDERS}}. */
export function fixture(name: string, vars: Record<string, string>): string {
  let ttl = fs.readFileSync(path.join(paths.fixtures, `${name}.ttl`), 'utf8')
  const all = { SUBJECT: newSubject(), ...vars }
  Object.entries(all).forEach(([key, value]) => {
    ttl = ttl.split(`{{${key}}}`).join(value)
  })
  const missing = ttl.match(/{{[A-Z_]+}}/g)
  if (missing) {
    throw new Error(`fixtures/${name}.ttl: no value for ${[...new Set(missing)].join(', ')}`)
  }
  return ttl
}

/** A fixture as the in-memory file Playwright hands to an <input type=file>. */
export function fixtureFile(name: string, vars: Record<string, string>) {
  return {
    name: `${name}-${runId}.ttl`,
    mimeType: 'text/turtle',
    buffer: Buffer.from(fixture(name, vars), 'utf8'),
  }
}
