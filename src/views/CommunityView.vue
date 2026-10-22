<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { CommunityPost } from '@/api/community'
import CommunityCommentTree from '@/components/community/CommunityCommentTree.vue'
import CommunityComposerPanel from '@/components/community/CommunityComposerPanel.vue'
import CommunityPostDetail from '@/components/community/CommunityPostDetail.vue'
import CommunityPostList from '@/components/community/CommunityPostList.vue'
import CommunityScrollTopButton from '@/components/community/CommunityScrollTopButton.vue'
import { useCommunityBounty } from '@/composables/useCommunityBounty'
import { useCommunityBoost } from '@/composables/useCommunityBoost'
import { useCommunityComments } from '@/composables/useCommunityComments'
import { useCommunityComposer } from '@/composables/useCommunityComposer'
import { useCommunityFeed } from '@/composables/useCommunityFeed'
import { useCommunityPostDetail } from '@/composables/useCommunityPostDetail'
import { useAuthStore } from '@/stores/auth'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'

import { TMessage } from 'ui_73info'

/**
 * 社区页的壳：两栏栅格 + 六个域（帖子流 / 详情 / 推广 / 悬赏 / 评论 / 发帖）的接线。
 * 列表与详情的 DOM 在 `components/community/CommunityPostList.vue` /
 * `CommunityPostDetail.vue`，视觉规则在 `styles/portal-pages.css` 的「社区页」段。
 *
 * **刻意留在这层的只有三件**：`selectedPost`（根状态，视图创建、按引用传给每个域）、
 * `watch(selectedPost) → setSeoMeta`（SEO 跟页面走，放进子组件会随卸载重建抖动）、
 * 以及帖子流与详情域之间那两处互相需要的回环——所以下面有四个一行的「用时再取」注入。
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

/** 全局提示的唯一出口：子组件一律 `@notify` 转发上来，自己不许碰 `TMessage`。 */
function notify(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  TMessage[type](message)
}

const selectedPost = ref<CommunityPost | null>(null)

const canEditSelectedPost = computed(() =>
  Boolean(auth.isAuthed && selectedPost.value && selectedPost.value.author === auth.username),
)
const selectedPostPublished = computed(() => selectedPost.value?.status === 'published')

// ---------- 详情域：选中 / 按 id 单取 / 补取正文 / 竞态计数器（四个注入「用时再取」） ----------
const detail = useCommunityPostDetail({
  selectedPost,
  findPost: (postId) => posts.value.find((item) => item.id === postId),
  updateSelectedPost: (patch) => updateSelectedPost(patch),
  resetComments: () => resetComments(),
  loadComments: (postId, requestId) => loadComments(postId, requestId),
})
const { selectedPostLoading, isCurrentRequest, selectPost, selectPostById } = detail

// ---------- 帖子流：列表 / 筛选 / 分页 / 点赞 / 收藏 ----------
const {
  posts,
  tags,
  loading,
  favoriteLoading,
  selectedTag,
  searchDraft,
  searchKeyword,
  currentPage,
  hasNextPage,
  tagOptions,
  pageStatus,
  routePostId,
  loadCommunityData,
  selectTag,
  applySearch,
  clearSearch,
  goToPreviousPage,
  goToNextPage,
  toggleLike,
  toggleFavorite,
  updateSelectedPost,
} = useCommunityFeed({
  selectedPost,
  selectPost: detail.selectPost,
  onStandalonePost: detail.loadStandalonePost,
  ensureAuthed,
})

function ensureAuthed(): boolean {
  auth.hydrate()
  if (auth.isAuthed) {
    return true
  }
  TMessage.warning('请先登录后再操作社区内容')
  void router.push({ name: 'home', query: { modal: 'auth', redirect_to: '/community' } })
  return false
}

// ---------- 推广与悬赏（两域只在详情区有入口） ----------
const { BOOST_OPTIONS, boostingKind, canBoostSelectedPost, activeBoostLabels, handleBoost } =
  useCommunityBoost({
    selectedPost,
    updateSelectedPost,
    ensureAuthed,
    refreshList: () => {
      void loadCommunityData()
    },
  })

const { selectedPostBountyLabel, canManageBounty, acceptBountyAnswerHandler, cancelBountyHandler } =
  useCommunityBounty({ selectedPost, updateSelectedPost, ensureAuthed })

// ---------- 评论与发帖 ----------
const {
  commentsLoading,
  commentDraft,
  replyingTo,
  sendingComment,
  commentLikeLoading,
  rows: commentRows,
  loadComments,
  resetComments,
  submitComment,
  replyToComment,
  cancelReply,
  toggleReplies,
  toggleCommentLike,
  handleCommentAvatarError,
} = useCommunityComments({
  selectedPost,
  updateSelectedPost,
  ensureAuthed,
  // 竞态判定读详情域那一个计数器，评论域不自己另立一套
  isCurrentRequest,
})

const {
  composerVisible,
  editingPost,
  savingPost,
  postForm,
  composerActionsShellStyle,
  composerActionsFloating,
  composerActionsFloatingStyle,
  setComposerRef,
  openCreateComposer,
  openEditComposer,
  closeComposer,
  submitPost,
} = useCommunityComposer({
  selectedTag,
  ensureAuthed,
  // 保存成功后的收尾：新帖回第 1 页、重取列表、选中刚保存的那篇（顺序与改造前一致）
  onSaved: async (saved, isEditing) => {
    if (!isEditing) {
      currentPage.value = 1
    }
    await loadCommunityData()
    selectPost(saved)
  },
})

onMounted(() => {
  auth.hydrate()
  void loadCommunityData()
})

// 离开页面时把 SEO 还原（子组件卸载不负责这件事，见文件头第 2 点）
onBeforeUnmount(resetSeoMeta)

watch(
  () => [route.params.postId, route.query.post, route.query.postId] as const,
  () => {
    const postId = routePostId()
    if (postId) {
      selectPostById(postId)
    }
  },
)

// SEO 留在页面层：子组件卸载重建会让 title / description 抖一下。
watch(selectedPost, (post) => {
  if (!post) {
    setSeoMeta({
      title: '社区帖子 - 73Info 柒叁信息',
      description: '73Info 社区内容，查看开发者与用户发布的经验、反馈和讨论。',
      path: '/community',
    })
    return
  }

  const tags = post.tags.map((tag) => tag.name).join('、')
  setSeoMeta({
    title: `${post.title} - 73Info 社区帖子`,
    description: post.content_html || tags || '73Info 平台社区帖子详情。',
    path: `/community/posts/${post.id}`,
  })
})
</script>

<template>
  <main class="portal-page portal-page--nav community-page">
    <section class="community-board">
      <CommunityPostList
        v-model:search-draft="searchDraft"
        :loading="loading"
        :posts="posts"
        :tags="tags"
        :selected-tag="selectedTag"
        :selected-post-id="selectedPost?.id ?? null"
        :search-keyword="searchKeyword"
        :page-status="pageStatus"
        :current-page="currentPage"
        :has-next-page="hasNextPage"
        @refresh="loadCommunityData"
        @create="openCreateComposer"
        @select-tag="selectTag"
        @apply-search="applySearch"
        @clear-search="clearSearch"
        @previous-page="goToPreviousPage"
        @next-page="goToNextPage"
        @select-post="selectPost"
      />

      <aside class="community-detail">
        <CommunityComposerPanel
          v-if="composerVisible"
          v-model:title="postForm.title"
          v-model:tag-names="postForm.tag_names"
          v-model:content-html="postForm.content_html"
          v-model:origin-type="postForm.origin_type"
          v-model:origin-author="postForm.origin_author"
          v-model:origin-url="postForm.origin_url"
          v-model:origin-org="postForm.origin_org"
          v-model:origin-note="postForm.origin_note"
          v-model:bounty-points="postForm.bounty_points"
          :editing="Boolean(editingPost)"
          :saving="savingPost"
          :tag-options="tagOptions"
          :floating="composerActionsFloating"
          :shell-style="composerActionsShellStyle"
          :floating-style="composerActionsFloatingStyle"
          :set-ref="setComposerRef"
          @close="closeComposer"
          @submit="submitPost"
          @notify="notify"
        />

        <CommunityPostDetail
          v-else-if="selectedPost"
          :post="selectedPost"
          :loading="selectedPostLoading"
          :published="selectedPostPublished"
          :can-edit="canEditSelectedPost"
          :favorite-loading="favoriteLoading"
          :can-boost="canBoostSelectedPost"
          :boosting-kind="boostingKind"
          :boost-options="BOOST_OPTIONS"
          :boost-labels="activeBoostLabels"
          :bounty-label="selectedPostBountyLabel"
          :bounty-status="selectedPost.bounty_status"
          :can-manage-bounty="canManageBounty"
          :can-share="auth.isAuthed"
          @edit="openEditComposer"
          @like="toggleLike"
          @favorite="toggleFavorite"
          @boost="handleBoost"
          @cancel-bounty="cancelBountyHandler"
          @notify="notify"
        >
          <!-- 评论整块（标题行 + 同步指示 + 输入框 + 评论树）在 components/community/CommunityCommentTree.vue -->
          <CommunityCommentTree
            v-model:draft="commentDraft"
            :rows="commentRows"
            :loading="commentsLoading"
            :published="selectedPostPublished"
            :replying-to-id="replyingTo?.id ?? null"
            :sending="sendingComment"
            :like-loading-id="commentLikeLoading"
            :can-manage-bounty="canManageBounty"
            :author-name="selectedPost.author"
            :accepted-comment-id="selectedPost.bounty_accepted_comment_id ?? null"
            @submit="submitComment"
            @reply="replyToComment"
            @cancel-reply="cancelReply"
            @like="toggleCommentLike"
            @accept="acceptBountyAnswerHandler"
            @toggle-threads="toggleReplies"
            @avatar-error="handleCommentAvatarError"
          />
        </CommunityPostDetail>

        <section v-else class="community-panel community-empty">
          <strong>选择一篇帖子查看详情</strong>
        </section>
      </aside>
    </section>

    <CommunityScrollTopButton />
  </main>
</template>
