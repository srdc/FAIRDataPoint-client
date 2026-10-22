import fs from 'fs'
import path from 'path'

const trimSlash = (url: string) => url.replace(/\/+$/, '')

const uiUrl = trimSlash(process.env.FDP_UI_URL || 'http://localhost:8088')

export const env = {
  /** Where the client is served (the page the browser opens). */
  uiUrl,
  /** FDP API base, i.e. the persistent URL the client talks to. */
  apiUrl: trimSlash(process.env.FDP_API_URL || `${uiUrl}/stage-fdp-api`),
  /** An ADMIN account: deleting metadata in the UI is admin-only. */
  user: process.env.FDP_USER || 'admin@example.com',
  password: process.env.FDP_PASSWORD || '',
  /** Prefix for everything the suite creates, so leftovers are easy to recognise. */
  namePrefix: process.env.FDP_TEST_PREFIX || 'E2E test',
  /** Set to 0 to skip saving the root metadata (the root edit page is still opened and checked). */
  rootSave: process.env.FDP_ROOT_SAVE !== '0',
  /** Set to 0 to keep the entities the flow creates (they are deleted at the end by default). */
  cleanup: process.env.FDP_CLEANUP !== '0',
  /** Excel import: path to a workbook/CSV the extractor accepts. The excel project skips without it. */
  excelFile: process.env.FDP_EXCEL_FILE || '',
  /** standard | kora | nfbc (kora and nfbc only exist for CSVW data dictionaries). */
  excelMode: process.env.FDP_EXCEL_MODE || 'standard',
  /** Entity the Excel file is imported as: dataset (default) or csvw. */
  excelEntity: process.env.FDP_EXCEL_ENTITY || 'dataset',
  /** Extraction runs the adapter JAR, which can take minutes. */
  excelTimeoutMs: Number(process.env.FDP_EXCEL_TIMEOUT_MS || 10 * 60 * 1000),
}

export const paths = {
  root: path.resolve(__dirname, '..'),
  authState: path.resolve(__dirname, '..', '.state', 'auth.json'),
  created: path.resolve(__dirname, '..', '.state', 'created.json'),
  fixtures: path.resolve(__dirname, '..', 'fixtures'),
}

export function requirePassword(): string {
  if (!env.password) {
    throw new Error(
      'FDP_PASSWORD is not set. Run the suite through ./run.sh (it asks for it), '
      + 'or export FDP_PASSWORD / put it in e2e/.env.',
    )
  }
  return env.password
}

export function ensureStateDir(): void {
  fs.mkdirSync(path.dirname(paths.authState), { recursive: true })
}
