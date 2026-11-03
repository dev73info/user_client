<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TEmpty } from 'ui_73info'

import type { CommunityPost } from '@/api/community'
import CommunityListPanel from '@/components/community/CommunityListPanel.vue'
import CommunityPostPanel from '@/components/community/CommunityPostPanel.vue'
import CommunityToolbar from '@/components/community/CommunityToolbar.vue'
import { useCommunityList, type CommunityListMode } from '@/composables/useCommunityList'

const route = useRoute()
const router = useRouter()
const detailColumnRef = ref<HTMLElement | null>(null)
const panelRef = ref<InstanceType<typeof CommunityListPanel> | null>(null)
const isCommunityPage = computed(() => route.name === 'community')
const isWorkbenchFavorites = computed(() => route.name === 'workbench-favorites')
const selectedPostId = computed(() => {
  const value = Number(route.query.post)
  return Number.isSafeInteger(value) && value > 0 ? value : null
})

/** 列表状态提到视图：分栏页顶部工具栏与左侧列表共用同一份。 */
const list = reactive(useCommunityList())

/** 分栏页的页签（收藏页由面板自己按 hideAllMode 收窄，不走这里）。 */
const communityModes: Array<{ value: CommunityListMode; label: string }> = [
  { value: 'all', label: '全部帖子' },
  { value: 'mine', label: '我的帖子' },
  { value: 'favorites', label: '我的收藏' },
]

async function selectPost(post: CommunityPost) {
  if (!isCommunityPage.value || selectedPostId.value === post.id) return
  await router.replace({ query: { ...route.query, post: String(post.id) } })
  if (window.innerWidth > 900) return
  await nextTick()
  if (typeof detailColumnRef.value?.scrollIntoView === 'function') {
    detailColumnRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function handlePostsLoaded(posts: CommunityPost[]) {
  if (!isCommunityPage.value || posts.length === 0) return
  if (posts.some((post) => post.id === selectedPostId.value)) return
  void selectPost(posts[0]!)
}
</script>

<template>
  <main class="community-page" :class="{ 'community-page--split': isCommunityPage }">
    <template v-if="isCommunityPage">
      <header class="portal-hero-strip community-hero">
        <div class="portal-hero-strip__copy">
          <div class="portal-hero-strip__eyebrow-chip">[ COMMUNITY · 社区中心 ]</div>
          <h1>社区中心</h1>
          <p>技术分享、开发日志与问题讨论，和开发者一起把问题聊清楚。</p>
        </div>
        <span v-if="list.posts.length" class="community-hero__stat">
          <span class="community-hero__pulse" aria-hidden="true"></span>
          本页 <strong>{{ list.posts.length }}</strong> 篇帖子
        </span>
      </header>

      <CommunityToolbar :list="list" :modes="communityModes" @publish="panelRef?.openCreate()" />

      <div class="community-page__split-body">
        <div class="community-page__list-column">
          <CommunityListPanel
            ref="panelRef"
            :list="list"
            selectable
            hide-chrome
            :selected-post-id="selectedPostId"
            @select-post="selectPost"
            @posts-loaded="handlePostsLoaded"
            @created="selectPost"
          />
        </div>

        <section ref="detailColumnRef" class="community-page__detail-column">
          <CommunityPostPanel v-if="selectedPostId" :post-id="selectedPostId" />
          <TEmpty v-else description="选择左侧帖子查看内容" />
        </section>
      </div>
    </template>

    <div v-else class="community-page__list-column">
      <CommunityListPanel
        ref="panelRef"
        :list="list"
        :hide-all-mode="isWorkbenchFavorites"
        :selected-post-id="selectedPostId"
        @select-post="selectPost"
        @posts-loaded="handlePostsLoaded"
        @created="selectPost"
      />
    </div>
  </main>
</template>

<style src="../styles/community-workbench.css"></style>

<style scoped>
.community-page {
  width: min(1280px, calc(100% - 24px));
  margin: 0 auto;
  padding: 0 0 64px;
  color: var(--73-ink);
}
/* 顶部工具栏单独一行，下面才是「侧边帖子 + 中间内容」两栏；两栏撑到视口底，
   左栏的分页器才有「列底」可沉 */
.community-page--split {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--portal-header-footprint, 98px) - 24px);
  overflow: hidden;
  padding-bottom: 0;
}
.community-page--split .community-page__detail-column {
  min-height: 0;
  overflow: auto;
}
.community-page__split-body {
  display: grid;
  grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
  flex: 1 1 auto;
  min-height: 0;
}
.community-page__list-column {
  min-width: 0;
}
/* 左栏固定成视口高的一列：帖子在中间滚动，分页器沉到列底（而不是跟着列表中途停住） */
.community-page--split .community-page__list-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.community-page__detail-column {
  min-width: 0;
}

/* 分栏页的列表栏不再外套一层卡：帖子行本身已经是卡，外面这层边界是重复的层级。
   与工作台收藏页的口径一致，列表直接落在页面底上。 */
.community-page--split .community-page__list-column :deep(.community-list-panel) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

/* 帖子区自己滚，表尾（分页）留在列底 */
.community-page--split :deep(.community-page__results) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}

.community-page--split :deep(.community-pagination) {
  margin-top: auto;
}

/* 工作台收藏页（不带 --split）：列表撑满内容区，分页沉到表尾。
   与「我的发票 / 积分记录」同一口径：视口减顶栏、外壳内边距与内容区 18px 内边距
   （这一页不挂 .wb-sheet，内容区内边距没有归零），否则百分比高度会被外壳的
   min-height: 0 吃掉。 */
.community-page:not(.community-page--split) {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--portal-header-footprint, 98px) - 60px);
}

.community-page:not(.community-page--split) .community-page__list-column {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.community-page:not(.community-page--split)
  .community-page__list-column
  :deep(.community-list-panel) {
  flex: 1 1 auto;
}

.community-page:not(.community-page--split) :deep(.community-pagination) {
  margin-top: auto;
}
@media (max-width: 900px) {
  .community-page--split {
    height: auto;
    overflow: visible;
    padding-bottom: 64px;
  }
  .community-page__split-body {
    grid-template-columns: 1fr;
  }
  .community-page--split .community-page__detail-column {
    overflow: visible;
  }
  .community-page--split .community-page__list-column {
    overflow: visible;
  }
  .community-page--split :deep(.community-page__results) {
    overflow: visible;
  }
}
@media (max-width: 640px) {
  .community-page {
    padding-top: 16px;
  }
}
</style>
