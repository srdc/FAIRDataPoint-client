import { defineConfig, devices } from '@playwright/test'
import { env, paths } from './support/env'

// One id per run, shared by all workers (they inherit the runner's environment), so every
// entity a run creates carries the same recognisable suffix.
if (!process.env.FDP_RUN_ID) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  process.env.FDP_RUN_ID = `${stamp}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Projects (pick with --project, or through ./run.sh <suite>):
 *   setup   logs in through the login page and stores the session      (always runs first)
 *   smoke   read-only checks: pages render, auth guards, RDF downloads
 *   root    root (FAIR Data Point) edit form
 *   flow    full metadata lifecycle: create / edit / import / publish / search / delete
 *   admin   users, API keys, schemas, resource definitions, settings
 *   excel   Excel/CSV import through the extractor (needs FDP_EXCEL_FILE)
 *   cleanup removes anything a failed run left behind                  (always runs last)
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './reports/artifacts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
    ['./support/summary-reporter.ts'],
  ],
  use: {
    baseURL: env.uiUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1400, height: 1000 },
    headless: process.env.HEADED !== '1',
    launchOptions: { slowMo: Number(process.env.SLOWMO || 0) },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      teardown: 'cleanup',
    },
    {
      name: 'cleanup',
      testMatch: /cleanup\.teardown\.ts/,
    },
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 1000 }, storageState: paths.authState },
    },
    {
      name: 'root',
      testMatch: /root\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 1000 }, storageState: paths.authState },
    },
    {
      name: 'flow',
      testMatch: /flow\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 1000 }, storageState: paths.authState },
    },
    {
      name: 'admin',
      testMatch: /admin\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 1000 }, storageState: paths.authState },
    },
    {
      name: 'excel',
      testMatch: /excel\.spec\.ts/,
      dependencies: ['setup'],
      timeout: env.excelTimeoutMs + 120_000,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 1000 }, storageState: paths.authState },
    },
  ],
})
