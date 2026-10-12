<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getPublicMcResource } from '@/api/resources'
import { getTagRouteSlug, parseResourceIdFromSlug } from '@/api/resourceTags'
import { resourceListingSaleOf } from '@/shared/resourceNavigation'
import { useAuthStore } from '@/stores/auth'

/**
 * 旧「独立资源详情页」地址的轻量重定向。
 *
 * 详情现在在资源列表页内就地渲染（`/<rootSlug>/<entrySlug>?sale=<free|paid>&resource=<id>`，
 * 见 ResourceCatalogView），所以 `ResourceDetailView.vue` 与它的页面形态都已删除。
 * 但下面两类地址不能 404：
 * - `/resources/<作者>--<id>`：站外链接、资源列表静态快照页的 JS 引导（sitemap 里的详情地址）；
 * - `/<根分区>/<子分区>/<作者>--<id>`：三段式旧详情地址（浏览器历史、已分享的链接）。
 *
 * 这条路由只做一件事——解析出资源编号 → 拉一次资源拿到售卖类型与分类 → replace 到页内详情态。
 * 解析不到 / 资源不可见时退回「资源项目」列表（带分区），同样不 404、不白屏。
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

/** 详情地址末段形如 `<作者>--<id>`；兼容只给编号的写法。 */
function parseResourceId(raw: unknown): number | null {
  const slug = String(raw ?? '').trim()
  if (!slug) {
    return null
  }

  const fromSlug = parseResourceIdFromSlug(slug)
  if (fromSlug) {
    return fromSlug
  }

  const numeric = Number(slug)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

function paramSlug(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function redirectToCatalog() {
  const resourceId = parseResourceId(route.params.resourceSlug)
  if (!resourceId) {
    void router.replace({ name: 'resources', query: { sale: 'free' } })
    return
  }

  try {
    auth.hydrate()
    const token = auth.token?.trim() ? auth.token : null
    const resource = await getPublicMcResource(resourceId, token)
    const selections = resource.tag_selections ?? []
    const rootName = selections.find((item) => item.group_path.length > 0)?.group_path[0] ?? ''
    const entryName =
      selections.find((item) => item.group_path.length > 1)?.group_path[1] ?? resource.platform
    const rootAlias =
      selections.find((item) => (item.group_path_aliases?.length ?? 0) > 0)?.group_path_aliases?.[0] ?? ''
    const entryAlias =
      selections.find((item) => (item.group_path_aliases?.length ?? 0) > 1)?.group_path_aliases?.[1] ?? ''

    // 三段式旧地址自带分类段，它就是列表页用的分类 slug，沿用即可；
    // `/resources/<slug>` 没有分类段，按资源自身的标签 / 平台推出来。
    const rootSlug =
      paramSlug(route.params.rootSlug) || rootAlias || getTagRouteSlug(rootName)
    const entrySlug =
      paramSlug(route.params.entrySlug) || entryAlias || getTagRouteSlug(entryName)
    const sale = resourceListingSaleOf(resource.price_fen, resource.price_points)

    if (!rootSlug || !entrySlug) {
      // 资源没有分类标签（历史数据未回填）：退回资源项目列表，照样不 404
      void router.replace({ name: 'resources', query: { sale } })
      return
    }

    void router.replace({
      name: 'resource-catalog',
      params: { rootSlug, entrySlug },
      query: { sale, resource: String(resourceId) },
    })
  } catch {
    void router.replace({ name: 'resources', query: { sale: 'free' } })
  }
}

onMounted(() => {
  void redirectToCatalog()
})
</script>

<template>
  <!-- 重定向是即时的，这里只承载极短的过渡，不留白屏也不渲染旧详情页 -->
  <main class="portal-page" aria-hidden="true"></main>
</template>
