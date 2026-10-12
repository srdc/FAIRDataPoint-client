import _ from 'lodash'
import * as $rdf from 'rdflib'
import moment from 'moment'
import Graph from '@/rdf/Graph'
import {
  DASH, DCT, FDPO, RDFS, XSD,
} from '@/rdf/namespaces'
import rdfUtils from '@/rdf/utils'
import config from '@/config'
import fieldUtils from '@/components/ShaclForm/fieldUtils'
import valueUtils from '@/components/ShaclForm/valueUtils'

function field(label, input, extra = {}) {
  if (typeof input !== 'object') {
    return {
      label,
      value: input,
      ...extra,
    }
  }

  if (Array.isArray(input)) {
    return {
      label,
      items: input,
      ...extra,
    }
  }

  return {
    label,
    value: input.label,
    items: input.items,
    uri: input.uri,
    ...extra,
  }
}

function dateField(label, input, extra = {}) {
  return field(label, moment(input).format(config.dateFormat), extra)
}

const MAILTO_OR_TEL = /^(mailto|tel):/i

/**
 * A readable fallback label for a link
 */
function linkLabel(iri: string): string {
  if (MAILTO_OR_TEL.test(iri)) return iri.replace(MAILTO_OR_TEL, '')

  const term = rdfUtils.pathTerm(iri)
  if (!term || term.length > 3 || term !== term.toLowerCase()) return term || iri

  try {
    const url = new URL(iri)
    let embedded = null
    url.searchParams.forEach((value) => {
      if (!embedded && /^https?:\/\//i.test(value)) embedded = value
    })
    const target = embedded ? new URL(embedded) : url
    const path = target.pathname.replace(/^\/+|\/+$/g, '')
    const deepPath = path.split('/').length >= 4
    return (embedded || url.search || deepPath) && path ? path : term
  } catch {
    return term
  }
}

function itemFromPath(path) {
  if (!path) return null

  return {
    label: linkLabel(path),
    uri: path,
  }
}

function commonMetadata(graph: Graph) {
  const metadataGroups = []

  const conformsTo = graph.findAll(DCT('conformsTo'))
  if (conformsTo.length > 0) {
    const data = conformsTo.map((uri) => {
      const label = graph.findOne(RDFS('label'), {
        subject: $rdf.namedNode(`${uri}`),
      })

      return {
        label: label || rdfUtils.pathTerm(`${uri}`),
        uri: uri.replace(config.persistentURL(), config.clientURL),
        resolved: true,
      }
    })
    metadataGroups.push({ fields: [field('Conforms to', data)] })
  }
  return metadataGroups
}

function asSubjectNode(value: any): any | null {
  if (!value) {
    return null
  }

  // Already an rdflib term
  if (value.termType === 'NamedNode' || value.termType === 'BlankNode') {
    return value
  }

  // Raw string IRI / blank node id
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null

    // Any "_..." string we treat as a blank node id
    if (trimmed.startsWith('_')) {
      // rdflib blankNode takes an id without the "_:" prefix, but it's fine
      // to pass the whole thing too; to be safe we strip "_:" if present
      return $rdf.blankNode(trimmed.replace(/^_:/, ''))
    }

    // Everything else is assumed to be an absolute IRI
    return $rdf.namedNode(trimmed)
  }

  // Sometimes rdflib terms are wrapped and the actual string
  // is in .value – handle that as a fallback
  if (typeof value.value === 'string') {
    return asSubjectNode(value.value)
  }

  return null
}

function wrapShaclValue(fieldConfig, value, graph) {
  if (!value) {
    return null
  }

  switch (fieldConfig.viewer) {
    case DASH('LabelViewer').value:
      return itemFromPath(value)
    case DASH('URIViewer').value:
      return { label: `${value}`.replace(MAILTO_OR_TEL, ''), uri: value }
    case DASH('DetailsViewer').value: {
      const subjectNode = asSubjectNode(value)
      if (!subjectNode) return null

      const items = (fieldConfig.nodeShape?.fields ?? [])
        .map((ch) => fromShaclField(graph, ch, subjectNode))
        .filter((f) => f !== null)

      const isNamed = subjectNode.termType === 'NamedNode'

      if (items.length === 0) {
        return isNamed ? itemFromPath(subjectNode.value) : null
      }

      return isNamed
        ? { label: rdfUtils.pathTerm(subjectNode.value), uri: subjectNode.value, items }
        : { items }
    }
    default:
      return literalItem(fieldConfig, value)
  }
}

function literalItem(fieldConfig, value) {
  if (fieldConfig && fieldUtils.isDatetime(fieldConfig)) {
    return { label: moment(value).format(config.dateFormat) }
  }
  if (fieldConfig && fieldConfig.datatype === XSD('boolean').value) {
    if (valueUtils.isTrue(value)) return { label: 'TRUE' }
    if (valueUtils.isFalse(value)) return { label: 'FALSE' }
  }
  return { label: value }
}

function getShaclValue(graph: Graph, fieldConfig, subject = null) {
  const options: any = subject ? { subject } : {}

  // A nested shape needs the object as an rdflib term, not as a string. Graph.find defaults to
  // returning `object.value`, and a blank node's identifier does not survive that round trip -
  // the `_:` prefix lives on toString(), not on .value - so stringifying loses the subject and
  // every child lookup then misses. Graph.find already supports asking for the term itself.
  if (fieldConfig.viewer === DASH('DetailsViewer').value) {
    options.value = false
  }

  if (fieldConfig.maxCount === 1) {
    const value = graph.findOne($rdf.namedNode(fieldConfig.path), options)
    return wrapShaclValue(fieldConfig, value, graph)
  }

  const values = graph.findAll($rdf.namedNode(fieldConfig.path), options)
  return values.map((v) => wrapShaclValue(fieldConfig, v, graph)).filter((v) => v !== null)
}

const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name'

/**
 * Organization (agent) fields: publisher, creator, HDAB, custodian.
 */
function isOrganizationField(fieldConfig): boolean {
  return (fieldConfig.nodeShape?.fields ?? []).some((f) => f.path === FOAF_NAME)
}

/**
 * Collects the plain values (name, note, type, contact details...) of an organization node
 */
function organizationValues(graph: Graph, fieldConfig, subjectNode): any[] {
  return (fieldConfig.nodeShape?.fields ?? []).flatMap((child) => {
    if (child.viewer === DASH('DetailsViewer').value) {
      return graph.findAll($rdf.namedNode(child.path), { subject: subjectNode, value: false })
        .filter((term) => term && term.termType !== 'Literal')
        .map(asSubjectNode)
        .filter(Boolean)
        .flatMap((node) => organizationValues(graph, child, node))
    }
    const value = getShaclValue(graph, child, subjectNode)
    if (!value) return []
    return (Array.isArray(value) ? value : [value]).filter(Boolean)
  })
}

/**
 * Renders an organization like any other field
 */
function fromOrganizationField(graph: Graph, fieldConfig, name, subject?) {
  const options: any = subject ? { subject, value: false } : { value: false }
  const values = graph.findAll($rdf.namedNode(fieldConfig.path), options)
    .filter(Boolean)
    .flatMap((term) => {
      if (term.termType === 'Literal') return [{ label: term.value }]

      const node = asSubjectNode(term)
      if (!node) return []
      const nested = organizationValues(graph, fieldConfig, node)
      if (nested.length > 0) return nested
      return node.termType === 'NamedNode' ? [itemFromPath(node.value)] : []
    })

  if (values.length === 0) return null
  return values.length === 1 ? field(name, values[0]) : field(name, values)
}

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const NAME_PREDICATES = [
  FOAF_NAME,
  DCT('title').value,
  RDFS('label').value,
  'http://www.w3.org/2004/02/skos/core#prefLabel',
].map((iri) => $rdf.namedNode(iri))
const MAX_NESTING = 2

function humanize(iri: string): string {
  return _.upperFirst(_.lowerCase(rdfUtils.pathTerm(iri)))
}

function linkItem(graph: Graph, node) {
  const name = NAME_PREDICATES.map((p) => graph.store.any(node, p, null)).find(Boolean)
  return name
    ? { label: name.value, uri: node.value, labelResolved: true }
    : itemFromPath(node.value)
}

function termValues(graph: Graph, term, sublabel: string | null, fieldConfig, depth: number) {
  if (!term) return []

  if (term.termType === 'Literal') {
    return [{ ...literalItem(fieldConfig, term.value), sublabel }]
  }

  const opens = term.termType === 'BlankNode'
    || (fieldConfig && fieldConfig.viewer === DASH('DetailsViewer').value)
  const nested = opens && depth < MAX_NESTING ? nodeValues(graph, term, fieldConfig, depth + 1) : []
  if (nested.length > 0) {
    return nested.map((item) => ({ ...item, sublabel: item.sublabel || sublabel }))
  }

  return term.termType === 'NamedNode' ? [{ ...linkItem(graph, term), sublabel }] : []
}

function nodeValues(graph: Graph, node, fieldConfig, depth: number) {
  const shapeFields = fieldConfig?.nodeShape?.fields ?? []
  const fromShape = shapeFields.flatMap((child) => graph
    .findAll($rdf.namedNode(child.path), { subject: node, value: false })
    .flatMap((term) => termValues(graph, term, fieldUtils.getName(child), child, depth)))
  if (fromShape.length > 0) return fromShape

  return graph.store.match(node, null, null)
    .filter((statement) => statement.predicate.value !== RDF_TYPE)
    .flatMap((statement) => termValues(
      graph,
      statement.object,
      humanize(statement.predicate.value),
      null,
      depth,
    ))
}

function hasBlankNodeValue(graph: Graph, fieldConfig, subject?) {
  const options: any = subject ? { subject, value: false } : { value: false }
  return graph.findAll($rdf.namedNode(fieldConfig.path), options)
    .some((term) => term && term.termType === 'BlankNode')
}

function fromNestedField(graph: Graph, fieldConfig, name, subject?) {
  const options: any = subject ? { subject, value: false } : { value: false }
  const values = graph.findAll($rdf.namedNode(fieldConfig.path), options)
    .flatMap((term) => termValues(graph, term, null, fieldConfig, 0))

  return values.length > 0 ? field(name, values) : null
}

function fromShaclField(graph: Graph, fieldConfig, subject?) {
  const name = fieldUtils.getName(fieldConfig)
  if (isOrganizationField(fieldConfig)) {
    return fromOrganizationField(graph, fieldConfig, name, subject)
  }
  if (fieldConfig.viewer === DASH('DetailsViewer').value
    || hasBlankNodeValue(graph, fieldConfig, subject)) {
    return fromNestedField(graph, fieldConfig, name, subject)
  }

  const value = getShaclValue(graph, fieldConfig, subject)
  if (!value || _.isEmpty(value)) {
    return null
  }

  return field(name, value)
}

export default {
  field,
  dateField,
  commonMetadata,
  itemFromPath,
  fromShaclField,
}
