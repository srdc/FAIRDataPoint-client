<template>
  <router-link
    v-if="internalPath"
    :to="internalPath"
    class="link"
  >
    {{ resolvedLabel || label }}
  </router-link>
  <a
    v-else
    :href="uri"
    target="_blank"
    class="link"
  >
    {{ resolvedLabel || label }}
  </a>
</template>
<script lang="ts">
import {
  Component, Prop, Vue, Watch,
} from 'vue-property-decorator'
import api from '../../api'
import config from '../../config'

@Component
export default class RdfLink extends Vue {
  @Prop({ type: String })
  readonly uri: string

  @Prop({ type: String })
  readonly label: string

  @Prop({ type: Boolean, default: false })
  readonly labelResolved: boolean

  resolvedLabel : string = null

  get internalPath(): string | null {
    if (!this.uri) return null
    const base = config.persistentURL()
    if (!base || !this.uri.startsWith(base)) return null
    const path = this.uri.slice(base.length)
    return /^\/[^/]+\/[^/]+$/.test(path) ? path : null
  }

  async created(): Promise<void> {
    if (!this.labelResolved) {
      try {
        const label = await api.label.getLabel(this.uri)
        this.resolvedLabel = label.data.label
      } catch {
        // nothing could be fetched, keep default label
      }
    }
  }
}
</script>
