<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import ResourceCatalogView from '@/views/ResourceCatalogView.vue'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'

onMounted(() => {
    setSeoMeta({
        title: '免费资源 - 73Info 柒叁信息',
        description:
            '在 73Info 免费资源区浏览公开免费与积分兑换资源，查看介绍、分类标签、作者信息与下载入口。不含现金付费资源。',
        path: '/free-resources',
    })
})

onBeforeUnmount(() => {
    resetSeoMeta()
})
</script>

<template>
    <ResourceCatalogView listing-mode="free" />
</template>
