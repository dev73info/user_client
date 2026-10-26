<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'

import { HttpError } from '@/api/http'
import { getPublicMcResource } from '@/api/resources'
import {
  getMcPluginPlatformEntries,
  getTagRouteSlug,
  parseResourceIdFromSlug,
} from '@/api/resourceTags'
import { resourceListingSaleOf } from '@/shared/resourceNavigation'
import { normalizePromoCode, type ResourceListingSale } from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'
import { useTagTreeStore } from '@/stores/tagTree'
import { TMessage } from 'ui_73info'

/**
 * 旧「独立资源详情页」地址的轻量重定向。
 *
 * 详情现在在资源列表页内就地渲染（`/<rootSlug>/<entrySlug>?sale=<free|paid>&resource=<id>`，
 * 见 ResourceCatalogView），所以 `ResourceDetailView.vue` 与它的页面形态都已删除。
 * 但下面两类地址不能 404：
 * - `/resources/<作者>--<id>`：站外链接、资源列表静态快照页的 JS 引导（sitemap 里的详情地址）；
 * - `/<根分区>/<子分区>/<作者>--<id>`：三段式旧详情地址（浏览器历史、已分享的链接）。
 *
 * 这条路由先解析资源编号 → 拉一次资源拿到售卖类型与分类 → replace 到页内详情态。
 * `/resources/<子分区>` 与旧详情地址冲突时，先按标签树识别分类别名；无效 slug 才回列表。
 * 标签树获取失败保留原地址并给重试，不把可恢复异常伪装成资源不存在。
 *
 * R029：推广分享链接会带上 `?promo=<推广码>`，这一跳必须把它一起带到列表页的页内详情态，
 * 否则下单请求带不上 `promo_code`、后端永远归因不到（短链落在前端域名时走 router 的 `/r/:code` 兜底）。
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const tagTreeStore = useTagTreeStore()
const catalogAliasError = ref('')

/**
 * 打不开目标资源时的统一落点：仍回「资源项目」列表（不 404、不白屏）。
 * 有 message 时补一句中文提示——访客点的是某条具体资源，只把列表塞给他、不说为什么，等于没有反馈。
 */
function fallbackToResourceList(sale: ResourceListingSale, message?: string) {
  if (message) {
    TMessage.error(message)
  }
  void router.replace({ name: 'resources', query: { sale } })
}

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

function categoryQuery(): LocationQueryRaw {
  const query: LocationQueryRaw = { ...route.query }
  const promoCode = normalizePromoCode(route.query.promo)
  delete query.promo
  if (promoCode) query.promo = promoCode
  return query
}

async function redirectToResourceCategory(entrySlug: string): Promise<boolean> {
  const tree = await tagTreeStore.ensure()
  const isCategory = getMcPluginPlatformEntries(tree, 'resources').some(
    (entry) => entry.slug === entrySlug,
  )
  if (!isCategory) return false

  void router.replace({
    name: 'resource-catalog',
    params: { rootSlug: 'resources', entrySlug },
    query: categoryQuery(),
    // 分类别名与目标目录可能共用同一个 fullPath，也要切换到目录路由记录。
    force: true,
  })
  return true
}

async function redirectToCatalog() {
  catalogAliasError.value = ''
  // R029：分享短链把推广码写在 `?promo=` 上（后端 302 / 前端 `/r/:code` 兜底两条路都带）。
  // 先按 `normalizePromoCode` 校验格式再往下带，别把任意字符串写回地址栏。
  const promoCode = normalizePromoCode(route.query.promo)
  const resourceId = parseResourceId(route.params.resourceSlug)
  if (!resourceId && route.name === 'resource-detail-direct') {
    const entrySlug = paramSlug(route.params.resourceSlug)
    if (entrySlug) {
      try {
        if (await redirectToResourceCategory(entrySlug)) return
      } catch (error) {
        catalogAliasError.value = error instanceof Error ? error.message : '加载资源目录失败'
        return
      }
    }
  }
  if (!resourceId) {
    fallbackToResourceList('free', '资源不存在或无权访问')
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
      selections.find((item) => (item.group_path_aliases?.length ?? 0) > 0)
        ?.group_path_aliases?.[0] ?? ''
    const entryAlias =
      selections.find((item) => (item.group_path_aliases?.length ?? 0) > 1)
        ?.group_path_aliases?.[1] ?? ''

    // 三段式旧地址自带分类段，它就是列表页用的分类 slug，沿用即可；
    // `/resources/<slug>` 没有分类段，按资源自身的标签 / 平台推出来。
    const rootSlug = paramSlug(route.params.rootSlug) || rootAlias || getTagRouteSlug(rootName)
    const entrySlug = paramSlug(route.params.entrySlug) || entryAlias || getTagRouteSlug(entryName)
    const sale = resourceListingSaleOf(resource.buyout_price_fen, resource.price_points)

    if (!rootSlug || !entrySlug) {
      // 资源没有分类标签（历史数据未回填）：退回资源项目列表，照样不 404
      // 资源本身是可见的（上面已经取到），这里只降级落点，不必再弹提示
      fallbackToResourceList(sale)
      return
    }

    void router.replace({
      name: 'resource-catalog',
      params: { rootSlug, entrySlug },
      query: {
        sale,
        resource: String(resourceId),
        // 推广码只在「详情就是分享链接指向的那条资源」时随行；格式不合格的码不进地址栏
        ...(promoCode ? { promo: promoCode } : {}),
      },
    })
  } catch (error) {
    // 404 同时覆盖「资源不存在」与「私有 / 待审资源无权查看」，按后端原文弹「not found」对访客没意义
    const message =
      error instanceof HttpError && error.status === 404
        ? '资源不存在或无权访问'
        : error instanceof Error
          ? error.message
          : '加载资源失败'
    fallbackToResourceList('free', message)
  }
}

onMounted(() => {
  void redirectToCatalog()
})
</script>

<template>
  <!-- 重定向是即时的，这里只承载极短的过渡；标签树失败时保留地址并给重试。 -->
  <main class="portal-page" :aria-hidden="catalogAliasError ? undefined : 'true'">
    <section v-if="catalogAliasError" class="portal-page__empty portal-page__empty--stacked">
      <p role="alert">{{ catalogAliasError }}</p>
      <button class="portal-page__action" type="button" @click="redirectToCatalog">重新加载</button>
    </section>
  </main>
</template>
