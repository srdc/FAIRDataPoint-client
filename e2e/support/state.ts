import fs from 'fs'
import path from 'path'
import { ensureStateDir, paths } from './env'
import { runId } from './data'

/**
 * Ids the flow hands from one step to the next
 */
export type FlowIds = { catalog?: string, dataset?: string, distribution?: string, csvw?: string }

const file = path.join(path.dirname(paths.created), `flow-${runId}.json`)

export const flowState = {
  get(): FlowIds {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return {}
    }
  },
  set(update: FlowIds): void {
    ensureStateDir()
    fs.writeFileSync(file, JSON.stringify({ ...flowState.get(), ...update }, null, 2))
  },
}
