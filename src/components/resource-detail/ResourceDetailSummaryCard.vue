<script setup lang="ts">
import { computed } from 'vue'
import type { PublicMcResourceItem } from '@/api/resources'
import { isPricedResource } from '@/shared/resourceSale'
import ResourceDetailCtaRow from '@/components/resource-detail/ResourceDetailCtaRow.vue'

/**
 * 资源详情摘要卡：标题行（可见性 / 价格 / 原创转载标签 + 作者 / 开发者）、
 * 资源名与转载出处、简介、标签，底部是主操作行（`ResourceDetailCtaRow`）。
 *
 * 从 `ResourceDetailPanel.vue` 整块搬出来，模板节点与类名一字未改，
 * 只把「资源对象怎么来」换成 `resource` prop——派生出来的展示字段（作者前缀、
 * 摘要去前缀、转载出处、标签、可见性文案）全都是这一块自己在用的，跟着搬了过来。
 */
const props = defineProps<{
  resource: PublicMcResourceItem
  /** 价格文案（同时在购买弹窗上用，所以由外层算好传进来） */
  priceLabel: string
  needsPurchase: boolean
  isApiResource: boolean
  purchaseSubmitting: boolean
  likeSubmitting: boolean
}>()

const emit = defineEmits<{
  'primary-cta': []
  'toggle-like': []
}>()

const tagNames = computed(
  () => props.resource.tag_selections.flatMap((item) => item.tag_names) ?? [],
)

const visibilityLabel = computed(() =>
  props.resource.visibility === 'published' ? '公开' : '待正式发布',
)

const isRepost = computed(() => props.resource.origin_type === 'repost')
const originTypeLabel = computed(() => (props.resource.origin_type === 'repost' ? '转载' : '原创'))

const repostOriginLabel = computed(() => {
  const current = props.resource
  if (current.origin_type !== 'repost') {
    return ''
  }
  const parts: string[] = []
  if (current.origin_org) {
    parts.push(`转载自 ${current.origin_org}`)
  }
  if (current.origin_author) {
    parts.push(`原作者 ${current.origin_author}`)
  }
  return parts.join(' · ')
})

const authorPillParts = computed(() => {
  const current = props.resource
  const author = current.author.trim()
  const creator = current.creator.trim()

  // 团队资源：显示"团队名称-作者"，团队名（前缀）不带炫彩
  if (current.ownership_type === 'team' && current.team_name) {
    if (author) {
      return { prefix: `${current.team_name} -`, name: author }
    }
    return { prefix: current.team_name, name: '' }
  }

  // 个人资源：保持原有逻辑，只有用户名带炫彩
  if (author && creator && author === creator) {
    return { prefix: '作者 / 开发者', name: author }
  }

  if (author) {
    return { prefix: '作者', name: author }
  }
  return { prefix: '作者未知', name: '' }
})

const showCreatorMeta = computed(() => {
  const current = props.resource
  return current.creator.trim().length > 0 && current.creator.trim() !== current.author.trim()
})

/** 摘要要按平台名剥前缀，平台名里的正则元字符先转义再拼进 `RegExp`。 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const resourceSummaryText = computed(() => {
  const current = props.resource
  const description = current.description.trim()
  const platform = current.platform.trim()
  if (!description || !platform) {
    return description
  }

  const prefixPattern = new RegExp(`^${escapeRegExp(platform)}\\s*[·・-]\\s*`, 'i')
  return description.replace(prefixPattern, '').trim() || description
})
</script>

<template>
  <div class="resource-detail-page__summary-card">
    <div class="resource-detail-page__headline-row">
      <div class="resource-detail-page__headline-left">
        <span class="resource-detail-page__status-pill">{{ visibilityLabel }}</span>
        <span
          class="resource-detail-page__price-pill"
          :class="{
            'is-paid': isPricedResource(props.resource.price_fen, props.resource.price_points),
          }"
          >{{ props.priceLabel }}</span
        >
        <span class="resource-detail-page__repost-badge" :class="{ 'is-repost': isRepost }">{{
          originTypeLabel
        }}</span>
      </div>
      <span class="resource-detail-page__headline-right">
        <router-link
          v-if="props.resource.author"
          :to="{ name: 'dev-profile', params: { username: props.resource.author } }"
          class="resource-detail-page__author-pill resource-detail-page__author-pill--link"
        >
          <span class="resource-detail-page__author-pill-label">{{ authorPillParts.prefix }}</span
          ><span
            v-if="authorPillParts.name"
            :class="{
              'username-gradient':
                props.resource.author_username_gradient && !props.resource.author_username_color,
            }"
            :style="
              props.resource.author_username_color
                ? { color: props.resource.author_username_color }
                : {}
            "
            >{{ authorPillParts.name }}</span
          >
        </router-link>
        <span v-else class="resource-detail-page__author-pill">
          <span class="resource-detail-page__author-pill-label">{{ authorPillParts.prefix }}</span
          ><span
            v-if="authorPillParts.name"
            :class="{
              'username-gradient':
                props.resource.author_username_gradient && !props.resource.author_username_color,
            }"
            :style="
              props.resource.author_username_color
                ? { color: props.resource.author_username_color }
                : {}
            "
            >{{ authorPillParts.name }}</span
          >
        </span>
        <p
          v-if="showCreatorMeta"
          class="resource-detail-page__meta resource-detail-page__meta--aside"
        >
          <span class="resource-detail-page__meta-label--green">开发者：</span
          ><router-link
            v-if="props.resource.creator"
            :to="{ name: 'dev-profile', params: { username: props.resource.creator } }"
            :class="{
              'username-gradient':
                props.resource.creator_username_gradient && !props.resource.creator_username_color,
            }"
            :style="
              props.resource.creator_username_color
                ? { color: props.resource.creator_username_color }
                : {}
            "
            >{{ props.resource.creator }}</router-link
          >
          <span
            v-else
            :class="{
              'username-gradient':
                props.resource.creator_username_gradient && !props.resource.creator_username_color,
            }"
            :style="
              props.resource.creator_username_color
                ? { color: props.resource.creator_username_color }
                : {}
            "
            >{{ props.resource.creator }}</span
          >
        </p>
      </span>
    </div>
    <div class="resource-detail-page__identity-block">
      <h1 class="resource-detail-page__title">{{ props.resource.title }}</h1>
      <div v-if="isRepost" class="resource-detail-page__repost-meta">
        <a
          v-if="props.resource.origin_url"
          :href="props.resource.origin_url"
          target="_blank"
          rel="nofollow noopener"
          class="resource-detail-page__repost-origin"
        >
          {{ repostOriginLabel || '查看原始出处' }}
        </a>
        <span v-else class="resource-detail-page__repost-origin">{{ repostOriginLabel }}</span>
      </div>
      <p class="resource-detail-page__summary">
        {{ resourceSummaryText || '当前资源暂无简介。' }}
      </p>
    </div>

    <div v-if="tagNames.length > 0" class="resource-detail-page__tags">
      <span v-for="item in tagNames" :key="item" class="resource-detail-page__tag">{{ item }}</span>
    </div>

    <ResourceDetailCtaRow
      :resource="props.resource"
      :price-label="props.priceLabel"
      :needs-purchase="props.needsPurchase"
      :is-api-resource="props.isApiResource"
      :purchase-submitting="props.purchaseSubmitting"
      :like-submitting="props.likeSubmitting"
      @primary-cta="emit('primary-cta')"
      @toggle-like="emit('toggle-like')"
    />
  </div>
</template>

<style scoped src="./resource-detail-summary.css"></style>
