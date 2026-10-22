import { test as setup, expect } from '@playwright/test'
import { env, paths, requirePassword, ensureStateDir } from '../support/env'
import { FdpApi } from '../support/api'
import { appPath, goto } from '../support/ui'

setup('log in through the login page', async ({ page }) => {
  ensureStateDir()

  const api = await FdpApi.login()
  const me = await api.currentUser()
  await api.dispose()
  expect(me.role, `${env.user} must be an ADMIN account (FDP_USER)`).toBe('ADMIN')

  await goto(page, '/login')
  await page.locator('input[name=email]').fill(env.user)
  await page.locator('input[name=password]').fill(requirePassword())
  await page.locator('[data-cy=login]').click()

  // A failed login stays on /login with "Login failed".
  await expect(page.locator('.status-flash__alert--danger')).toHaveCount(0)
  await page.waitForURL((url) => appPath(url.toString()) === '/', { timeout: 30_000 })
  await expect(page.locator('[data-cy=user-menu]')).toBeVisible()

  await page.context().storageState({ path: paths.authState })
})
