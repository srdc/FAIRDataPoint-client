import * as $rdf from 'rdflib'
import Graph from '@/rdf/Graph'
import rdfUtils from '@/rdf/utils'

/**
 * CSVW Table Group helpers for the variables table
 */

const CSVW = $rdf.Namespace('http://www.w3.org/ns/csvw#')
const DCT_DESCRIPTION = $rdf.namedNode('http://purl.org/dc/terms/description')
const DCT_TITLE = $rdf.namedNode('http://purl.org/dc/terms/title')
const DCAT_KEYWORD = $rdf.namedNode('http://www.w3.org/ns/dcat#keyword')

export type SortKey = 'name' | 'title' | 'description' | 'datatype' | 'propertyUrl'

export type SortOrder = 'asc' | 'desc'

export const SORT_KEYS: { key: SortKey, label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'datatype', label: 'Datatype' },
  { key: 'propertyUrl', label: 'Property URL' },
]

export type VariableRow = {
  id: string,
  name: string[],
  title: string[],
  description: string[],
  datatype: string[],
  propertyUrl: string[],
  datatypeLabels: string[],
  propertyLinks: { url: string, label: string }[],
}

export type VariableTable = {
  id: string,
  title: string | null,
  url: string | null,
  keywords: string[],
  rows: VariableRow[],
}

const NATURAL_ORDER = new Intl.Collator('en', { numeric: true, sensitivity: 'accent' })

function smallest(values: string[]): string | null {
  return values.length === 0
    ? null
    : values.reduce((min, value) => (NATURAL_ORDER.compare(value, min) < 0 ? value : min))
}

function sortValue(row: VariableRow, key: SortKey): string | null {
  return smallest(row[key])
}

export function compareRows(key: SortKey, order: SortOrder) {
  return (row1: VariableRow, row2: VariableRow): number => {
    const key1 = sortValue(row1, key)
    const key2 = sortValue(row2, key)
    if (key1 === null || key2 === null) {
      if (key1 !== key2) return key1 === null ? 1 : -1
    } else {
      const result = NATURAL_ORDER.compare(key1, key2)
      if (result !== 0) return order === 'desc' ? -result : result
    }
    const name1 = sortValue(row1, 'name') || ''
    const name2 = sortValue(row2, 'name') || ''
    const byName = NATURAL_ORDER.compare(name1, name2)
    if (byName !== 0) return byName
    if (row1.id === row2.id) return 0
    return row1.id < row2.id ? -1 : 1
  }
}

function uniqueValues(terms: any[]): string[] {
  return Array.from(new Set(terms.filter(Boolean).map((term) => term.value)))
}

function datatypeValues(graph: Graph, column): string[] {
  const terms = graph.store.each(column, CSVW('datatype'), null)
  return uniqueValues(terms.map((term) => (
    term.termType === 'BlankNode' ? graph.store.any(term, CSVW('base'), null) : term
  )))
}

function datatypeLabel(value: string): string {
  return /^https?:\/\//.test(value) ? rdfUtils.pathTerm(value) : value
}

function readRow(graph: Graph, column): VariableRow {
  const values = (predicate) => uniqueValues(graph.store.each(column, predicate, null))
  const datatype = datatypeValues(graph, column)
  const propertyUrl = values(CSVW('propertyUrl'))
  return {
    id: column.value,
    name: values(CSVW('name')),
    title: uniqueValues([
      ...graph.store.each(column, CSVW('titles'), null),
      ...graph.store.each(column, CSVW('title'), null),
    ]),
    description: values(DCT_DESCRIPTION),
    datatype,
    propertyUrl,
    datatypeLabels: datatype.map(datatypeLabel),
    propertyLinks: propertyUrl.map((url) => ({ url, label: rdfUtils.pathTerm(url) || url })),
  }
}

/**
 * The tables of a Table Group page
 */
export function readTables(
  graph: Graph,
  subject: string,
  sort: SortKey,
  order: SortOrder,
): VariableTable[] {
  return graph.store.each($rdf.namedNode(subject), CSVW('table'), null)
    .map((table) => {
      const title = graph.store.any(table, DCT_TITLE, null)
      const url = graph.store.any(table, CSVW('url'), null)
      return {
        id: table.value,
        title: title ? title.value : null,
        url: url ? url.value : null,
        keywords: uniqueValues(graph.store.each(table, DCAT_KEYWORD, null)),
        rows: graph.store.each(table, CSVW('column'), null)
          .map((column) => readRow(graph, column))
          .sort(compareRows(sort, order)),
      }
    })
}
