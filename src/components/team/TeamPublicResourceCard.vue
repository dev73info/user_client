<script setup lang="ts">
import { useRouter } from 'vue-router'

import { apiUrl } from '@/api/http'
import { getResourceDetailSlug, getTagRouteSlug } from '@/api/resourceTags'
import type { PublicMcResourceItem } from '@/api/resources'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'

const props = defineProps<{
  resource: PublicMcResourceItem
}>()

const router = useRouter()

function openResource(resource: PublicMcResourceItem) {
  const selections = resource.tag_selections ?? []
  const rootName = selections.find((s) => s.group_path.length > 0)?.group_path[0] ?? ''
  const entryName =
    selections.find((s) => s.group_path.length > 1)?.group_path[1] ?? (resource.platform || '')
  const rootAlias =
    selections.find((s) => (s.group_path_aliases?.length ?? 0) > 0)?.group_path_aliases?.[0] ?? ''
  const entryAlias =
    selections.find((s) => (s.group_path_aliases?.length ?? 0) > 1)?.group_path_aliases?.[1] ?? ''
  const rootSlug = rootAlias || getTagRouteSlug(rootName)
  const entrySlug = entryAlias || getTagRouteSlug(entryName)
  const resourceSlug = getResourceDetailSlug(resource.id, resource.creator || resource.author)

  // 资源没有分类标签时分类段是空字符串，push 带分类的路由会抛 `Missing required param "rootSlug"`。
  if (!rootSlug || !entrySlug) {
    void router.push({ name: 'resource-detail-direct', params: { resourceSlug } })
    return
  }

  void router.push(
    resourceDetailLocation({
      resourceId: resource.id,
      rootSlug,
      entrySlug,
      sale: resourceListingSaleOf(resource.buyout_price_fen, resource.price_points),
    }),
  )
}
</script>

<template>
  <article class="team-profile__resource-card" @click="openResource(props.resource)">
    <div class="team-profile__resource-cover-wrap">
      <img
        v-if="resource.cover_url"
        :src="apiUrl(resource.cover_url)"
        :alt="resource.title"
        class="team-profile__resource-cover"
      />
      <span v-else class="team-profile__resource-cover team-profile__resource-cover--text">
        {{ resource.title.slice(0, 1).toUpperCase() }}
      </span>
    </div>
    <div class="team-profile__resource-body">
      <h3 class="team-profile__resource-title">{{ resource.title }}</h3>
      <p class="team-profile__resource-desc">{{ resource.description || '暂无简介' }}</p>
      <div class="team-profile__resource-meta">
        <span>{{ resource.platform }}</span>
        <span>{{ resource.like_count }} 赞</span>
      </div>
    </div>
  </article>
</template>

<style scoped src="./team-public-resource-card.css"></style>
