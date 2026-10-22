<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import { HttpError } from '@/api/http'
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

const fallbackIconClass = computed(() => 'bg-blue')
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
    <div class="portal-resource-browser__card-main">
      <div
        v-if="props.card.coverUrl && !props.card.coverFailed"
        class="portal-resource-browser__cover portal-resource-browser__cover--image"
      >
        <img
          :src="props.card.coverUrl"
          :alt="props.card.title"
          class="portal-resource-browser__cover-image"
          @error="onCoverError(props.card)"
        />
      </div>
      <div v-else class="portal-resource-browser__cover" :class="fallbackIconClass">
        {{ fallbackIcon }}
      </div>

      <div class="portal-resource-browser__body">
        <div class="portal-resource-browser__headline">
          <div class="portal-resource-browser__headline-main">
            <div class="portal-resource-browser__title-row">
              <div class="portal-resource-browser__title-main">
                <h3 :class="titleSizeClass(props.card.title)">{{ props.card.title }}</h3>
                <p class="portal-resource-browser__author-pill">
                  <span class="portal-resource-browser__author-pill-label">作者</span>
                  <span
                    :ref="observeAuthorMarquee"
                    class="portal-resource-browser__author-pill-viewport"
                  >
                    <span class="portal-resource-browser__author-pill-track">
                      <span
                        :class="{
                          'username-gradient':
                            props.card.authorUsernameGradient && !props.card.authorUsernameColor,
                        }"
                        :style="
                          props.card.authorUsernameColor
                            ? { color: props.card.authorUsernameColor }
                            : {}
                        "
                        >{{ props.card.author || '未知' }}</span
                      >
                      <template v-if="props.card.developer">
                        <span class="portal-resource-browser__author-pill-label">开发者</span>
                        <span
                          :class="{
                            'username-gradient':
                              props.card.developerUsernameGradient &&
                              !props.card.developerUsernameColor,
                          }"
                          :style="
                            props.card.developerUsernameColor
                              ? { color: props.card.developerUsernameColor }
                              : {}
                          "
                          >{{ props.card.developer }}</span
                        >
                      </template>
                    </span>
                  </span>
                </p>
              </div>
              <span class="portal-resource-browser__updated">
                <span v-for="part in formatUpdatedAt(props.card.updatedAt)" :key="part">{{
                  part
                }}</span>
              </span>
            </div>
            <div class="portal-resource-browser__author-line">
              <span
                class="portal-resource-browser__price-badge"
                :class="{
                  'is-paid': isPricedResource(props.card.priceFen, props.card.pricePoints),
                  'is-points': isPointsResource(props.card.pricePoints),
                }"
                >{{ props.card.priceLabel }}</span
              >
              <span
                class="portal-resource-browser__meta"
                :class="{ 'is-repost': props.card.originType === 'repost' }"
                >{{ props.card.originType === 'repost' ? '转载' : '原创' }}</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <p class="portal-resource-browser__desc">{{ props.card.description }}</p>

    <div class="portal-resource-browser__footer">
      <div class="portal-resource-browser__tags">
        <span v-for="tag in props.card.tags" :key="`${props.card.id}-${tag}`">{{ tag }}</span>
      </div>
      <div class="portal-resource-browser__actions">
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
        <button class="portal-resource-browser__action" type="button" @click="emit('open')">
          查看详情
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped src="./resource-catalog-card.css"></style>

<style scoped src="./resource-catalog-card-meta.css"></style>
