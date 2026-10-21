import _ from 'lodash'
import { DEFAULT_URI, SHACL } from '@/rdf/namespaces'
import Graph from '@/rdf/Graph'

export type ValidationReport = Record<string, Record<string, any>>

function parseResult(result, graph) {
  const resultPath = graph.findOne(SHACL('resultPath'), { subject: result }) as string
  if (resultPath) {
    const focusNode = graph.findOne(SHACL('focusNode'), { subject: result }) as string
    const sourceConstraintComponent = graph.findOne(SHACL('sourceConstraintComponent'), { subject: result })
    return { [focusNode]: { [resultPath]: sourceConstraintComponent } }
  }

  const detail = graph.findOne(SHACL('detail'), { subject: result, value: false }) as string
  if (detail) {
    return parseResult(detail, graph)
  }

  return {}
}

export function isValidationReport(data: unknown): data is string {
  return typeof data === 'string' && data.includes('ValidationReport')
}

export function parseValidationReport(rdf: unknown): ValidationReport {
  if (!isValidationReport(rdf)) {
    return {}
  }
  try {
    const graph = new Graph(rdf, DEFAULT_URI)
    return graph
      .findAll(SHACL('result'), { subject: null, value: false })
      .reduce((acc, result) => _.merge(acc, parseResult(result, graph)), {})
  } catch {
    return {}
  }
}
