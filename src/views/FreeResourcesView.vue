<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import ResourceCatalogView from '@/views/ResourceCatalogView.vue'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'

onMounted(() => {
    setSeoMeta({
        title: '免费资源 - 73Info 柒叁信息',
        description:
            '在 73Info 免费资源区浏览 Minecraft、网站开发和小工具等公开资源，查看资源介绍、分类标签、作者信息与下载入口。',
        path: '/free-resources',
    })
})

onBeforeUnmount(() => {
    resetSeoMeta()
})
</script>

<template>
    <ResourceCatalogView />
</template>
