<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import ResourceCatalogView from '@/views/ResourceCatalogView.vue'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'

onMounted(() => {
  setSeoMeta({
    title: '付费资源 - 73Info 柒叁信息',
    description:
      '在 73Info 付费资源区浏览现金标价的公开数字化资源，查看介绍、分类标签、作者信息与购买下载入口。不含积分售价资源。',
    path: '/paid-resources',
  })
})

onBeforeUnmount(() => {
  resetSeoMeta()
})
</script>

<template>
  <ResourceCatalogView listing-mode="paid" />
</template>
