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
        <div>
          <input
            v-if="!simpleGraph"
            type="file"
            @change="onFileChange"
          >
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
import {
  parseValidationReport,
  ValidationReport,
} from '@/components/ShaclForm/Parser/ValidationReport'
import { EntityConfig } from '@/entity/EntityConfig'
import EntityBase from '@/components/EntityBase'
import Status from '@/utils/Status'

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

  get createName() {
    return `Import ${this.config.urlPrefix}`
  }

  get subject() {
    return this.parsedSubject || `${config.persistentURL()}/new`
  }

  get isPartOf() {
    return this.parentConfig.subject(this.entityId)
  }

  async fetchData(): Promise<void> {
    try {
      this.status.setPending()

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
    const graph = new Graph(this.uploadedData, this.subject)
    // const matchedSubjects: any = this.config.targetClasses
    //   .reduce((nodes: any, targetClass: any) => {
    //     if (!nodes) {
    //       return graph.store.each(null, RDF('type'), targetClass)
    //     }
    //     return nodes.filter((node) => graph.store.holds(node, RDF('type'), targetClass))
    //   }, null)
    // return _.first<any>(matchedSubjects)?.value
    return _.first<any>(this.config.targetClasses.map((targetClass) => graph.store.any(null, RDF('type'), targetClass)))?.value
  }

  async onFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      this.uploadedData = await file.text()
      const parsedSubject = this.findSubject(this.uploadedData)
      if (!parsedSubject) {
        alert(`Cannot find ${this.config.urlPrefix} in the given file.`)
        return
      }
      this.parsedSubject = parsedSubject
      this.buildGraph(this.uploadedData)
      this.simpleGraph = new Graph(this.uploadedData, this.subject)
      this.simpleGraph.store.add($rdf.namedNode(this.subject), DCT('isPartOf'), $rdf.namedNode(this.isPartOf))
      const keywords = this.simpleGraph.store.match($rdf.namedNode(this.subject), DCAT('keyword'), null)
      keywords.forEach((triple) => {
        this.simpleGraph.store.remove(triple)
        const lower = $rdf.literal(_.lowerCase(triple.object.value))
        this.simpleGraph.store.add(this.subject, DCAT('keyword'), lower)
      })
    } catch (err) {
      this.rawError = _.get(err, 'response.data', 'Cannot read the file.')
    }
  }
}
</script>
