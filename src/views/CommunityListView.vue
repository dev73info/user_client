<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, Refresh, TButton, TEmpty, TIcon } from 'ui_73info'

import type { CommunityPost } from '@/api/community'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import CommunityListPanel from '@/components/community/CommunityListPanel.vue'
import CommunityPostPanel from '@/components/community/CommunityPostPanel.vue'
import CommunityToolbar from '@/components/community/CommunityToolbar.vue'
import { useCommunityList, type CommunityListMode } from '@/composables/useCommunityList'

const route = useRoute()
const router = useRouter()
const detailColumnRef = ref<HTMLElement | null>(null)
const listColumnRef = ref<HTMLElement | null>(null)
const panelRef = ref<InstanceType<typeof CommunityListPanel> | null>(null)
const isCommunityPage = computed(() => route.name === 'community')
const isWorkbenchFavorites = computed(() => route.name === 'workbench-favorites')
/** 右栏比左栏高时按序补齐的后续帖子：只作展示，不改变当前页的页码与页大小。 */
const fillPosts = ref<CommunityPost[]>([])
const selectedPostId = computed(() => {
  const value = Number(route.query.post)
  return Number.isSafeInteger(value) && value > 0 ? value : null
})

/** 列表状态提到视图：分栏页顶部工具栏与左侧列表共用同一份。 */
const list = reactive(useCommunityList())

// 从详情回到列表（例如作者删除帖子后清空 post 参数）时刷新，避免已删除的帖子还挂在左栏。
watch(selectedPostId, (current, previous) => {
  if (previous !== null && current === null) void list.load()
})

let detailObserver: ResizeObserver | null = null
let layoutTimer: number | null = null
let railFilling = false

const MIN_FILL_SHORTFALL = 96
const MAX_FILL_CARDS = 60

/** 左栏当前渲染出来的高度（帖子卡 + 分页）。 */
function railHeight(): number {
  return listColumnRef.value?.scrollHeight ?? 0
}

/** 右栏变高时补卡、变矮时撤卡，让左栏用后续帖子填满右栏那一列，不留大片空白。 */
async function syncRailFill(): Promise<void> {
  const detail = detailColumnRef.value
  if (!detail || !isCommunityPage.value || window.innerWidth <= 900) return
  if (railFilling) return
  railFilling = true
  try {
    const detailHeight = detail.offsetHeight
    if (detailHeight < 200) return
    while (fillPosts.value.length > 0 && railHeight() - detailHeight > MIN_FILL_SHORTFALL) {
      fillPosts.value.pop()
      await nextTick()
    }
    if (!list.hasNext && fillPosts.value.length === 0) return
    let nextPage = list.page + 1
    let buffer: CommunityPost[] = []
    let appended = 0
    while (appended < MAX_FILL_CARDS && detailHeight - railHeight() >= MIN_FILL_SHORTFALL) {
      if (buffer.length === 0) {
        buffer = await list.fetchPage(nextPage)
        nextPage += 1
        if (buffer.length === 0) break
      }
      const next = buffer.shift()
      if (!next) break
      if (list.posts.some((post) => post.id === next.id)) continue
      if (fillPosts.value.some((post) => post.id === next.id)) continue
      fillPosts.value.push(next)
      appended += 1
      await nextTick()
    }
  } finally {
    railFilling = false
  }
}

/** 右栏内容变高/变矮时同步左栏高度；每页条数固定 10 条，不随视口重算。 */
function syncSplitLayout() {
  layoutTimer = null
  if (!isCommunityPage.value || window.innerWidth <= 900) {
    fillPosts.value = []
    return
  }
  const detailHeight = detailColumnRef.value?.offsetHeight ?? 0
  if (detailHeight < 200) return
  void syncRailFill()
}

function scheduleSplitLayout() {
  /* 切换帖子时详情会先落成 loading 骨架再撑开，等稳定后再同步左栏高度。 */
  if (layoutTimer !== null) window.clearTimeout(layoutTimer)
  layoutTimer = window.setTimeout(syncSplitLayout, 200)
}

function handleViewportResize() {
  scheduleSplitLayout()
}

onMounted(() => {
  if (!isCommunityPage.value) return
  void nextTick(() => {
    const detail = detailColumnRef.value
    if (!detail || typeof ResizeObserver === 'undefined') return
    detailObserver = new ResizeObserver(scheduleSplitLayout)
    detailObserver.observe(detail)
    window.addEventListener('resize', handleViewportResize)
    scheduleSplitLayout()
  })
})

onBeforeUnmount(() => {
  detailObserver?.disconnect()
  detailObserver = null
  window.removeEventListener('resize', handleViewportResize)
  if (layoutTimer !== null) window.clearTimeout(layoutTimer)
  layoutTimer = null
})

/** 分栏页的页签（收藏页由面板自己按 hideAllMode 收窄，不走这里）。 */
const communityModes: Array<{ value: CommunityListMode; label: string }> = [
  { value: 'all', label: '全部帖子' },
  { value: 'mine', label: '我的帖子' },
  { value: 'favorites', label: '我的收藏' },
]

async function selectPost(post: CommunityPost, options: { scroll?: boolean } = {}) {
  if (!isCommunityPage.value || selectedPostId.value === post.id) return
  if (window.innerWidth <= 900) {
    await router.push({ name: 'community-post', params: { id: String(post.id) } })
    return
  }
  await router.replace({ query: { ...route.query, post: String(post.id) } })
  if (options.scroll === false) return
  await nextTick()
  if (typeof detailColumnRef.value?.scrollIntoView === 'function') {
    detailColumnRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function handlePostsLoaded(posts: CommunityPost[]) {
  fillPosts.value = []
  if (!isCommunityPage.value || posts.length === 0) return
  if (window.innerWidth <= 900) return
  scheduleSplitLayout()
  if (posts.some((post) => post.id === selectedPostId.value)) return
  // 首次进页自动选中第一条时不要滚动：此时路由刚挂载，外壳正按门户锚点定位，
  // 这里再 scrollIntoView 会把整页带离工具栏（并延续到下一个页面）。
  void selectPost(posts[0]!, { scroll: false })
}
</script>

<template>
  <main
    class="community-page"
    :class="
      isCommunityPage
        ? 'community-page--split'
        : 'page-shell custom-page-shell profile-page wb-sheet community-favorites-page'
    "
  >
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
        <div ref="listColumnRef" class="community-page__list-column">
          <CommunityListPanel
            ref="panelRef"
            :list="list"
            selectable
            hide-chrome
            :fill-posts="fillPosts"
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

    <template v-else>
      <!-- 工作台菜单页统一版式：顶部读数条只放「当前列表 / 页码」与刷新，
           发布按钮跟页签同一行，下面是同一张纸里的帖子列表（页头标题由中栏菜单承担）。 -->
      <WorkbenchBarSlot>
        <div class="wb-strip" aria-label="我的帖子概览">
          <div class="wb-strip__item">
            <span class="wb-strip__label">当前列表</span>
            <span class="wb-strip__value">{{ list.posts.length }} 篇</span>
          </div>
          <div class="wb-strip__divider" />
          <div class="wb-strip__item">
            <span class="wb-strip__label">页码</span>
            <span class="wb-strip__value">{{ list.page }}</span>
          </div>
          <div class="wb-strip__item wb-strip__action">
            <TButton icon-only :loading="list.loading" aria-label="刷新社区帖子" @click="list.load">
              <TIcon><Refresh /></TIcon>
            </TButton>
          </div>
        </div>
      </WorkbenchBarSlot>

      <section class="wallet-section">
        <CommunityListPanel
          ref="panelRef"
          :list="list"
          :hide-all-mode="isWorkbenchFavorites"
          hide-header
          :selected-post-id="selectedPostId"
          @select-post="selectPost"
          @posts-loaded="handlePostsLoaded"
          @created="selectPost"
        >
          <template #actions>
            <TButton variant="solid" tone="accent" @click="panelRef?.openCreate()">
              <TIcon><Plus /></TIcon>
              发布帖子
            </TButton>
          </template>
        </CommunityListPanel>
      </section>
    </template>
  </main>
</template>

<style src="../styles/community-workbench.css"></style>

<style scoped src="../styles/community-list-view.css"></style>
