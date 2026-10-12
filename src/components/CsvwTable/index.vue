<template>
  <div
    class="csvw-table"
    :class="{'csvw-table--loading': loading}"
  >
    <section
      v-for="(table, tableIndex) in tables"
      :key="table.id"
      class="csvw-table__section"
    >
      <div class="csvw-table__heading">
        <h2>{{ table.title || 'Variables' }}</h2>
        <a
          v-if="table.url"
          :href="table.url"
          target="_blank"
          class="csvw-table__url"
        >{{ table.url }}</a>
        <ul
          v-if="table.keywords.length > 0"
          class="csvw-table__keywords"
        >
          <li
            v-for="keyword in table.keywords"
            :key="keyword"
          >
            {{ keyword }}
          </li>
        </ul>
      </div>
      <slot
        v-if="tableIndex === 0"
        name="toolbar"
      />
      <div class="csvw-table__scroll">
        <table class="csvw-table__grid">
          <thead>
            <tr>
              <th
                v-for="column in sortKeys"
                :key="column.key"
                :class="`csvw-table__col--${column.key}`"
                :aria-sort="ariaSort(column.key)"
              >
                <button
                  type="button"
                  class="csvw-table__sort"
                  :class="{'csvw-table__sort--active': sort === column.key}"
                  :disabled="loading"
                  :data-cy="`csvw-sort-${column.key}`"
                  @click="$emit('sort', column.key)"
                >
                  {{ column.label }}
                  <span
                    class="csvw-table__sort-icon"
                    aria-hidden="true"
                  >{{ sortIcon(column.key) }}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in table.rows"
              :key="row.id"
            >
              <td class="csvw-table__col--name">
                {{ row.name.join(', ') }}
              </td>
              <td class="csvw-table__col--title">
                {{ row.title.join(' / ') }}
              </td>
              <td class="csvw-table__col--description">
                {{ row.description.join(' / ') }}
              </td>
              <td class="csvw-table__col--datatype">
                {{ row.datatypeLabels.join(', ') }}
              </td>
              <td class="csvw-table__col--propertyUrl">
                <a
                  v-for="link in row.propertyLinks"
                  :key="link.url"
                  :href="link.url"
                  :title="link.url"
                  target="_blank"
                >{{ link.label }}</a>
              </td>
            </tr>
            <tr v-if="table.rows.length === 0">
              <td
                :colspan="sortKeys.length"
                class="csvw-table__empty"
              >
                No variables on this page.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import Graph from '@/rdf/Graph'
import {
  readTables, SORT_KEYS, SortKey, SortOrder, VariableTable,
} from '@/utils/csvw'

/**
 * The variables (csvw:column) of one page of a CSVW Table Group, one row per variable
 */
@Component
export default class CsvwTable extends Vue {
  @Prop({ required: true })
  readonly graph: Graph

  @Prop({ type: String, required: true })
  readonly subject: string

  @Prop({ type: String, default: 'name' })
  readonly sort: SortKey

  @Prop({ type: String, default: 'asc' })
  readonly order: SortOrder

  @Prop({ type: Boolean, default: false })
  readonly loading: boolean

  get sortKeys() {
    return SORT_KEYS
  }

  get tables(): VariableTable[] {
    if (!this.graph) return []
    return readTables(this.graph, this.subject, this.sort, this.order)
  }

  sortIcon(key: SortKey): string {
    if (key !== this.sort) return '↕'
    return this.order === 'desc' ? '▼' : '▲'
  }

  ariaSort(key: SortKey): string {
    if (key !== this.sort) return 'none'
    return this.order === 'desc' ? 'descending' : 'ascending'
  }
}
</script>
