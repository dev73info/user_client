<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import { HttpError } from '@/api/http'
import BetaTag from '@/components/BetaTag.vue'
import {
  invalidateResourceListCache,
  likePublicMcResource,
  unlikePublicMcResource,
} from '@/api/resources'
import { useAuthStore } from '@/stores/auth'
import { isPointsResource, isPricedResource } from '@/shared/resourceSale'
import { useAuthorMarquee } from '@/composables/useAuthorMarquee'
import {
  formatUpdatedAt,
  titleSizeClass,
  type McCardItem,
} from '@/components/resource-catalog/resourceCatalogModel'

/**
 * 桌面资源列表里的一张卡：封面（失败退图标）、标题（长标题缩字号压两行）、
 * 作者 / 开发者胶囊（放不下时左右往返滚动）、更新时间、售价与原创转载 chip、
 * 简介、标签、点赞与「查看详情」。
 *
 * 从 `ResourceCatalog.vue` 的模板里整块搬出来，结构与文案未改。点赞是卡片自己的动作
 * （赞态就落在这一条卡片数据上，失败会回滚），未登录时仍引导去登录；
 * 「查看详情」只把点击抛给列表，跳转口径（主从双栏 or 页内详情态）仍由列表决定。
 */
const props = defineProps<{
  card: McCardItem
}>()

const emit = defineEmits<{
  open: []
}>()

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const fallbackIcon = computed(() => '📁')

const { observe: observeAuthorMarquee } = useAuthorMarquee()

function onCoverError(card: McCardItem) {
  card.coverFailed = true
}

function openLikeLogin() {
  TMessage.info('请先登录后再点赞')
  void router.push({
    name: 'home',
    query: {
      modal: 'auth',
      mode: 'login',
      redirect_to: route.fullPath,
    },
  })
}

async function toggleCardLike(card: McCardItem) {
  if (card.likeSubmitting) {
    return
  }

  if (!auth.isAuthed || !auth.token.trim()) {
    openLikeLogin()
    return
  }

  card.likeSubmitting = true
  try {
    const state = card.likedByMe
      ? await unlikePublicMcResource(auth.token, card.id)
      : await likePublicMcResource(auth.token, card.id)
    card.likedByMe = state.liked_by_me
    card.likeCount = state.like_count
    invalidateResourceListCache()
    TMessage.success(state.liked_by_me ? '已点赞' : '已取消点赞')
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      auth.logout()
      openLikeLogin()
    } else {
      TMessage.error(error instanceof Error ? error.message : '点赞操作失败')
    }
  } finally {
    card.likeSubmitting = false
  }
}
</script>

<template>
  <article class="portal-resource-browser__card">
    <div class="portal-resource-browser__cover">
      <img
        v-if="props.card.coverUrl && !props.card.coverFailed"
        :src="props.card.coverUrl"
        :alt="props.card.title"
        class="portal-resource-browser__cover-image"
        @error="onCoverError(props.card)"
      />
      <span v-else class="portal-resource-browser__cover-fallback" aria-hidden="true">{{
        fallbackIcon
      }}</span>
      <span
        class="portal-resource-browser__price-badge"
        :class="{
          'is-paid': isPricedResource(
            props.card.priceFen,
            props.card.pricePoints,
            props.card.minVersionPriceFen,
          ),
          'is-points': isPointsResource(props.card.pricePoints),
        }"
        >{{ props.card.priceLabel }}</span
      >
      <span
        class="portal-resource-browser__meta"
        :class="{ 'is-repost': props.card.originType === 'repost' }"
        >{{ props.card.originType === 'repost' ? '转载' : '原创' }}</span
      >
      <!-- 面板价资源：封面右上角再戴一枚 BETA（与价格徽标同一套绝对定位口径）。 -->
      <BetaTag
        v-if="
          isPricedResource(
            props.card.priceFen,
            props.card.pricePoints,
            props.card.minVersionPriceFen,
          )
        "
        class="portal-resource-browser__beta"
      />
    </div>

    <div class="portal-resource-browser__body">
      <h3 :class="titleSizeClass(props.card.title)">{{ props.card.title }}</h3>
      <p class="portal-resource-browser__desc">{{ props.card.description }}</p>

      <div class="portal-resource-browser__meta-row">
        <p class="portal-resource-browser__author-pill">
          <span class="portal-resource-browser__author-pill-label">作者</span>
          <span :ref="observeAuthorMarquee" class="portal-resource-browser__author-pill-viewport">
            <span class="portal-resource-browser__author-pill-track">
              <span
                :class="{
                  'username-gradient':
                    props.card.authorUsernameGradient && !props.card.authorUsernameColor,
                }"
                :style="
                  props.card.authorUsernameColor ? { color: props.card.authorUsernameColor } : {}
                "
                >{{ props.card.author || '未知' }}</span
              >
            </span>
          </span>
          <template v-if="props.card.developer">
            <span class="portal-resource-browser__author-pill-label">开发者</span>
            <span :ref="observeAuthorMarquee" class="portal-resource-browser__author-pill-viewport">
              <span class="portal-resource-browser__author-pill-track">
                <span
                  :class="{
                    'username-gradient':
                      props.card.developerUsernameGradient && !props.card.developerUsernameColor,
                    'portal-resource-browser__author-pill-name--developer':
                      !props.card.developerUsernameGradient && !props.card.developerUsernameColor,
                  }"
                  :style="
                    props.card.developerUsernameColor
                      ? { color: props.card.developerUsernameColor }
                      : {}
                  "
                  >{{ props.card.developer }}</span
                >
              </span>
            </span>
          </template>
        </p>
        <span class="portal-resource-browser__updated">
          <span v-for="part in formatUpdatedAt(props.card.updatedAt)" :key="part">{{ part }}</span>
        </span>
      </div>

      <div v-if="props.card.tags.length" class="portal-resource-browser__tags">
        <span v-for="tag in props.card.tags" :key="`${props.card.id}-${tag}`">{{ tag }}</span>
      </div>
    </div>

    <div class="portal-resource-browser__footer">
      <button
        class="portal-resource-browser__like"
        type="button"
        :class="{ 'portal-resource-browser__like--active': props.card.likedByMe }"
        :disabled="props.card.likeSubmitting"
        :aria-pressed="props.card.likedByMe"
        @click="toggleCardLike(props.card)"
      >
        <span aria-hidden="true">{{ props.card.likedByMe ? '♥' : '♡' }}</span>
        <span>{{ props.card.likeCount }}</span>
      </button>
      <button
        class="portal-resource-browser__action"
        :class="{
          'is-paid': isPricedResource(
            props.card.priceFen,
            props.card.pricePoints,
            props.card.minVersionPriceFen,
          ),
        }"
        type="button"
        @click="emit('open')"
      >
        查看详情
      </button>
    </div>
  </article>
</template>

<style scoped src="./resource-catalog-card.css"></style>

<style scoped src="./resource-catalog-card-meta.css"></style>
