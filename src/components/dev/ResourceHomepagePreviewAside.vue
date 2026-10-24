<script setup lang="ts">
import { TCard } from 'ui_73info'

/**
 * 右栏「预览摘要」：按大厅资源卡的外观画一张卡。
 *
 * 接口资源不进大厅、首页精选与公开搜索，没有这张卡的落地页，父级整块不渲染
 * （主栏随之占满一行）。这里只接收算好的展示值，不碰表单状态。
 */
defineProps<{
  coverPreview: string
  title: string
  description: string
  platformLabel: string
  authorLabel: string
  entryLabel: string
  tagCount: number
}>()
</script>

<template>
  <aside class="dev-upload-side">
    <TCard class="dev-surface-card dev-surface-card--sticky">
      <h3 class="dev-section-title">预览摘要</h3>
      <article class="dev-preview-card dev-list--spaced">
        <div class="dev-preview-card__cover">
          <img
            v-if="coverPreview"
            :src="coverPreview"
            alt="资源图标"
            class="dev-preview-card__cover-img"
          />
          <span v-else class="dev-preview-card__cover-text">{{
            (title || '资源').slice(0, 1).toUpperCase()
          }}</span>
          <span class="dev-preview-card__badge">{{ platformLabel }}</span>
          <div class="dev-preview-card__screen dev-preview-card__screen--primary"></div>
          <div class="dev-preview-card__screen dev-preview-card__screen--secondary"></div>
          <div class="dev-preview-card__screen dev-preview-card__screen--tertiary"></div>
        </div>
        <div class="dev-preview-card__body">
          <h3>{{ title }}</h3>
          <p v-if="description.trim()">{{ description }}</p>
          <div class="dev-preview-card__meta-row">
            <strong>{{ entryLabel || platformLabel }}</strong>
            <span class="dev-preview-card__status">{{ tagCount }} 个标签</span>
          </div>
          <div class="dev-preview-card__footer">
            <span>by {{ authorLabel }}</span>
            <span class="dev-preview-card__time">根节点 · {{ platformLabel }}</span>
          </div>
        </div>
      </article>
    </TCard>
  </aside>
</template>
