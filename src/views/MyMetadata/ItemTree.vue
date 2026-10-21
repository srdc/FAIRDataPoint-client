<template>
  <div
    v-if="value && value.length > 0"
    class="item-list"
  >
    <div
      v-for="item in sortByTitle(value)"
      :key="item.uri"
      class="item-list__item"
    >
      <a
        v-if="item.children.length > 0"
        class="item-list__item__control"
        @click.prevent="toggleOpen(item)"
      >
        <fa :icon="['fas', item.open ? 'chevron-down' : 'chevron-right']" />
      </a>
      <span
        v-else
        class="item-list__item__control"
      />
      <avatar
        :initials="plainTitle(item)[0]"
        :value="item.uri"
        smaller
      />
      <div class="item-list__item__content">
        <div class="item-list__item__content__row">
          <a :href="`${item.uri}`">
            {{ title(item) }}
          </a>
          <membership-badge :entity="item" />
        </div>
      </div>

      <item-tree
        v-if="item.open"
        v-model="item.children"
      />
    </div>
  </div>
</template>
<script lang="ts">
import _ from 'lodash'
import { Component, Prop, Vue } from 'vue-property-decorator'
import Avatar from '../../components/Avatar/index.vue'
import MembershipBadge from '../../components/MembershipBadge/index.vue'
import rdfUtils from '../../rdf/utils'

type Item = {
  children: Item[]
}

@Component({
  name: 'ItemTree',
  components: {
    Avatar,
    // eslint-disable-next-line no-use-before-define
    ItemTree,
    MembershipBadge,
  },
})
export default class ItemTree extends Vue {
  @Prop({ required: true })
  readonly value: Item[]

  plainTitle(item) {
    return rdfUtils.titleOrFallback(item.title, item.uri)
  }

  title(item) {
    return item.state === 'DRAFT' ? `[DRAFT] ${this.plainTitle(item)}` : this.plainTitle(item)
  }

  sortByTitle(list) {
    return _.orderBy(list, ['title'], ['asc'])
  }

  toggleOpen(entity) {
    this.changeOpen((current) => (
      current.uri === entity.uri ? !current.open : current.open
    ))
  }

  changeOpen(f) {
    this.$emit('input', this.value.map((c) => ({
      ...c,
      open: f(c),
      children: c.children.map((d) => ({
        ...d,
        open: f(d),
      })),
    })))
  }
}
</script>
