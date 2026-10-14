import axios from 'axios'
import config from '@/config'

/**
 * Client for the stage-fdp-extractor service (Excel / Kora / NFBC -> TTL)
 */

const client = axios.create({
  baseURL: config.extractorURL,
  headers: { Accept: 'application/json' },
})

export type ExtractionMode = 'standard' | 'kora' | 'nfbc'
export type ExtractionJob = 'survey' | 'observation' | 'full'
export type JobStatus = 'queued' | 'mapping' | 'extracting' | 'done' | 'error'

export interface CreateResponse {
  jobId: string
  status: JobStatus
}

export interface StatusResponse {
  jobId: string
  status: JobStatus
  mode: ExtractionMode
  job: ExtractionJob | ''
  createdAt: string
  finishedAt: string | null
  error: string | null
  resultCount: number
  log: string
}

export interface TtlFile {
  name: string
  content: string
}

export interface ResultResponse {
  jobId: string
  files: TtlFile[]
}

interface CreateOptions {
  mode: ExtractionMode
  // Optional: only meaningful for workbooks with job-suffixed sheets
  // (e.g. "Dataset-SURVEY"). Omitted = one generic metadata pass.
  job?: ExtractionJob
  vocabBase?: string
  // URI of an already-published Catalog. When set, the extractor applies the
  // adapter's "Existing Catalog" configuration: the generated Dataset is
  // linked (dct:isPartOf) to this Catalog and no new Catalog is produced.
  catalogUri?: string
}

function create(file: File, opts: CreateOptions) {
  const form = new FormData()
  form.append('file', file)
  form.append('mode', opts.mode)
  if (opts.job) form.append('job', opts.job)
  if (opts.vocabBase) form.append('vocabBase', opts.vocabBase)
  if (opts.catalogUri) form.append('catalogUri', opts.catalogUri)
  return client.post<CreateResponse>('/extractions', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

function status(jobId: string) {
  return client.get<StatusResponse>(`/extractions/${jobId}`)
}

function result(jobId: string) {
  return client.get<ResultResponse>(`/extractions/${jobId}/result`)
}

/**
 * Fetch a single entity layer as text/turtle (Catalog/Dataset/Distribution)
 */
function resultTtl(jobId: string, entity?: string) {
  return client.get<string>(`/extractions/${jobId}/result.ttl`, {
    params: entity ? { entity } : {},
    headers: { Accept: 'text/turtle' },
    responseType: 'text',
    transformResponse: [(d) => d],
  })
}

function health() {
  return client.get('/health')
}

function waitForCompletion(
  jobId: string,
  { intervalMs = 2000, timeoutMs = 10 * 60 * 1000, onTick }:
  { intervalMs?: number; timeoutMs?: number; onTick?: (s: StatusResponse) => void } = {},
): Promise<StatusResponse> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    function poll() {
      status(jobId)
        .then(({ data }) => {
          if (onTick) onTick(data)
          if (data.status === 'done' || data.status === 'error') {
            resolve(data)
            return
          }
          if (Date.now() - started > timeoutMs) {
            reject(new Error('Extraction timed out while polling for completion.'))
            return
          }
          setTimeout(poll, intervalMs)
        })
        .catch(reject)
    }
    poll()
  })
}

export default {
  create,
  status,
  result,
  resultTtl,
  health,
  waitForCompletion,
}
