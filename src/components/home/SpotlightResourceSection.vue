<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import type { PublicMcResourceItem } from '@/api/resources'
import { useSpotlightCards, type SpotlightCard } from '@/composables/useSpotlightCards'
import { useSpotlightPagination } from '@/composables/useSpotlightPagination'

/**
 * 首页「免费资源」整块（R047 从 `views/HomeView.vue` 拆出）。
 *
 * 卡片映射在 `useSpotlightCards`、分页在 `useSpotlightPagination`；这里只剩三处**三面耦合**的
 * 渲染状态（markup / `styles/home.css` / JS 必须一起改）：
 *
 * 1. **作者跑马灯**：函数式 `:ref` 绑到 `.portal-spotlight-card__author`，量出
 *    `.portal-spotlight-card__author-text` 的溢出宽度后写进 CSS 变量 `--author-marquee-shift`，
 *    再给该行加 `is-marquee`——变量与 class 都由 home.css 里那两条动画规则消费，**类名不能改**。
 *    `ResizeObserver` 只按 `resourceId` 存一份，重绑前先 `disconnect`，卸载时全清。
 * 2. **翻页高度锁**：由 `useSpotlightPagination` 操作下面这个栅格的模板 ref。
 * 3. **点赞不回抛冒泡**：点赞按钮的 `@click.stop` 挡的是**同一组件内**外层卡片的
 *    `@click="emit('open', card)"`。所以卡片点击必须留在本组件里，不能上提到父级模板——
 *    一旦父级在更外层监听，`.stop` 就管不到，点赞会变成「点赞 + 打开详情」双触发。
 *
 * 样式仍在全局 `styles/home.css`（`.portal-spotlight-*` / `.portal-pagination*`），本组件不带 `<style>`。
 */
const props = defineProps<{
  /** 已发布资源（`usePublicResources` 持有的那一份，不在这里复制） */
  resources: PublicMcResourceItem[]
  /** 正在提交点赞的资源 id：按钮据此置灰并显示 busy */
  likeSubmittingIds: ReadonlySet<number>
}>()

const emit = defineEmits<{
  (e: 'open', card: SpotlightCard): void
  (e: 'like', card: SpotlightCard): void
  (e: 'more'): void
}>()

const { cards, coverSrc, handleCoverError } = useSpotlightCards({
  resources: computed(() => props.resources),
})

const gridRef = ref<HTMLElement | null>(null)

const {
  page,
  pageCount,
  pagedItems,
  paginationItems,
  jumpOpen,
  jumpAnchor,
  jumpValue,
  goPage,
  toggleJump,
  submitJump,
} = useSpotlightPagination({ items: cards, grid: gridRef })

const isLikeSubmitting = (resourceId?: number) =>
  resourceId != null && props.likeSubmittingIds.has(resourceId)

/** 作者名溢出时启用横向滚动的资源 id 集合 */
const authorMarqueeIds = ref<Set<number>>(new Set())
const authorObservers = new Map<number, ResizeObserver>()

function isAuthorMarquee(resourceId?: number): boolean {
  return resourceId != null && authorMarqueeIds.value.has(resourceId)
}

function updateAuthorMarquee(resourceId: number, el: HTMLElement) {
  const track = el.querySelector('.portal-spotlight-card__author-text') as HTMLElement | null
  if (!track) {
    return
  }
  const overflowPx = track.scrollWidth - el.clientWidth
  const overflow = overflowPx > 1
  el.style.setProperty('--author-marquee-shift', overflow ? `${-overflowPx}px` : '0px')
  const next = new Set(authorMarqueeIds.value)
  if (overflow) {
    next.add(resourceId)
  } else {
    next.delete(resourceId)
  }
  if (next.size !== authorMarqueeIds.value.size) {
    authorMarqueeIds.value = next
    return
  }
  for (const id of next) {
    if (!authorMarqueeIds.value.has(id)) {
      authorMarqueeIds.value = next
      return
    }
  }
}

function bindAuthorMarquee(el: unknown, resourceId?: number) {
  if (resourceId == null) {
    return
  }
  const prev = authorObservers.get(resourceId)
  if (prev) {
    prev.disconnect()
    authorObservers.delete(resourceId)
  }
  if (!(el instanceof HTMLElement)) {
    const next = new Set(authorMarqueeIds.value)
    next.delete(resourceId)
    authorMarqueeIds.value = next
    return
  }
  const measure = () => updateAuthorMarquee(resourceId, el)
  measure()
  // jsdom 没有 ResizeObserver：量一次就够，别让挂载直接抛 ReferenceError（与 PortalTopNav 同口径）。
  if (typeof ResizeObserver === 'undefined') {
    return
  }
  const observer = new ResizeObserver(measure)
  observer.observe(el)
  authorObservers.set(resourceId, observer)
}

onBeforeUnmount(() => {
  for (const observer of authorObservers.values()) {
    observer.disconnect()
  }
  authorObservers.clear()
})
</script>

<template>
  <section class="portal-section">
    <div class="portal-section__header">
      <div class="portal-section-title">
        <span class="portal-section-title__icon" aria-hidden="true">★</span>
        <h2>免费资源</h2>
      </div>
      <button class="portal-link-btn" type="button" @click="emit('more')">更多免费资源</button>
    </div>
    <template v-if="cards.length > 0">
      <div ref="gridRef" class="portal-spotlight-grid">
        <article
          v-for="card in pagedItems"
          :key="card.resourceId ?? card.title"
          class="portal-spotlight-card"
          :class="`portal-spotlight-card--${card.accent}`"
          role="button"
          tabindex="0"
          @click="emit('open', card)"
          @keydown.enter="emit('open', card)"
          @keydown.space.prevent="emit('open', card)"
        >
          <div class="portal-spotlight-card__cover">
            <img
              v-if="coverSrc(card)"
              class="portal-spotlight-card__cover-img"
              :src="card.coverUrl"
              :alt="card.coverAlt || `${card.title} 的资源封面图`"
              @error="handleCoverError(card.coverUrl)"
            />
            <span v-else class="portal-spotlight-card__cover-text">{{
              card.title.slice(0, 1).toUpperCase()
            }}</span>
            <span v-if="card.badge" class="portal-spotlight-card__badge">{{ card.badge }}</span>
            <span
              v-if="card.mark"
              class="portal-spotlight-card__mark portal-spotlight-card__mark--featured"
              role="img"
              :aria-label="card.mark"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path
                  d="m12 2.8 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-2.9-5.6 2.9 1.1-6.3-4.6-4.5 6.3-.9L12 2.8Z"
                />
              </svg>
            </span>
            <div class="portal-spotlight-card__screen portal-spotlight-card__screen--primary"></div>
            <div
              class="portal-spotlight-card__screen portal-spotlight-card__screen--secondary"
            ></div>
            <div
              class="portal-spotlight-card__screen portal-spotlight-card__screen--tertiary"
            ></div>
          </div>
          <div class="portal-spotlight-card__body">
            <h3>{{ card.title }}</h3>
            <p v-if="card.summary">{{ card.summary }}</p>
            <div v-if="card.tags.length" class="portal-spotlight-card__meta-row">
              <strong v-for="tag in card.tags" :key="tag">{{ tag }}</strong>
            </div>
            <div class="portal-spotlight-card__footer">
              <div class="portal-spotlight-card__footer-main">
                <span class="portal-spotlight-card__stats">
                  <span class="portal-spotlight-card__stat" title="浏览量">
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    {{ card.viewCount }}
                  </span>
                  <span class="portal-spotlight-card__stat" title="下载量">
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    {{ card.downloadCount }}
                  </span>
                </span>
                <span
                  v-if="card.authorLabel"
                  class="portal-spotlight-card__author"
                  :class="{
                    'is-marquee': isAuthorMarquee(card.resourceId),
                    'username-gradient': card.gradient && !card.userColor,
                  }"
                  :style="card.userColor ? { color: card.userColor } : undefined"
                  :title="card.authorLabel"
                  :ref="(el) => bindAuthorMarquee(el, card.resourceId)"
                >
                  <span class="portal-spotlight-card__author-text">{{ card.authorLabel }}</span>
                </span>
              </div>
              <div class="portal-spotlight-card__footer-bottom">
                <div class="portal-spotlight-card__footer-leading">
                  <span
                    v-if="card.originLabel"
                    class="portal-spotlight-card__origin"
                    :class="{ 'is-repost': card.originRepost }"
                    >{{ card.originLabel }}</span
                  >
                  <button
                    type="button"
                    class="portal-spotlight-card__likes"
                    :class="{
                      'is-liked': card.likedByMe,
                      'is-busy': isLikeSubmitting(card.resourceId),
                    }"
                    :title="card.likedByMe ? '取消点赞' : '点赞'"
                    :aria-pressed="card.likedByMe"
                    :aria-label="
                      card.likedByMe
                        ? `已点赞 ${card.likeCount}，点击取消`
                        : `点赞，当前 ${card.likeCount}`
                    "
                    :disabled="isLikeSubmitting(card.resourceId)"
                    @click.stop="emit('like', card)"
                    @keydown.enter.stop
                    @keydown.space.stop
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="13"
                      height="13"
                      :fill="card.likedByMe ? 'currentColor' : 'none'"
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
                    {{ card.likeCount }}
                  </button>
                </div>
                <span v-if="card.metaTime" class="portal-spotlight-card__time">{{
                  card.metaTime
                }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>

      <nav v-if="pageCount > 1" class="portal-pagination" aria-label="免费资源分页">
        <button
          class="portal-pagination__nav"
          type="button"
          :disabled="page <= 1"
          @click="goPage(page - 1)"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          上一页
        </button>
        <template v-for="item in paginationItems" :key="item.key">
          <button
            v-if="item.page"
            class="portal-pagination__page"
            :class="{ 'is-active': item.page === page }"
            type="button"
            @click="goPage(item.page ?? page)"
          >
            {{ item.label }}
          </button>
          <span v-else class="portal-pagination__jump-wrap">
            <button
              class="portal-pagination__ellipsis"
              type="button"
              aria-label="跳转到指定页"
              @click.stop="toggleJump(item.key)"
            >
              {{ item.label }}
            </button>
            <div
              v-if="jumpOpen && jumpAnchor === item.key"
              class="portal-pagination__jump"
              @click.stop
            >
              <span class="portal-pagination__jump-label">转到第</span>
              <input
                v-model="jumpValue"
                class="portal-pagination__jump-input"
                type="number"
                :min="1"
                :max="pageCount"
                inputmode="numeric"
                @keydown.enter.prevent="submitJump"
              />
              <span class="portal-pagination__jump-label">页</span>
              <button class="portal-pagination__jump-submit" type="button" @click="submitJump">
                跳转
              </button>
            </div>
          </span>
        </template>
        <button
          class="portal-pagination__nav"
          type="button"
          :disabled="page >= pageCount"
          @click="goPage(page + 1)"
        >
          下一页
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </nav>
    </template>
    <div v-else class="portal-empty-state">
      <strong>暂无免费资源</strong>
    </div>
  </section>
</template>
