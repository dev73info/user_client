<script setup lang="ts">
import { computed } from 'vue'
import { TCard } from 'ui_73info'
import ResourceCatalogCardItem from '@/components/resource-catalog/ResourceCatalogCardItem.vue'
import type { McCardItem } from '@/components/resource-catalog/resourceCatalogModel'

/**
 * 右栏「预览摘要」：直接复用大厅资源卡（`ResourceCatalogCardItem`），
 * 不再手绘一套近似外观——两边看起来必须一模一样。
 *
 * 接口资源不进大厅、首页精选与公开搜索，没有这张卡的落地页，父级整块不渲染
 * （主栏随之占满一行）。这里只接收算好的展示值，不碰表单状态；
 * 点赞与「查看详情」是卡片在外面的动作，预览里整块页脚隐藏。
 */
const props = defineProps<{
  coverPreview: string
  title: string
  description: string
  authorLabel: string
  /** 由父级按售价输入算好，卡片只负责展示。 */
  priceFen: number
  pricePoints: number
  priceLabel: string
  originType: 'original' | 'repost'
  /** 已选标签名；父级取不到时回退成当前二级节点名。 */
  tags: string[]
}>()

/** 把表单里的展示值摊平成卡片结构；点赞 / 版本价等与预览无关的字段给安全默认值。 */
const card = computed<McCardItem>(() => ({
  id: 0,
  title: props.title,
  ownerName: props.authorLabel,
  author: props.authorLabel,
  authorUsernameGradient: false,
  authorUsernameColor: '',
  developer: '',
  developerUsernameGradient: false,
  developerUsernameColor: '',
  description: props.description,
  groupTags: {},
  groupTagsById: {},
  tags: props.tags,
  updatedAt: '',
  sourceUrl: '',
  coverUrl: props.coverPreview || null,
  coverFailed: false,
  likeCount: 0,
  likedByMe: false,
  likeSubmitting: false,
  originType: props.originType,
  originAuthor: null,
  originOrg: null,
  originUrl: null,
  priceFen: props.priceFen,
  pricePoints: props.pricePoints,
  minVersionPriceFen: 0,
  priceLabel: props.priceLabel,
}))
</script>

<template>
  <aside class="dev-upload-side">
    <TCard class="dev-surface-card dev-surface-card--sticky">
      <h3 class="dev-section-title">预览摘要</h3>
      <div class="dev-preview-aside__card">
        <ResourceCatalogCardItem :card="card" />
      </div>
    </TCard>
  </aside>
</template>

<style scoped>
/* 与「预览摘要」标题拉开一点距离 */
.dev-preview-aside__card {
  margin-top: 12px;
}

/* 预览里不出现点赞与「查看详情」：卡片页脚整块隐藏 */
.dev-preview-aside__card :deep(.portal-resource-browser__footer) {
  display: none;
}
</style>
