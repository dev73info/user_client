<script setup lang="ts">
import { computed } from 'vue'
import type { PublicMcResourceItem } from '@/api/resources'
import { API_RESOURCE_PURCHASE_HINT } from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'
import { useDownloadStore } from '@/stores/download'
import ShareCardGenerator from '@/components/ShareCardGenerator.vue'

/**
 * 资源详情摘要卡底部的主操作行：购买 / 下载主按钮（接口资源换成引导文案）、
 * 下载进度条、点赞（心形 + 赞数）、分享卡入口。
 *
 * 从 `ResourceDetailPanel.vue` 的摘要卡里整块搬出来，DOM 结构与类名未改，
 * 样式随节点搬到 `resource-detail-cta.css`。按钮只负责「按下」，真正的下单、
 * 下载与点赞动作仍在外层（`useResourcePurchase` / `useResourceFileDownload` /
 * `useResourceLike` 的状态都留在上层，这里不另存一份）。
 */
const props = defineProps<{
  resource: PublicMcResourceItem
  priceLabel: string
  /** 需要先购买才能下载（平台内有购买入口） */
  needsPurchase: boolean
  /** 接口资源：平台内没有购买入口，只给到开发者站点下单的引导 */
  isApiResource: boolean
  /** 购买面板正在提交 */
  purchaseSubmitting: boolean
  /** 点赞请求进行中 */
  likeSubmitting: boolean
}>()

const emit = defineEmits<{
  'primary-cta': []
  'toggle-like': []
}>()

const auth = useAuthStore()
const downloadStore = useDownloadStore()

const primaryCtaLabel = computed(() => {
  if (downloadStore.state.active) {
    return '下载中...'
  }
  if (props.needsPurchase) {
    return `购买 ${props.priceLabel}`
  }
  return '下载最新版本'
})

/** 点赞按钮上的赞数：接口可能不带该字段，缺省按 0 显示（与资源卡片同一口径）。 */
const likeCountLabel = computed(() => props.resource.like_count ?? 0)
</script>

<template>
  <div class="resource-detail-page__cta-row">
    <div class="resource-detail-page__primary-actions">
      <button
        v-if="!props.isApiResource"
        class="resource-detail-page__primary-btn"
        type="button"
        :disabled="downloadStore.state.active || props.purchaseSubmitting"
        @click="emit('primary-cta')"
      >
        {{ primaryCtaLabel }}
      </button>
      <!-- BUG-020：接口资源没有平台内购买入口，只给到开发者站点下单的引导 -->
      <p v-else class="resource-detail-page__api-hint">
        {{ API_RESOURCE_PURCHASE_HINT }}
      </p>
      <div
        v-if="downloadStore.state.active"
        class="resource-detail-page__download-progress"
        role="progressbar"
        :aria-valuenow="downloadStore.state.percent"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="resource-detail-page__download-progress__track">
          <div
            class="resource-detail-page__download-progress__bar"
            :style="{ width: `${downloadStore.state.percent}%` }"
          ></div>
        </div>
        <span class="resource-detail-page__download-progress__label">
          {{ downloadStore.state.percent }}%
        </span>
      </div>
      <button
        class="resource-detail-page__like-btn"
        type="button"
        :class="{ 'resource-detail-page__like-btn--active': props.resource.liked_by_me }"
        :disabled="props.likeSubmitting"
        :aria-pressed="props.resource.liked_by_me"
        :aria-label="`${props.resource.liked_by_me ? '已点赞' : '点赞'}，当前 ${likeCountLabel} 人赞`"
        :title="props.resource.liked_by_me ? '取消点赞' : '点赞'"
        @click="emit('toggle-like')"
      >
        <svg
          class="resource-detail-page__like-icon"
          viewBox="0 0 24 24"
          :fill="props.resource.liked_by_me ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
          ></path>
        </svg>
        <span class="resource-detail-page__like-count" aria-hidden="true">{{
          likeCountLabel
        }}</span>
      </button>
      <ShareCardGenerator
        v-if="auth.isAuthed"
        share-type="resource"
        :target-id="String(props.resource.id)"
      />
    </div>
  </div>
</template>

<style scoped src="./resource-detail-cta.css"></style>
