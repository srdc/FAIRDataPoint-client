<template>
  <div>
    <breadcrumbs
      v-if="breadcrumbs && breadcrumbs.length > 0"
      :links="breadcrumbs"
      :current="entity.title"
    />
    <status-flash :status="status" />
    <page
      v-if="entity !== null"
      :title="title"
      :content-only="true"
    >
      <template
        v-if="isRepository && isIndex"
        #pagenav
      >
        <ul class="nav nav-tabs nav-fill mb-4 mt-4">
          <li class="nav-item">
            <a
              class="nav-link"
              :class="{'active': viewIndex}"
              href="#"
              @click.prevent="setViewIndex(true)"
            >Index</a>
          </li>
          <li class="nav-item">
            <a
              class="nav-link"
              :class="{'active': !viewIndex}"
              href="#"
              @click.prevent="setViewIndex(false)"
            >Metadata</a>
          </li>
        </ul>
      </template>
      <template
        v-if="!viewIndex"
        #actions
      >
        <membership-badge :entity="meta" />
        <button
          v-if="actionEnabled('publish') && isDraft && (isAdmin || permissions.hasWrite(meta))"
          class="btn btn-link"
          data-cy="publish"
          @click="publishEntity"
        >
          <fa :icon="['fas', 'file-export']" />
          Publish
        </button>
        <router-link
          v-if="actionEnabled('edit') && (isAdmin || permissions.hasWrite(meta))"
          class="btn btn-link"
          :to="actionUrl('edit')"
          data-cy="edit"
        >
          <fa :icon="['fas', 'edit']" />
          Edit
        </router-link>
        <router-link
          v-if="actionEnabled('settings') && (isAdmin || permissions.hasWrite(meta))"
          class="btn btn-link"
          :to="actionUrl('settings')"
          data-cy="settings"
        >
          <fa :icon="['fas', 'cog']" />
          Settings
        </router-link>
        <a
          v-if="actionEnabled('delete') && isAdmin"
          class="btn btn-link text-danger"
          data-cy="delete"
          @click="deleteEntity"
        >
          <fa :icon="['far', 'trash-alt']" />
          Delete
        </a>
      </template>
      <template
        v-if="viewIndex"
        #content
      >
        <fair-data-points />
      </template>
      <template
        v-else
        #content
      >
        <p class="description">
          {{ entity.description }}
        </p>
        <p class="external-links">
          <a
            v-for="link in extraLinks"
            :key="link.url"
            class="btn btn-primary btn-rounded mr-3 mb-3"
            :href="link.url"
            target="_blank"
            data-cy="external-link"
          >
            <fa :icon="link.icon" />
            {{ link.label }}
          </a>
        </p>

        <div class="row">
          <div class="col-12 metadata-column"
               :class="{'col-xl-5': !!itemLists && itemLists.length > 0}">
            <entity-metadata
              :metadata="metadata"
              :no-truncate="config.hasPagedContent"
              @remove-inline-child="removeInlineChild"
            />
            <div class="mt-4">
              <a
                class="btn btn-outline-primary btn-rounded mr-2"
                :href="`${downloadUrl}?format=ttl`"
                target="_blank"
              ><fa :icon="['fas', 'download']" /> ttl</a>
              <a
                class="btn btn-outline-primary btn-rounded mr-2"
                :href="`${downloadUrl}?format=rdf`"
                target="_blank"
              ><fa :icon="['fas', 'download']" /> rdf+xml</a>
              <a
                class="btn btn-outline-primary btn-rounded mr-2"
                :href="`${downloadUrl}?format=jsonld`"
                target="_blank"
              ><fa :icon="['fas', 'download']" /> json-ld</a>
            </div>
          </div>
          <div class="col-12 col-xl-7">
            <ul
              v-if="itemLists && itemLists.length > 1"
              class="nav nav-tabs item-list-nav"
            >
              <li
                v-for="(itemList, index) in itemLists"
                :key="`item-menu-${index}`"
                class="nav-item"
              >
                <a
                  class="nav-link"
                  :class="{'active': activeItemList == itemList}"
                  @click.prevent="setActiveItemList(itemList)"
                >
                  {{ itemList.title }}
                </a>
              </li>
            </ul>
            <item-list
              v-if="activeItemList"
              :key="activeItemList.childUrlPrefix"
              :config="config"
              :child-spec="activeItemList.childSpec"
              :meta="meta"
              :child-url-prefix="activeItemList.childUrlPrefix"
              :entity-id="entityId"
              :title="activeItemList.title"
              :create-link="activeItemList.createLink"
              :import-link="activeItemList.importLink"
              data-cy="item-list"
            />
          </div>
        </div>

        <div
          v-if="config.hasPagedContent && graph"
          class="csvw-content"
          data-cy="content-pager"
        >
          <csvw-table
            :graph="graph"
            :subject="subject"
            :sort="contentSort"
            :order="contentOrder"
            :loading="contentLoading"
            @sort="setContentSort"
          >
            <template #toolbar>
              <div
                v-if="contentTotal > 0"
                class="content-pager__info"
              >
                <span>
                  Variables {{ contentFrom }}&ndash;{{ contentTo }} of {{ contentTotal }}
                </span>
                <label class="content-pager__size">
                  Per page
                  <select
                    :value="contentPageSize"
                    class="form-control form-control-sm"
                    :disabled="contentLoading"
                    @change="setContentPageSize(parseInt($event.target.value, 10))"
                  >
                    <option
                      v-for="pageSize in contentPageSizes"
                      :key="pageSize"
                      :value="pageSize"
                    >
                      {{ pageSize }}
                    </option>
                  </select>
                </label>
              </div>
            </template>
          </csvw-table>
          <pagination
            v-if="contentTotal > 0"
            :last-page="contentLastPage"
            :current-page="contentPage"
            @pageSelected="loadContentPage"
          />
        </div>
      </template>
    </page>
  </div>
</template>
<script lang="ts">
import { Component } from 'vue-property-decorator'
import axios from 'axios'
import _ from 'lodash'
import parseLinkHeader from 'parse-link-header'
import Graph from '@/rdf/Graph'
import { DCT } from '@/rdf/namespaces'
import Breadcrumbs from '@/components/Breadcrumbs/index.vue'
import CsvwTable from '@/components/CsvwTable/index.vue'
import EntityMetadata from '@/components/EntityMetadata/index.vue'
import ItemList from '@/components/ItemList/index.vue'
import MembershipBadge from '@/components/MembershipBadge/index.vue'
import Page from '@/components/Page/index.vue'
import Pagination from '@/components/Pagination/index.vue'
import StatusFlash from '@/components/StatusFlash/index.vue'
import metadata from '@/utils/metadata'
import permissions from '@/utils/permissions'
import rdfUtils from '@/rdf/utils'
import fieldUtils from '@/components/ShaclForm/fieldUtils'
import { parseSHACLView } from '@/components/ShaclForm/Parser/SHACLViewParser'
import EntityBase from '@/components/EntityBase'
import FairDataPoints from '@/components/FairDataPoints/index.vue'
import config from '@/config'
import { SortKey, SortOrder } from '@/utils/csvw'

const CSVW_TABLE = 'http://www.w3.org/ns/csvw#table'

@Component({
  components: {
    FairDataPoints,
    Breadcrumbs,
    CsvwTable,
    EntityMetadata,
    ItemList,
    MembershipBadge,
    Page,
    Pagination,
    StatusFlash,
  },
})
export default class EntityView extends EntityBase {
  createLink: string = null

  extraLinks: any[] = []

  itemLists: any = null

  activeItemList: any = null

  meta: any = null

  metadata: any = null

  groups: any = null

  viewIndex: any = null

  contentPage = 0

  contentPageSize = config.defaultContentPageSize

  contentTotal: number = null

  contentLastPage = 0

  contentSort: SortKey = 'name'

  contentOrder: SortOrder = 'asc'

  contentLoading = false

  requestSeq = 0

  get contentPageSizes() {
    return config.contentPageSizes
  }

  get contentFrom() {
    return this.contentPage * this.contentPageSize + 1
  }

  get contentTo() {
    return Math.min((this.contentPage + 1) * this.contentPageSize, this.contentTotal)
  }

  get permissions() {
    return permissions
  }

  get canCreateChild() {
    return this.config.hasChildren
      && (this.isAdmin || this.config.canCreateChild(this.isAuthenticated, this.meta))
  }

  get isDraft() {
    return _.get(this.meta, 'state.current') === 'DRAFT'
  }

  get title() {
    if (this.viewIndex) return 'FAIR Data Points'
    return this.isDraft ? `[DRAFT] ${this.entity.title}` : this.entity.title
  }

  get isRepository() {
    return this.config.isRepository
  }

  get downloadUrl(): string {
    const prefix = this.config.urlPrefix
    return prefix ? `${config.apiURL}/${prefix}/${this.entityId}` : `${config.apiURL}/`
  }

  get isIndex() {
    return config.isIndex()
  }

  actionEnabled(action: string): boolean {
    return _.includes(this.config.viewActions, action)
  }

  actionUrl(action: string): string {
    const { path } = this.$route
    return _.endsWith('/', path) ? `${path}${action}` : `${path}/${action}`
  }

  setActiveItemList(itemList) {
    this.activeItemList = itemList
  }

  setViewIndex(value) {
    this.viewIndex = value
  }

  reset() {
    this.metadata = null
    this.itemLists = null
    this.activeItemList = null
    this.meta = null
    this.extraLinks = []
    this.createLink = null
    this.groups = null
    this.contentPage = 0
    this.contentTotal = null
    this.contentLastPage = 0
    this.contentLoading = false
    this.contentSort = 'name'
    this.contentOrder = 'asc'
  }

  async fetchData(): Promise<void> {
    this.requestSeq += 1
    const seq = this.requestSeq
    try {
      this.viewIndex = this.isIndex && this.isRepository

      this.status.setPending()
      const [entity, spec, meta] = await this.loadData()
      if (seq !== this.requestSeq) return

      this.contentLoading = false
      this.buildGraph(entity.data)
      this.setContentPaging(entity)
      this.groups = parseSHACLView(spec.data, this.config.targetClasses)

      this.meta = meta.data
      this.metadata = this.createMetadata()
      this.extraLinks = this.config.getLinks(this.graph)
      this.breadcrumbs = this.config.createBreadcrumbs(this.meta.path, this.subject)

      if (this.config.hasChildren) {
        this.itemLists = this.config.createChildrenLists(this.canCreateChild, this.entityId)
        this.activeItemList = _.first(this.itemLists)
      }

      this.status.setDone()

      // After setDone so the page renders immediately; the titles arrive a moment later.
      this.resolveInlineChildTitles()
    } catch (error) {
      if (seq !== this.requestSeq) return
      this.status.setErrorFromResponse(error, 'Unable to get data.')
    }
  }

  async loadData() {
    return axios.all([
      this.loadEntity(),
      this.config.api.getSpec(),
      this.config.api.getMeta(this.entityId),
    ])
  }

  loadEntity() {
    return this.config.hasPagedContent
      ? this.config.api.getContentPage(
        this.entityId,
        this.contentPage,
        this.contentPageSize,
        this.contentSort,
        this.contentOrder,
      )
      : this.config.api.get(this.entityId)
  }

  setContentPaging(response) {
    if (!this.config.hasPagedContent) return

    const total = parseInt(_.get(response.headers, 'x-total-count'), 10)
    const links = parseLinkHeader(_.get(response.headers, 'link'))
    const lastPage = parseInt(_.get(links, 'last.page'), 10)
    this.contentTotal = Number.isNaN(total) ? null : total
    this.contentLastPage = Number.isNaN(lastPage) ? 0 : lastPage
  }

  async loadContentPage(
    page: number,
    size: number = this.contentPageSize,
    sort: SortKey = this.contentSort,
    order: SortOrder = this.contentOrder,
  ): Promise<void> {
    const previousPage = this.contentPage
    const previousSize = this.contentPageSize
    const previousSort = this.contentSort
    const previousOrder = this.contentOrder
    this.requestSeq += 1
    const seq = this.requestSeq
    try {
      this.contentLoading = true
      this.contentPage = page
      this.contentPageSize = size
      this.contentSort = sort
      this.contentOrder = order
      const entity = await this.loadEntity()
      if (seq !== this.requestSeq) return
      this.buildGraph(entity.data)
      this.setContentPaging(entity)
      this.metadata = this.createMetadata()
      this.status.setDone()
    } catch (error) {
      if (seq !== this.requestSeq) return
      this.contentPage = previousPage
      this.contentPageSize = previousSize
      this.contentSort = previousSort
      this.contentOrder = previousOrder
      this.status.setErrorFromResponse(error, 'Unable to get data.')
    } finally {
      if (seq === this.requestSeq) {
        this.contentLoading = false
      }
    }
  }

  setContentPageSize(size: number): void {
    this.loadContentPage(0, size)
  }

  setContentSort(key: SortKey): void {
    const order = key === this.contentSort && this.contentOrder === 'asc' ? 'desc' : 'asc'
    this.loadContentPage(0, this.contentPageSize, key, order)
  }

  createMetadata() {
    return [
      ...metadata.commonMetadata(this.graph),
      ...this.createLocalMetadata(),
    ]
  }

  createLocalMetadata() {
    return this.groups
      .map((group) => ({
        fields: group.fields
          // A CSVW Table Group's variables are shown in their own table below
          .filter((fieldConfig) => !this.config.hasPagedContent || fieldConfig.path !== CSVW_TABLE)
          .map((fieldConfig) => this.withInlineChildActions(
            fieldConfig,
            metadata.fromShaclField(this.graph, fieldConfig),
          ))
          .filter((field) => field !== null),
        label: group.label,
        comment: group.comment,
      }))
  }

  withInlineChildActions(fieldConfig, field) {
    const child = this.config.inlineChildSpec(fieldConfig.path)
    if (!child || !this.canCreateChild) {
      return field
    }

    return {
      ...(field || metadata.field(fieldUtils.getName(fieldConfig), [])),
      inlineChild: {
        childUrlPrefix: this.config.getChildUrlPrefix(child),
        createLink: this.config.createChildUrl(child, this.entityId),
        importLink: this.config.importChildUrl(child, this.entityId),
        emptyText: `No ${child.listView.title} yet.`,
      },
    }
  }

  /**
   * Replaces the bare id shown for an inline child with its dct:title
   */
  async resolveInlineChildTitles(): Promise<void> {
    const inlineChildren: { uri: string, urlPrefix: string }[] = (this.metadata || [])
      .flatMap((group) => group.fields || [])
      .filter((field) => field && field.inlineChild && !_.isEmpty(field.items))
      .flatMap((field) => field.items
        .filter((item) => item.uri)
        .map((item) => ({ uri: item.uri, urlPrefix: field.inlineChild.childUrlPrefix })))
    const children = _.uniqBy(inlineChildren, 'uri')
    if (children.length === 0) return

    const metadataSnapshot = this.metadata
    const titles = new Map<string, string>()

    await Promise.all(children.map(async ({ uri, urlPrefix }) => {
      try {
        const childConfig = this.$store.getters['entities/config'](urlPrefix)
        const { data } = await childConfig.api.getContentPage(rdfUtils.pathTerm(uri), 0, 1)
        const title = new Graph(data, uri).findOne(DCT('title'))
        if (title) {
          titles.set(uri, `${title}`)
        }
      } catch {
        // The endpoint is unavailable or the child is not accessible, so the id stands.
      }
    }))

    if (titles.size === 0 || this.metadata !== metadataSnapshot) return

    this.metadata = this.metadata.map((group) => ({
      ...group,
      fields: (group.fields || []).map((field) => {
        if (!field || !field.inlineChild || _.isEmpty(field.items)) return field
        return {
          ...field,
          items: field.items.map((item) => (
            item.uri && titles.has(item.uri)
              ? { ...item, label: titles.get(item.uri) }
              : item
          )),
        }
      }),
    }))
  }

  async removeInlineChild({ urlPrefix, uri, label }): Promise<void> {
    if (!window.confirm(`Are you sure you want to delete ${label}?`)) {
      return
    }
    try {
      const childConfig = this.$store.getters['entities/config'](urlPrefix)
      await childConfig.api.delete(rdfUtils.pathTerm(uri))
      await this.fetchData()
    } catch (error) {
      this.status.setErrorFromResponse(error, 'Unable to delete data.')
    }
  }

  async deleteEntity() {
    if (window.confirm(`Are you sure you want to delete ${this.entity.title}?`)) {
      try {
        await this.config.api.delete(this.entityId)
        const parent = _.get(_.last(this.breadcrumbs), 'to', '/')
        await this.$router.push(parent)
      } catch (err) {
        this.status.setError('Unable to delete data.')
      }
    }
  }

  async publishEntity() {
    if (window.confirm(`Are you sure you want to publish ${this.entity.title}?`)) {
      try {
        this.status.setPending()
        await this.config.api.putMetaState(this.entityId, { current: 'PUBLISHED' })
        await this.fetchData()
      } catch (err) {
        this.status.setError('Unable to publish data.')
      }
    }
  }
}
</script>
