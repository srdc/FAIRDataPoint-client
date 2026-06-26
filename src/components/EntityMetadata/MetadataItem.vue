<template>
<!--  <li>-->
<!--    &lt;!&ndash; leaf node: has uri or just a label &ndash;&gt;-->
<!--    {{ item.label }}-->
<!--    <rdf-link-->
<!--      v-if="item.uri && !item.items"-->
<!--      :uri="item.uri"-->
<!--      :label="item.uri"-->
<!--      :label-resolved="item.labelResolved"-->
<!--    />-->
<!--    &lt;!&ndash; nested items &ndash;&gt;-->
<!--    <ul v-if="item.items && item.items.length">-->
<!--      <metadata-item-->
<!--        v-for="(child, index) in item.items"-->
<!--        :key="index"-->
<!--        :item="child"-->
<!--      />-->
<!--    </ul>-->
<!--  </li>-->
  <table class="table-auto w-full">
    <thead>
    <tr>
      <th v-for="(col, index) in flatTableRows.columns"
          :key="index" class="text-left">{{ col }}</th>
    </tr>
    </thead>
    <tbody>
    <tr v-for="(row, index) in flatTableRows.values" :key="index">
    <td v-for="(value, index2) in row" :key="index2">
      {{ value || '' }}
    </td>
    </tr>
    </tbody>
  </table>
</template>

<script>

import RdfLink from '@/components/RdfLink/index.vue'

function buildTableFromTree(root) {
  if (!root || !root.items || root.items.length === 0) {
    return { columns: [], values: [] }
  }

  // Top-level items under `root` are your columns
  const columnIds = root.items.map((colNode) => String(colNode.label))

  const columns = ['Field', ...columnIds]
  const rowsMap = new Map() // rowKey -> row array

  // Ensure a row exists for a given field label
  const ensureRow = (rowKey) => {
    let row = rowsMap.get(rowKey)
    if (!row) {
      row = new Array(columns.length).fill('')
      row[0] = rowKey
      rowsMap.set(rowKey, row)
    }
    return row
  }

  // Recursive traversal of a single column
  const visit = (colIndex, node, path) => {
    const newPath = [...path, String(node.label)]

    if (node.items && node.items.length > 0) {
      // Not a leaf: recurse into children
      node.items.forEach((child) => visit(colIndex, child, newPath))
    } else {
      // Leaf: this is an actual "field"
      const rowKey = newPath.join(' → ') // e.g. "Name", or "Location → City"

      const row = ensureRow(rowKey)

      const val = typeof node.value === 'string' ? node.value : (node.value?.label ?? '')

      // +1 because columns[0] is "Field"
      row[colIndex + 1] = val
    }
  }

  // For each column node (e.g. "_g_L11C587"), traverse its children
  root.items.forEach((colNode, colIndex) => {
    if (!colNode.items || colNode.items.length === 0) return

    // Start at children: the column label itself is the column header, *not* part of the path
    colNode.items.forEach((child) => visit(colIndex, child, []))
  })

  const values = Array.from(rowsMap.values())
  return { columns, values }
}

export default {
  name: 'MetadataItem',
  // components: { RdfLink },
  props: {
    item: {
      type: Object,
      required: true,
    },
  },
  computed: {
    flatTableRows() {
      const flat = flattenFields(this.item.items, [this.item.label])
      const columns = []
      const values = []
      // eslint-disable-next-line no-restricted-syntax
      for (const item of flat) {
        const existingIndex = values.findIndex((val) => val[0] === item.path[1])
        if (existingIndex === -1) {
          values.push([])
        }
        const rowIndex = existingIndex !== -1 ? existingIndex : (values.length - 1)
        const row = values[rowIndex]
        const x = [...item.path].concat(item.value || [])
        for (let i = 0; i < x.length; i += 2) {
          if (columns.indexOf(x[i]) === -1) {
            columns.push(x[i])
          }
          row[columns.indexOf(x[i])] = x[i + 1]
        }
        values[rowIndex] = row
      }
      return { columns, values }
    },
  },
  created() {
    buildTableFromTree(this.item)
  },
}

function flattenFields(items, prefix = []) {
  const result = []

  items.forEach((item) => {
    const currentPath = [...prefix, item.label]

    if (item.items && item.items.length > 0) {
      result.push(...flattenFields(item.items, currentPath))
    } else {
      result.push({
        path: currentPath,
        value: item.uri ?? item.value ?? null,
      })
    }
  })

  return result
}

</script>
