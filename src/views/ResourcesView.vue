<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import ResourceCatalogView from '@/views/ResourceCatalogView.vue'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'

onMounted(() => {
  setSeoMeta({
    title: '资源项目 - 73Info 柒叁信息',
    description:
      '在 73Info 资源项目里浏览公开资源：免费资源与现金定价的付费资源在同一页内切换，查看介绍、分类标签、作者信息与下载 / 购买入口。',
    path: '/resources',
  })
})

onBeforeUnmount(() => {
  resetSeoMeta()
})
</script>

<template>
  <ResourceCatalogView />
</template>
