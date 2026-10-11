<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRouter } from 'vue-router'
import { listFavoriteCommunityPosts, type CommunityPost } from '@/api/community'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'


import {
  TButton,
  TIcon,
  TInput,
  TOption,
  TPagination,
  TSelect,
  ArrowRight,
  ChatDotRound,
  Refresh,
  RefreshLeft,
  Search,
  Star,
} from 'ui_73info'

const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()
const posts = ref<CommunityPost[]>([])
const loading = ref(false)
const keyword = ref('')
const selectedTag = ref('all')

/* 标签筛选取自己收藏过的帖子：收藏量本来就不大，没必要再为标签多打一个接口。
   按出现次数从多到少排，只留前 8 个，否则标签一多工具栏会被撑成好几行。 */
const tagFilters = computed(() => {
  const counter = new Map<string, number>()
  for (const post of posts.value) {
    for (const tag of post.tags ?? []) {
      counter.set(tag.name, (counter.get(tag.name) ?? 0) + 1)
    }
  }
  return [...counter.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }))
})

const filteredPosts = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase()
  return posts.value.filter((post) => {
    const matchesTag = selectedTag.value === 'all' || (post.tags ?? []).some((tag) => tag.name === selectedTag.value)
    const matchesSearch = !search || [post.title, post.author, preview(post.content_html),
      ...(post.tags ?? []).map((tag) => tag.name)].some((field) => field?.toLocaleLowerCase().includes(search))
    return matchesTag && matchesSearch
  })
})

const hasActiveFilters = computed(() => keyword.value.trim() !== '' || selectedTag.value !== 'all')

/* 一次取回全部收藏、筛选在前端做，所以这里是客户端分页（与其余菜单页同一套页码与每页条数口径）。 */
const {
  page,
  pageSize,
  total: filteredTotal,
  paged: pagedPosts,
  resetPage,
} = useClientPagination(filteredPosts)

/* 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。 */
watch([keyword, selectedTag], resetPage)

function resetFilters() {
  keyword.value = ''
  selectedTag.value = 'all'
}

async function loadFavorites() {
  auth.hydrate()
  if (!auth.token.trim()) return
  loading.value = true
  resetPage()
  try {
    posts.value = await listFavoriteCommunityPosts(auth.token)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载我的收藏失败', 'error')
  } finally {
    loading.value = false
  }
}

function openPost(post: CommunityPost) {
  void router.push({ name: 'community-post', params: { postId: post.id } })
}

function preview(content: string) {
  return sanitizeRichHtml(content).replace(/<[^>]*>/g, '').trim().slice(0, 120)
}

onMounted(() => {
  void loadFavorites()
})
</script>

<template>
  <main class="page-shell custom-page-shell profile-page my-favorites-page" :aria-busy="loading">
    <!-- 顶部读数条：读数在最左，页面级刷新固定在右上角 -->
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="收藏概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">收藏帖子</span>
          <span class="wb-strip__value">{{ loading ? '—' : posts.length }}</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">涉及标签</span>
          <span class="wb-strip__value">{{ loading ? '—' : tagFilters.length }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only :loading="loading" aria-label="刷新收藏列表" @click="loadFavorites">
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">我的收藏</h3>
        </div>
        <div class="wb-card-head__actions">
          <TButton variant="solid" tone="accent" @click="router.push({ name: 'community' })">
            <TIcon><ArrowRight /></TIcon><span>浏览社区</span>
          </TButton>
        </div>
      </div>

      <div v-if="posts.length || hasActiveFilters" class="wb-toolbar">
        <div v-if="tagFilters.length" class="wb-chip-group" role="group" aria-label="按标签筛选">
          <button type="button" class="wb-chip wb-chip--button" :class="{ 'is-active': selectedTag === 'all' }"
            :aria-pressed="selectedTag === 'all'" @click="selectedTag = 'all'">
            全部<span class="wb-chip__count">{{ posts.length }}</span>
          </button>
          <button v-for="tag in tagFilters" :key="tag.name" type="button" class="wb-chip wb-chip--button"
            :class="{ 'is-active': selectedTag === tag.name }" :aria-pressed="selectedTag === tag.name"
            @click="selectedTag = tag.name">
            {{ tag.name }}<span class="wb-chip__count">{{ tag.count }}</span>
          </button>
        </div>
        <TInput v-model="keyword" class="wb-toolbar__search" clearable placeholder="搜索标题、作者或标签"
          aria-label="搜索收藏">
          <template #prefix><TIcon><Search /></TIcon></template>
        </TInput>
        <div class="wb-toolbar__actions">
          <span v-if="hasActiveFilters" class="wb-toolbar__hint">筛选出 {{ filteredTotal }} / {{ posts.length }} 篇</span>
          <TButton variant="outline" v-if="hasActiveFilters" @click="resetFilters">
            <TIcon><RefreshLeft /></TIcon><span>重置</span>
          </TButton>
        </div>
      </div>

      <p v-if="loading && !posts.length" class="wb-empty" role="status">正在加载收藏…</p>
      <div v-else-if="!filteredPosts.length" class="wb-empty">
        <span class="wb-empty__title">{{ posts.length ? '没有符合条件的收藏' : '还没有收藏帖子' }}</span>
        <template v-if="posts.length">
          <div class="wb-empty__actions">
            <TButton variant="outline" @click="resetFilters">
              <TIcon><RefreshLeft /></TIcon><span>清除筛选</span>
            </TButton>
          </div>
        </template>
        <template v-else>在社区里看到值得回看的内容，点亮收藏，之后就能在这里找到。</template>
      </div>
      <template v-else>
        <ul class="wb-list" aria-label="我收藏的帖子">
          <li v-for="post in pagedPosts" :key="post.id" class="wb-item wb-item--clickable" @click="openPost(post)">
            <div class="wb-item__main">
              <RouterLink class="wb-item__title favorites__title"
                :to="{ name: 'community-post', params: { postId: post.id } }">{{ post.title }}</RouterLink>
              <span class="wb-item__meta">{{ post.author }} · {{ post.published_at }}</span>
              <span class="wb-item__meta favorites__preview">
                {{ preview(post.content_html) || '这篇帖子暂未添加正文摘要。' }}
              </span>
            </div>
            <div class="wb-item__side">
              <span v-for="tag in post.tags" :key="tag.id" class="wb-badge">{{ tag.name }}</span>
              <span class="favorites__metrics">
                <span><TIcon><Star /></TIcon>{{ post.like_count }}</span>
                <span><TIcon><ChatDotRound /></TIcon>{{ post.comment_count }}</span>
              </span>
            </div>
          </li>
        </ul>
        <div class="wb-pager">
          <div class="wb-pager__count">
            <TSelect v-model="pageSize" class="wb-pager__size" aria-label="每页帖子数">
              <TOption v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
            </TSelect>
          </div>
          <TPagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal"
            :pager-count="5" background aria-label="收藏分页" />
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
/* 版式走统一层（.wb-strip / .wb-card-head / .wb-toolbar / .wb-list / .wb-pager），
   本页只保留摘要的行数限制与点赞/评论读数。 */
.favorites__preview {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.favorites__title:hover {
  color: var(--profile-accent);
}

.favorites__metrics {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: var(--profile-text-sub);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.favorites__metrics span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
