import _ from 'lodash'

function pathTerm(path: string): string {
  return _.last(path.split(/[/#]/))
}

function titleOrFallback(title: unknown, iri: string): string {
  if (title !== null && title !== undefined && `${title}`.trim() !== '') {
    return `${title}`
  }
  const parts = `${iri || ''}`.split(/[/#]/).filter((part) => part !== '')
  const id = parts.length > 0 ? parts[parts.length - 1] : ''
  const type = parts.length > 3 ? parts[parts.length - 2] : ''
  return ['Untitled', type, id.slice(0, 8)].filter((part) => part !== '').join(' ')
}

export default {
  pathTerm,
  titleOrFallback,
}
