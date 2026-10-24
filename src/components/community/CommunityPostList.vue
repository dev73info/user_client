<script setup lang="ts">
import { computed } from 'vue'

import {
  isRepostPost,
  postBoostLabel,
  postStatusText,
  type CommunityPost,
  type CommunityTag,
} from '@/shared/community/postDisplay'

import { TIcon, ArrowLeft, ArrowRight, Close, Plus, Refresh, Search } from 'ui_73info'

/**
 * 社区页左栏的整块：刷新 / 发帖两个入口 + 搜索行 + 标签行 + 帖子卡列表 + 分页。
 *
 * 纯展示：取数、筛选、分页、点赞与收藏都在 `useCommunityFeed`，这里一个 `@/api/*`、
 * `TMessage`、`router` 都不引；类型与「怎么显示」的纯函数来自 `shared/community/postDisplay`。
 *
 * ## 样式不在这里
 *
 * `.community-*` 的视觉规则整块搬到了 `styles/portal-pages.css` 的「社区页」段
 * （R047 第三轮）。原因是 `check-frontend` 的裸色值门禁：新组件里出现 `#rrggbb` /
 * `rgba()` 就是新增违规，而那张样式表里的色值一个都不能换成令牌——门户蓝 `#2563eb`
 * 与 `--73-accent`（`#1f4ad1`）不是同一个值，换过去就是改视觉。搬到全局层既不动一个
 * 声明，也让左右两栏（流 + 详情）共用同一份骨架规则，不会再出现「两栏各自 scoped、
 * 互不认识 `.community-empty` / `.community-stream`」的老问题。
 *
 * ## 结构
 *
 * 根节点就是 `.community-stream`（栅格左栏、吸顶、描边圆角），DOM 与拆分前**逐节点一致**：
 * hero → 搜索行 → 标签行 → 加载/空态/列表 → 分页。断点只有 900 / 640 两档，都在全局那份里。
 */
const props = defineProps<{
  /** 列表请求进行中（同时决定「社区内容加载中」与刷新按钮文案）。 */
  loading: boolean
  /** 当前页的帖子。 */
  posts: CommunityPost[]
  /** 标签接口结果（铺标签行）。 */
  tags: CommunityTag[]
  /** 当前选中的标签名，空串表示「全部」。 */
  selectedTag: string
  /** 详情区正在看的那篇，用于给卡片打选中态。 */
  selectedPostId: number | null
  /** 已生效的搜索关键词（清空按钮的显隐要跟草稿一起看）。 */
  searchKeyword: string
  /** 分页状态文案（第几页 · 第几条到第几条）。 */
  pageStatus: string
  currentPage: number
  hasNextPage: boolean
}>()

const emit = defineEmits<{
  /** 「刷新」：重取标签与当前页。 */
  refresh: []
  /** 「发布帖子」：打开右栏编辑器。 */
  create: []
  /** 点标签（含「全部」传空串）：开关式切换并回第 1 页。 */
  selectTag: [tagName: string]
  /** 提交搜索行。 */
  applySearch: []
  /** 点输入框里的叉。 */
  clearSearch: []
  previousPage: []
  nextPage: []
  /** 点帖子卡：进详情。 */
  selectPost: [post: CommunityPost]
}>()

/** 搜索草稿：输入即回传（清空按钮与「有没有在筛」都读它）。 */
const searchDraft = defineModel<string>('searchDraft', { required: true })

/** 空态标题：筛过是「没有匹配的帖子」，没筛是「暂无帖子」（纯展示口径，留在这里算）。 */
const emptyTitle = computed(() =>
  props.selectedTag || props.searchKeyword ? '没有匹配的帖子' : '暂无帖子',
)
</script>

<template>
  <section class="community-stream">
    <div class="community-hero">
      <div class="community-hero__actions">
        <button
          class="community-hero__button community-hero__button--ghost"
          type="button"
          :disabled="loading"
          @click="emit('refresh')"
        >
          <TIcon :class="{ 'is-spinning': loading }">
            <Refresh />
          </TIcon>
          <span>{{ loading ? '刷新中' : '刷新' }}</span>
        </button>
        <button
          class="community-hero__button community-hero__button--primary"
          type="button"
          @click="emit('create')"
        >
          <TIcon>
            <Plus />
          </TIcon>
          <span>发布帖子</span>
        </button>
      </div>
    </div>

    <form class="community-search-bar" @submit.prevent="emit('applySearch')">
      <div class="community-search-field">
        <TIcon>
          <Search />
        </TIcon>
        <input
          v-model="searchDraft"
          type="text"
          inputmode="search"
          enterkeyhint="search"
          aria-label="搜索社区帖子"
          placeholder="搜索标题、作者、正文或标签"
        />
        <button
          v-if="searchDraft || searchKeyword"
          class="community-search-clear"
          type="button"
          aria-label="清空搜索"
          @click="emit('clearSearch')"
        >
          <TIcon>
            <Close />
          </TIcon>
        </button>
      </div>
      <button class="community-search-submit" type="submit" :disabled="loading">
        <TIcon>
          <Search />
        </TIcon>
        <span>搜索</span>
      </button>
    </form>

    <div class="community-tag-row">
      <button
        class="community-tag"
        :class="{ 'is-active': !selectedTag }"
        type="button"
        @click="emit('selectTag', '')"
      >
        全部
      </button>
      <button
        v-for="tag in tags"
        :key="tag.id"
        class="community-tag"
        :class="{ 'is-active': selectedTag === tag.name }"
        type="button"
        @click="emit('selectTag', tag.name)"
      >
        {{ tag.name }}
      </button>
    </div>

    <div v-if="loading" class="community-empty">社区内容加载中</div>
    <div v-else-if="posts.length === 0" class="community-empty">
      <strong>{{ emptyTitle }}</strong>
    </div>
    <div v-else class="community-post-list">
      <article
        v-for="post in posts"
        :key="post.id"
        class="community-post-card"
        :class="{ 'is-active': selectedPostId === post.id }"
        @click="emit('selectPost', post)"
      >
        <div class="community-post-card__head">
          <div>
            <h3>{{ post.title }}</h3>
            <p>
              <strong
                :class="{
                  'username-gradient': post.author_username_gradient && !post.author_username_color,
                }"
                :style="post.author_username_color ? { color: post.author_username_color } : {}"
                >{{ post.author }}</strong
              >
              ·
              {{ post.published_at }}
            </p>
          </div>
          <div class="community-post-card__badges">
            <span
              v-if="post.status !== 'published'"
              class="community-status-badge"
              :class="`is-${post.status}`"
              >{{ postStatusText(post.status) }}</span
            >
            <span v-if="post.is_featured" class="community-featured-badge">精华</span>
            <span v-if="postBoostLabel(post)" class="community-boost-badge">{{
              postBoostLabel(post)
            }}</span>
            <span class="community-repost-badge" :class="{ 'is-repost': isRepostPost(post) }">{{
              isRepostPost(post) ? '转载' : '原创'
            }}</span>
            <span>{{ post.like_count }} 赞</span>
          </div>
        </div>
        <div class="community-post-card__meta">
          <div class="community-post-card__tags">
            <span v-for="tag in post.tags" :key="tag.id">{{ tag.name }}</span>
          </div>
          <span>{{ post.comment_count }} 条评论</span>
          <span>更新 {{ post.updated_at }}</span>
        </div>
      </article>
    </div>

    <div v-if="!loading && (posts.length > 0 || currentPage > 1)" class="community-pagination">
      <button
        class="community-page-button"
        type="button"
        :disabled="currentPage <= 1"
        @click="emit('previousPage')"
      >
        <TIcon>
          <ArrowLeft />
        </TIcon>
        <span>上一页</span>
      </button>
      <span class="community-page-status">{{ pageStatus }}</span>
      <button
        class="community-page-button"
        type="button"
        :disabled="!hasNextPage"
        @click="emit('nextPage')"
      >
        <span>下一页</span>
        <TIcon>
          <ArrowRight />
        </TIcon>
      </button>
    </div>
  </section>
</template>
