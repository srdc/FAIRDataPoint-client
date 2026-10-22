import { test as teardown } from '@playwright/test'
import { FdpApi, readCreated, clearCreated } from '../support/api'
import { env } from '../support/env'
import { names } from '../support/data'

const ORDER = ['distribution', 'csvw', 'dataset', 'catalog']

teardown('remove what the run left behind', async () => {
  if (!env.cleanup) {
    teardown.info().annotations.push({ type: 'skipped', description: 'FDP_CLEANUP=0: entities kept' })
    return
  }
  const entries = readCreated()

  const api = await FdpApi.login()
  try {
    const sorted = [...entries].sort((a, b) => {
      const ra = ORDER.indexOf(a.prefix)
      const rb = ORDER.indexOf(b.prefix)
      return (ra === -1 ? ORDER.length : ra) - (rb === -1 ? ORDER.length : rb)
    })
    for (const entry of [...sorted].reverse()) {
      await api.publish(entry.prefix, entry.id).catch(() => undefined)
    }

    const failed: string[] = []
    for (const entry of sorted) {
      const status = await api.delete(entry.prefix, entry.id)
      if (![200, 204, 404].includes(status)) failed.push(`${entry.prefix}/${entry.id} (HTTP ${status})`)
    }

    const users = await api.users()
    for (const user of users.filter((u) => u.email === names.user.email)) {
      const status = await api.deleteUser(user.uuid)
      if (![200, 204, 404].includes(status)) failed.push(`user ${user.email} (HTTP ${status})`)
    }

    if (failed.length) {
      console.warn(`Cleanup could not delete: ${failed.join(', ')}`)
    } else {
      clearCreated()
    }
  } finally {
    await api.dispose()
  }
})
