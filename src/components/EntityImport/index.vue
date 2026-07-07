<template>
  <div>
    <breadcrumbs
      v-if="breadcrumbs !== null"
      :links="breadcrumbs"
      :current="createName"
    />
    <status-flash :status="status" />
    <page
      :title="createName"
      content-only
    >
      <template #content>
        <status-flash :status="submitStatus">
          <template
            v-if="rawError !== null"
            #extra-content
          >
            <div class="mt-2">
              <a
                v-b-toggle.raw-error
                class="collapse-link"
              >
                View report
                <fa
                  :icon="['fas', 'angle-down']"
                  class="rotate-icon"
                />
              </a>

              <b-collapse id="raw-error">
                <prism-editor
                  v-model="rawError"
                  language="turtle"
                  :readonly="true"
                  class="mt-2"
                />
              </b-collapse>
            </div>
          </template>
        </status-flash>

        <div v-if="!simpleGraph">
          <div class="form-group">
            <label>Import source</label>
            <select
              v-model="importSource"
              class="form-control"
              data-cy="import-source"
            >
              <option value="ttl">
                Turtle / RDF file
              </option>
              <option value="excel">
                Excel / cohort dictionary
              </option>
            </select>
          </div>

          <!-- Existing TTL file import -->
          <div v-if="importSource === 'ttl'">
            <input
              type="file"
              accept=".ttl,.rdf,.txt"
              data-cy="import-ttl-file"
              @change="onFileChange"
            >
          </div>

          <!-- Excel / Kora / NFBC import via the extractor service -->
          <div v-else>
            <div class="form-group">
              <label>Format / cohort</label>
              <select
                v-model="excelMode"
                class="form-control"
                data-cy="excel-mode"
              >
                <option value="standard">
                  Standardized workbook (.xlsx)
                </option>
                <option value="kora">
                  KORA raw dictionary (.xlsx)
                </option>
                <option value="nfbc">
                  NFBC raw dictionary (.csv)
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>File</label>
              <input
                :key="excelMode"
                type="file"
                :accept="excelAccept"
                data-cy="excel-file"
                @change="onExcelFileChange"
              >
            </div>
            <div
              v-if="config.hasChildren"
              class="form-group"
            >
              <label>
                <input
                  v-model="fullPipeline"
                  type="checkbox"
                  data-cy="full-pipeline"
                >
                Full pipeline run (publish this layer and all child layers, no preview)
              </label>
            </div>
            <div
              v-if="!fullPipeline"
              class="form-group"
            >
              <label>
                <input
                  v-model="skipPreview"
                  type="checkbox"
                  data-cy="skip-preview"
                >
                Publish directly without preview (recommended for large layers like CSVW)
              </label>
            </div>
            <button
              class="btn btn-primary btn-rounded"
              :disabled="extractStatus.isPending() || submitStatus.isPending() || !excelFile"
              data-cy="excel-extract"
              @click.prevent="runExcel"
            >
              <span v-if="extractStatus.isPending() || submitStatus.isPending()">Extracting…</span>
              <span v-else-if="fullPipeline">Extract &amp; publish all layers</span>
              <span v-else>Extract &amp; preview</span>
            </button>
            <status-flash
              :status="extractStatus"
              class="mt-2"
            />
            <pre
              v-if="extractLog"
              class="extract-log mt-2"
            >{{ extractLog }}</pre>
          </div>
        </div>
        <div v-if="simpleGraph">
          <shacl-form
            :rdf="simpleGraph.store"
            :shacl="shacl"
            :target-classes="config.targetClasses"
            :subject="subject"
            :validation-report="validationReport"
            :submit-status="submitStatus"
            :fill-defaults="true"
            @submit="onSubmit"
          />
        </div>
      </template>
    </page>
  </div>
</template>
<script lang="ts">
import { Component, Prop } from 'vue-property-decorator'
import axios from 'axios'
import _ from 'lodash'
import * as $rdf from 'rdflib'
import PrismEditor from 'vue-prism-editor'
import ShaclForm from '@/components/ShaclForm/index.vue'
import Breadcrumbs from '@/components/Breadcrumbs/index.vue'
import Page from '@/components/Page/index.vue'
import StatusFlash from '@/components/StatusFlash/index.vue'
import Graph from '@/rdf/Graph'
import { DCT, DCAT, RDF } from '@/rdf/namespaces'
import config from '@/config'
import api from '@/api'
import {
  parseValidationReport,
  ValidationReport,
} from '@/components/ShaclForm/Parser/ValidationReport'
import { EntityConfig } from '@/entity/EntityConfig'
import EntityBase from '@/components/EntityBase'
import Status from '@/utils/Status'

const IS_PART_OF_RE = /(\bdct(?:erms)?:isPartOf\b|<http:\/\/purl\.org\/dc\/terms\/isPartOf>)(\s+)<[^>]*>/g

@Component({
  components: {
    Breadcrumbs,
    Page,
    PrismEditor,
    StatusFlash,
    ShaclForm,
  },
})
export default class EntityImport extends EntityBase {
  @Prop({ required: true })
  readonly parentConfig: EntityConfig

  shacl: any = null

  validationReport: ValidationReport = {}

  submitStatus: Status = new Status()

  rawError: string = null

  uploadedData: string = null

  simpleGraph : Graph = null

  parsedSubject: string = null

  // Import source: 'ttl' (upload a Turtle file) or 'excel' (extractor service)
  importSource: 'ttl' | 'excel' = 'ttl'

  excelMode: 'standard' | 'kora' | 'nfbc' = 'standard'

  excelFile: File = null

  fullPipeline: boolean = false

  extractStatus: Status = new Status()

  extractLog: string = ''

  skipPreview: boolean = false

  get createName() {
    return `Import ${this.config.urlPrefix}`
  }

  get subject() {
    return this.parsedSubject || `${config.persistentURL()}/new`
  }

  get isPartOf() {
    return this.parentConfig.subject(this.entityId)
  }

  get excelAccept() {
    return this.excelMode === 'nfbc' ? '.csv' : '.xlsx'
  }

  async fetchData(): Promise<void> {
    try {
      this.status.setPending()

      this.skipPreview = this.config.urlPrefix === 'csvw'

      const [spec, meta] = await this.loadData()

      if (this.isAdmin || this.parentConfig.canCreateChild(this.isAuthenticated, meta.data)) {
        this.shacl = spec.data
        // this.graph = new Graph('', this.subject)
        // this.graph.store.add($rdf.namedNode(this.subject), DCT('isPartOf'),
        // $rdf.namedNode(this.isPartOf), null)
        this.breadcrumbs = this.parentConfig.createBreadcrumbsWithSelf(
          meta.data.path,
          this.parentConfig.subject(this.entityId),
        )
        this.status.setDone()
      } else {
        await this.$router.replace(this.parentConfig.toUrl(this.entityId))
      }
    } catch (error) {
      this.status.setErrorFromResponse(error, 'Unable to get metadata.')
    }
  }

  async loadData() {
    return axios.all([
      this.config.api.getSpec(),
      this.parentConfig.api.getMeta(this.entityId),
    ])
  }

  async onSubmit(turtle: string): Promise<void> {
    try {
      this.submitStatus.setPending()
      const response = await this.config.api.post(turtle)
      const entityId = _.last(_.get(response, 'headers.location', '').split('/'))
      await this.$router.push(this.config.toUrl(entityId))
    } catch (error) {
      this.rawError = _.get(error, 'response.data', null)
      const validationReport = parseValidationReport(this.rawError)
      const focusNodeReport = _.first(Object.values(validationReport)) || {}
      this.validationReport = { [this.subject]: focusNodeReport }
      this.submitStatus.setError('Unable to save entity data.')
      window.scrollTo(0, 0)
    }
  }

  findSubject(data: string) {
    const graph = new Graph(data, this.subject)
    // Return the first targetClass that ACTUALLY matches a subject. Plain _.first on
    // the mapped array returns undefined whenever the first targetClass has no match
    // (e.g. extractor output types a catalog only as dcat:Catalog, not the base
    // dcat:Resource), so compact out the misses before taking the first.
    const matches = _.compact(this.config.targetClasses
      .map((targetClass) => graph.store.any(null, RDF('type'), targetClass)))
    return _.first<any>(matches)?.value
  }

  loadFromTurtle(turtle: string) {
    this.uploadedData = turtle
    const parsedSubject = this.findSubject(this.uploadedData)
    if (!parsedSubject) {
      alert(`Cannot find ${this.config.urlPrefix} in the given file.`)
      return
    }
    this.parsedSubject = parsedSubject
    this.buildGraph(this.uploadedData)
    this.simpleGraph = new Graph(this.uploadedData, this.subject)
    const subjectNode = $rdf.namedNode(this.subject)
    // The source may already carry an isPartOf (extractor output points at
    // job-local/adapter URIs). Drop it first, otherwise the entity ends up
    // with two isPartOf values and never connects to the real parent.
    this.simpleGraph.store.match(subjectNode, DCT('isPartOf'), null)
      .forEach((triple) => this.simpleGraph.store.remove(triple))
    this.simpleGraph.store.add(subjectNode, DCT('isPartOf'), $rdf.namedNode(this.isPartOf))
    const keywords = this.simpleGraph.store.match(subjectNode, DCAT('keyword'), null)
    keywords.forEach((triple) => {
      this.simpleGraph.store.remove(triple)
      const lower = $rdf.literal(_.lowerCase(triple.object.value))
      this.simpleGraph.store.add(this.subject, DCAT('keyword'), lower)
    })
  }

  relinkTurtle(turtle: string, entityConfig: EntityConfig, parentUri: string):
    { turtle: string, subject: string } {
    const graph = new Graph(turtle, `${config.persistentURL()}/new`)
    const subject = _.first<any>(_.compact(entityConfig.targetClasses
      .map((targetClass) => graph.store.any(null, RDF('type'), targetClass))))?.value
    if (!subject) {
      throw new Error(`Cannot find ${entityConfig.urlPrefix} in the extracted RDF.`)
    }
    let replaced = 0
    const out = turtle.replace(IS_PART_OF_RE, (match, predicate, spacing) => {
      replaced += 1
      return `${predicate}${spacing}<${parentUri}>`
    })
    if (replaced > 0) {
      return { turtle: out, subject }
    }
    return {
      turtle: `${turtle}\n<${subject}> <${DCT('isPartOf').value}> <${parentUri}> .\n`,
      subject,
    }
  }

  /**
   * Publish the imported TTL directly, bypassing the SHACL-form preview.
   * Relinks the entity to its parent by text substitution and POSTs the
   * original (valid) turtle. Used for large layers (e.g. CSVW) that would
   * freeze the browser if rendered as a form.
   */
  async publishDirect(turtle: string): Promise<void> {
    try {
      this.submitStatus.setPending()
      this.rawError = null
      const { turtle: out, subject } = this.relinkTurtle(turtle, this.config, this.isPartOf)
      this.parsedSubject = subject
      const response = await this.config.api.post(out)
      const entityId = _.last(_.get(response, 'headers.location', '').split('/'))
      await this.$router.push(this.config.toUrl(entityId))
    } catch (error) {
      this.rawError = _.get(error, 'response.data', null)
      const validationReport = parseValidationReport(this.rawError)
      const focusNodeReport = _.first(Object.values(validationReport)) || {}
      this.validationReport = { [this.subject]: focusNodeReport }
      this.submitStatus.setError('Unable to save entity data.')
      window.scrollTo(0, 0)
    }
  }

  async onFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      if (this.skipPreview) {
        await this.publishDirect(text)
      } else {
        this.loadFromTurtle(text)
      }
    } catch (err) {
      this.rawError = _.get(err, 'response.data', 'Cannot read the file.')
    }
  }

  onExcelFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    this.excelFile = input.files?.[0] || null
  }

  get usesExistingCatalog(): boolean {
    return this.config.urlPrefix === 'dataset' && !this.parentConfig.isRepository
  }

  async runExcel() {
    if (!this.excelFile) {
      alert('Select an Excel/CSV file first.')
      return
    }
    try {
      this.extractStatus.setPending()
      this.extractLog = ''
      this.rawError = null

      // No job type: without a FHIR source the adapter's job only picks
      // job-suffixed workbook sheets; blank runs one generic metadata pass.
      const { data: created } = await api.excelExtraction.create(this.excelFile, {
        mode: this.excelMode,
        catalogUri: this.usesExistingCatalog ? this.isPartOf : undefined,
      })
      const final = await api.excelExtraction.waitForCompletion(created.jobId, {
        onTick: (s) => { this.extractLog = s.log },
      })
      if (final.status === 'error') {
        this.extractStatus.setError(final.error || 'Extraction failed.')
        return
      }

      if (this.fullPipeline && this.config.hasChildren) {
        this.extractStatus.setDone()
        await this.publishPipeline(created.jobId)
        return
      }

      // Fetch only the layer matching this route's entity (e.g. dataset).
      const entity = this.config.urlPrefix
      const { data: ttl } = await api.excelExtraction.resultTtl(created.jobId, entity)
      this.extractStatus.setDone()
      if (this.skipPreview) {
        await this.publishDirect(ttl)
      } else {
        this.loadFromTurtle(ttl)
      }
    } catch (err) {
      this.extractStatus.setErrorFromResponse(err, 'Extraction failed.')
    }
  }

  layerChain(availablePrefixes: Set<string>): EntityConfig[] {
    const chain: EntityConfig[] = []
    let current: EntityConfig = this.config
    while (current && availablePrefixes.has(current.urlPrefix)) {
      chain.push(current)
      const child = _.first(current.children)
      current = child
        ? this.$store.getters['entities/config'](current.getChildUrlPrefix(child))
        : null
    }
    return chain
  }

  /**
   * Full-pipeline publish
   */
  async publishPipeline(jobId: string): Promise<void> {
    let currentLayer = this.config.urlPrefix
    try {
      this.submitStatus.setPending()
      this.rawError = null

      const { data: result } = await api.excelExtraction.result(jobId)
      const ttlByPrefix: Record<string, string> = {}
      result.files.forEach((f) => {
        ttlByPrefix[f.name.replace(/\.ttl$/i, '').toLowerCase()] = f.content
      })

      const chain = this.layerChain(new Set(Object.keys(ttlByPrefix)))
      if (chain.length === 0) {
        this.submitStatus.setError(`The extraction produced no TTL layer for ${this.config.urlPrefix}.`)
        return
      }

      let parentUri = this.isPartOf
      let firstCreatedUrl: string = null
      for (let i = 0; i < chain.length; i += 1) {
        const layerConfig = chain[i]
        currentLayer = layerConfig.urlPrefix
        const { turtle } = this.relinkTurtle(ttlByPrefix[currentLayer], layerConfig, parentUri)
        this.extractLog += `\n[publish] posting ${currentLayer}…`
        /* eslint-disable-next-line no-await-in-loop */
        const response = await layerConfig.api.post(turtle)
        const entityId = _.last(_.get(response, 'headers.location', '').split('/'))
        parentUri = layerConfig.subject(entityId)
        this.extractLog += ` done (${parentUri})`
        if (!firstCreatedUrl) {
          firstCreatedUrl = layerConfig.toUrl(entityId)
        }
      }

      this.submitStatus.setDone()
      await this.$router.push(firstCreatedUrl)
    } catch (error) {
      this.rawError = _.get(error, 'response.data', null)
      this.submitStatus.setError(`Unable to publish ${currentLayer} (layers created before it were kept).`)
      window.scrollTo(0, 0)
    }
  }
}
</script>
<style scoped>
.extract-log {
  max-height: 16rem;
  overflow: auto;
  font-size: 0.8rem;
  background: #f5f5f5;
  padding: 0.5rem;
  white-space: pre-wrap;
}
</style>
