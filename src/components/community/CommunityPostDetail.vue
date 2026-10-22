<script setup lang="ts">
import { computed, ref } from 'vue'

import ShareCardGenerator from '@/components/ShareCardGenerator.vue'
import CommunityBountyBar from '@/components/community/CommunityBountyBar.vue'
import { useCodeBlockCopy } from '@/composables/useCodeBlockCopy'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'
import {
  isRepostPost,
  repostLabel,
  type CommunityPost,
  type PostBoostKind,
} from '@/shared/community/postDisplay'

import {
  TButton,
  TDropdown,
  TDropdownItem,
  TDropdownMenu,
  TIcon,
  ChatDotRound,
  EditPen,
  Star,
  Top,
} from 'ui_73info'

/**
 * 帖子详情区：标题行（标签 / 精华 / 推广标识 / 编辑入口）+ 作者与出处行 + 悬赏条
 * + `v-html` 正文 + 操作行（点赞 / 收藏 / 推广 / 分享 / 评论数）。
 *
 * 纯展示：点赞、收藏、推广、悬赏取消都在 composable 里（`useCommunityFeed` /
 * `useCommunityBoost` / `useCommunityBounty`），这里一个 `@/api/*`、`TMessage`、`router` 都不引，
 * 按钮只发事件。评论树由视图经默认插槽放进来（它是独立的 `CommunityCommentTree.vue`），
 * 组件只管「评论树之前」的那一竖条。
 *
 * ## 两个「换层就静默失效」的点，都跟着容器一起搬进来了
 *
 * 1. **`v-html` 容器 + `useCodeBlockCopy` 必须同层**：composable 靠 `rootRef` 抓 DOM 再挂
 *    `pointerover` / `click` 监听，容器搬走而 composable 留在页面层就抓不到，代码块上的
 *    「复制」按钮会**静默消失**（不报错、不报警）。所以 `selectedPostContentRef` 与
 *    `useCodeBlockCopy` 一起搬进本组件，`notify` 由父级经 `notify` 事件转发给全局提示。
 * 2. **`.community-rich-text` 的正文排版规则**（标题 / 列表 / 引用 / 图片 / `pre`）
 *    随容器一起搬到了 `styles/portal-pages.css` 的「社区页」段：原来是视图 scoped 块里的
 *    `.community-rich-text :deep(...)`，容器一出视图作用域，那 60 多行就全部命不中，
 *    正文会退化成「标题和段落一个字号」的纯文本观感。
 */
const props = defineProps<{
  /** 详情区正在看的帖子（非空才渲染本组件）。 */
  post: CommunityPost
  /** 正文还在取（列表里那条没带 `content_html` 时会单独再取一次）。 */
  loading: boolean
  /** 帖子已公开：未公开时点赞 / 收藏按钮置灰。 */
  published: boolean
  /** 当前登录人是不是作者（决定「编辑」入口）。 */
  canEdit: boolean
  /** 收藏请求进行中。 */
  favoriteLoading: boolean
  /** 能不能买推广（本人 + 已公开）。 */
  canBoost: boolean
  /** 正在购买的那一档推广，非空时下拉与按钮一起禁用。 */
  boostingKind: PostBoostKind | null
  /** 五档推广的价格表（`useCommunityBoost` 的 `BOOST_OPTIONS`）。 */
  boostOptions: { kind: PostBoostKind; label: string; cost: number }[]
  /** 详情标题旁还在有效期内的推广标识。 */
  boostLabels: string[]
  /** 悬赏条文案（空串表示这篇没有悬赏）。 */
  bountyLabel: string
  /** 悬赏状态（决定徽标配色档）。 */
  bountyStatus: 'none' | 'active' | 'closed' | 'cancelled'
  /** 当前登录人能不能取消悬赏（本人 + 悬赏进行中）。 */
  canManageBounty: boolean
  /** 已登录：与「帖子已公开」一起决定要不要露分享卡入口。 */
  canShare: boolean
}>()

const emit = defineEmits<{
  /** 「编辑」：打开右栏编辑器并回填这篇（带上帖子的引用，父级直接交给 composable）。 */
  edit: [post: CommunityPost]
  /** 「点赞 / 已点赞」。 */
  like: [post: CommunityPost]
  /** 「收藏 / 已收藏」。 */
  favorite: [post: CommunityPost]
  /** 选了某一档推广（确认与请求都在 `useCommunityBoost`）。 */
  boost: [kind: PostBoostKind]
  /** 「取消悬赏」。 */
  cancelBounty: []
  /** 代码块复制按钮的提示转发给父级（组件不弹全局提示）。 */
  notify: [message: string, type?: 'success' | 'warning' | 'error']
}>()

/** `v-html` 的宿主容器：交给 `useCodeBlockCopy` 挂代码块复制按钮（见文件头第 1 点）。 */
const contentRef = ref<HTMLElement | null>(null)

/** 正文在这里消毒再交给 `v-html`：渲染点即消毒点，不会出现「哪个调用方忘了消毒」。 */
const safeContentHtml = computed(() =>
  props.post.content_html ? sanitizeRichHtml(props.post.content_html) : '',
)

/** 分享卡的目标 id：帖子已公开且已登录才给，空串表示不给入口（改造前在视图里算）。 */
const shareTargetId = computed(() =>
  props.canShare && props.published ? String(props.post.id) : '',
)

useCodeBlockCopy({
  rootRef: contentRef,
  notify: (message, type) => emit('notify', message, type),
})
</script>

<template>
  <section class="community-panel community-post-detail">
    <div class="community-detail__header">
      <div class="community-detail__main">
        <div class="community-detail__title-row">
          <div class="community-detail__title">
            <div class="community-post-card__tags">
              <span v-for="tag in post.tags" :key="tag.id">{{ tag.name }}</span>
            </div>
            <h2>
              {{ post.title }}
              <span v-if="post.is_featured" class="community-featured-badge">精华</span>
              <span v-if="boostLabels.length" class="community-boost-badge">{{
                boostLabels.join(' · ')
              }}</span>
            </h2>
          </div>
          <TButton
            v-if="canEdit"
            variant="outline"
            class="community-panel-action"
            @click="emit('edit', post)"
          >
            <TIcon>
              <EditPen />
            </TIcon>
            <span>编辑</span>
          </TButton>
        </div>
        <div class="community-detail__meta">
          <div class="community-detail__author">
            <strong
              :class="{
                'username-gradient': post.author_username_gradient && !post.author_username_color,
              }"
              :style="post.author_username_color ? { color: post.author_username_color } : {}"
              >{{ post.author }}</strong
            >
            <span class="community-repost-badge" :class="{ 'is-repost': isRepostPost(post) }">{{
              isRepostPost(post) ? '转载' : '原创'
            }}</span>
          </div>
          <p class="community-detail__post-time">
            发布于 {{ post.published_at }} · 更新 {{ post.updated_at }}
          </p>
          <div v-if="isRepostPost(post)" class="community-detail__repost">
            <a
              v-if="post.origin_url"
              :href="post.origin_url"
              target="_blank"
              rel="nofollow noopener"
              >{{ repostLabel(post) || '查看原始出处' }}</a
            >
            <span v-else>{{ repostLabel(post) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 悬赏条：徽标 + 作者的取消入口，整块在 components/community/CommunityBountyBar.vue -->
    <CommunityBountyBar
      :label="bountyLabel"
      :status="bountyStatus"
      :can-cancel="canManageBounty"
      @cancel="emit('cancelBounty')"
    />

    <div v-if="loading" class="community-detail-loading" role="status">正文加载中...</div>
    <article v-else ref="contentRef" class="community-rich-text" v-html="safeContentHtml"></article>

    <div class="community-actions">
      <TButton
        class="community-like-button"
        :class="{ 'is-liked': post.liked_by_me }"
        :tone="post.liked_by_me ? 'accent' : 'neutral'"
        :disabled="!published"
        @click="emit('like', post)"
      >
        <TIcon>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3m0 11V10l4-8a3 3 0 0 1 3 3v4h5.4a2 2 0 0 1 2 2.3l-1.2 8A2 2 0 0 1 18.2 21H7Z"
            />
          </svg>
        </TIcon>
        <span>{{ post.liked_by_me ? '已点赞' : '点赞' }}</span>
        <strong>{{ post.like_count }}</strong>
      </TButton>
      <TButton
        class="community-favorite-button"
        :class="{ 'is-favorited': post.favorited_by_me }"
        :tone="post.favorited_by_me ? 'warning' : 'neutral'"
        :disabled="!published || favoriteLoading"
        @click="emit('favorite', post)"
      >
        <TIcon><Star /></TIcon>
        <span>{{ post.favorited_by_me ? '已收藏' : '收藏' }}</span>
      </TButton>
      <TDropdown
        v-if="canBoost"
        trigger="click"
        @command="(cmd) => emit('boost', cmd as PostBoostKind)"
      >
        <TButton
          variant="outline"
          tone="accent"
          class="community-boost-button"
          :loading="boostingKind !== null"
        >
          <TIcon><Top /></TIcon>
          <span>推广</span>
        </TButton>
        <template #dropdown>
          <TDropdownMenu>
            <TDropdownItem
              v-for="option in boostOptions"
              :key="option.kind"
              :command="option.kind"
              :disabled="boostingKind !== null"
            >
              {{ option.label }} · {{ option.cost }} 积分
            </TDropdownItem>
          </TDropdownMenu>
        </template>
      </TDropdown>
      <ShareCardGenerator
        v-if="canShare && shareTargetId"
        share-type="community_post"
        :target-id="shareTargetId"
      />
      <span class="community-action-stat">
        <TIcon>
          <ChatDotRound />
        </TIcon>
        {{ post.comment_count }} 条评论
      </span>
    </div>

    <!-- 评论整块（标题行 + 同步指示 + 输入框 + 评论树）由视图经默认插槽放进来 -->
    <slot />
  </section>
</template>
