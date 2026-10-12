<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { parseResourceIdFromSlug } from '@/api/resourceTags'
import ResourceDetailPanel from '@/components/ResourceDetailPanel.vue'

/**
 * 资源详情路由页（`/resources/<作者>--<id>` 与 `/:根分区/:子分区/<作者>--<id>`）。
 *
 * 这里只做一件事：把路由段解析成资源编号，页面内容与取数全部在 ResourceDetailPanel。
 * 同一个面板组件也被资源列表页的右栏复用（主从双栏，见 ResourceCatalogView）——
 * 抽出来的目的就是让「独立详情页」与「列表页就地详情」共用同一份请求与交互，不出现两套口径。
 *
 * 解析不到编号时传 0，面板按「编号无效」处理（提示后退回首页），与原行为一致。
 */
const route = useRoute()

const resourceId = computed(
  () => parseResourceIdFromSlug(String(route.params.resourceSlug ?? '')) ?? 0,
)
</script>

<template>
  <ResourceDetailPanel :resource-id="resourceId" variant="page" />
</template>
