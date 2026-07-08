import _ from 'lodash'
import config from '@/config'
import request from '../request'

/**
 * IRI label resolution
 */

const labels = new Map<string, string>()
const misses = new Set<string>()
const pending = new Map<string, Promise<string>>()

function isResolvable(url: string): boolean {
  return /^https?:\/\//i.test(url) && !url.startsWith(config.persistentURL())
}

function fetchLabel(url: string): Promise<string> {
  const promise = request.get(`/label?iri=${encodeURIComponent(url)}`)
    .then((response) => {
      pending.delete(url)
      return _.get(response, 'data.label', '') as string
    }, (error) => {
      pending.delete(url)
      throw error
    })
  pending.set(url, promise)
  return promise
}

export default {
  async getLabel(url: string) {
    if (labels.has(url)) {
      return { data: { label: labels.get(url), language: '' } }
    }
    if (!url || misses.has(url) || !isResolvable(url)) {
      throw new Error(`No label available for ${url}`)
    }
    const label = await (pending.get(url) || fetchLabel(url))
    if (!label) {
      misses.add(url)
      throw new Error(`No label available for ${url}`)
    }
    labels.set(url, label)
    return { data: { label, language: '' } }
  },
}
