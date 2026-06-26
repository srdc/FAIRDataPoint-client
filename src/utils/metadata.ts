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

function itemFromPath(path) {
  if (!path) return null

  return {
    label: rdfUtils.pathTerm(path),
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
      return { label: value, uri: value }
    case DASH('DetailsViewer').value:
      try {
        return {
          label: value,
          items: fieldConfig.nodeShape?.fields
            ?.map((ch) => fromShaclField(graph, ch, asSubjectNode(value)))
            .filter((f) => f !== null),
        }
      } catch (err) {
        return null
      }
    default:
      if (fieldUtils.isDatetime(fieldConfig)) {
        return { label: moment(value).format(config.dateFormat) }
      }
      if (fieldConfig.datatype === XSD('boolean').value) {
        if (valueUtils.isTrue(value)) return { label: 'TRUE' }
        if (valueUtils.isFalse(value)) return { label: 'FALSE' }
      }
      return { label: value }
  }
}

function getShaclValue(graph: Graph, fieldConfig, subject = null) {
  const options = subject ? { subject } : {}

  if (fieldConfig.maxCount === 1) {
    const value = graph.findOne($rdf.namedNode(fieldConfig.path), options)
    return wrapShaclValue(fieldConfig, value, graph)
  }

  const values = graph.findAll($rdf.namedNode(fieldConfig.path), options)
  return values.map((v) => wrapShaclValue(fieldConfig, v, graph)).filter((v) => v !== null)
}

function fromShaclField(graph: Graph, fieldConfig, subject?) {
  const name = fieldUtils.getName(fieldConfig)
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
