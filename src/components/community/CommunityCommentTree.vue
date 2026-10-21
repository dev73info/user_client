<script setup lang="ts">
import { TButton, TInput } from 'ui_73info'

import CommunityCommentItem from '@/components/community/CommunityCommentItem.vue'
import type {
  CommunityCommentItemRow,
  CommunityCommentRow,
} from '@/composables/useCommunityCommentRows'

/**
 * 帖子详情区下方的「评论」整块：标题行 + 同步指示 + 输入框 + 评论树。
 *
 * 纯展示：取数、排序、楼号、折叠判定、草稿、回复目标、发评论与点赞全在 `useCommunityComments`，
 * 这里一个 `@/api/*`、`TMessage`、`router` 都不引。行是「已经算好的显示行」
 * （展开按钮 / 评论 / 收起按钮三选一），组件只 `v-for` 一遍，不重算楼层与折叠。
 *
 * ## 结构约束（`<ul>` 里三种子节点必须在同一层）
 *
 * `<ul>` 的直接子节点里既有 `<li>`（由 `CommunityCommentItem.vue` 渲染，那个组件的根节点就是它）
 * 也有两个 `.community-replies-toggle` 按钮。这个形状是改造前的原样（严格说 `<ul>` 的子元素只该是
 * `<li>`，属历史写法），而两个按钮的负外边距 `margin: -4px 0 -2px 50px` 与
 * `.community-comment-list` 的 `gap: 14px` 是按「按钮自己占一行」调的——塞进 `<li>` 会连带改掉
 * 整棵树的间距。所以渲染出来的 DOM 顺序（展开按钮 → li → 收起按钮）**必须逐节点保持不变**。
 *
 * ## 样式
 *
 * 整块 `.community-comments*` / `.community-comment-item*` 从视图的 scoped 块搬来（拆成两个文件：
 * 树这层管列表与输入框，单条评论那层管 `.community-comment-item*`）。搬过来的同时改用
 * `var(--73-*)` 令牌：同义替换、色相不变，但个别档位不是逐字节相同
 * （例如强调蓝 `#2563eb` → `--73-accent` = `#1f4ad1`），视觉验收按这个口径比对。
 */
defineProps<{
  /** 已经算好的显示行，按树的顺序铺开。 */
  rows: CommunityCommentRow[]
  /** 评论同步中（标题右边的小圆环）。 */
  loading: boolean
  /** 帖子是否已公开：未公开时不给输入框，只给一句提示。 */
  published: boolean
  /** 回复目标 id：非空时顶部输入框收掉、那一行下方展开行内回复框。 */
  replyingToId: number | null
  /** 评论提交中。 */
  sending: boolean
  /** 正在点赞的那条评论 id。 */
  likeLoadingId: number | null
  /** 当前登录人能否采纳回答（本人帖子 + 悬赏进行中）。 */
  canManageBounty: boolean
  /** 帖子作者：作者自己的评论不给「采纳」。 */
  authorName: string
  /** 已被采纳的评论 id。 */
  acceptedCommentId: number | null
}>()

const emit = defineEmits<{
  /** 点了「发表评论」，校验与请求都在父级。 */
  submit: []
  /** 某一行的「回复」。 */
  reply: [comment: CommunityCommentItemRow['comment']]
  /** 行内回复框的「取消回复」。 */
  'cancel-reply': []
  /** 某一行的「赞 / 已赞」。 */
  like: [comment: CommunityCommentItemRow['comment']]
  /** 某一行的「采纳」。 */
  accept: [comment: CommunityCommentItemRow['comment']]
  /** 展开 / 收起某栋楼的折叠回复。 */
  'toggle-threads': [rootId: number]
  /** 头像加载失败。 */
  'avatar-error': [comment: CommunityCommentItemRow['comment']]
}>()

/** 评论草稿：顶部输入框与行内回复框**共用同一份**（改造前就是同一个 ref）。 */
const draft = defineModel<string>('draft', { required: true })
</script>

<template>
  <section class="community-comments">
    <div class="community-comments__head">
      <h3>评论</h3>
      <span v-if="loading" class="community-comments__loading" role="status" aria-live="polite">
        <span class="community-comments__spinner" aria-hidden="true"></span>
        评论同步中
      </span>
    </div>

    <div v-if="!published" class="community-status-note">帖子公开后可点赞和评论。</div>
    <div v-else-if="replyingToId === null" class="community-comment-box">
      <TInput
        v-model="draft"
        show-count
        type="textarea"
        :rows="3"
        :maxlength="800"
        placeholder="说点具体的想法或补充"
      />
      <TButton
        variant="solid"
        tone="accent"
        class="community-submit-button community-comment-submit"
        :loading="sending"
        @click="emit('submit')"
      >
        发表评论
      </TButton>
    </div>

    <!-- 空态用组件自己的类：父级 scoped 的 `.community-empty` 命不中组件内部节点 -->
    <div v-if="!loading && rows.length === 0" class="community-comments__empty">暂无评论</div>
    <ul v-else class="community-comment-list">
      <template v-for="row in rows" :key="row.key">
        <button
          v-if="row.kind === 'expand'"
          class="community-replies-toggle"
          type="button"
          @click="emit('toggle-threads', row.rootId)"
        >
          展开 {{ row.hiddenCount }} 条回复
        </button>
        <CommunityCommentItem
          v-if="row.kind === 'comment'"
          v-model:draft="draft"
          :row="row"
          :replying-to-id="replyingToId"
          :sending="sending"
          :like-loading-id="likeLoadingId"
          :can-manage-bounty="canManageBounty"
          :author-name="authorName"
          :accepted-comment-id="acceptedCommentId"
          @reply="emit('reply', $event)"
          @cancel-reply="emit('cancel-reply')"
          @like="emit('like', $event)"
          @accept="emit('accept', $event)"
          @submit="emit('submit')"
          @avatar-error="emit('avatar-error', $event)"
        />
        <button
          v-if="row.kind === 'collapse'"
          class="community-replies-toggle"
          type="button"
          @click="emit('toggle-threads', row.rootId)"
        >
          收起
        </button>
      </template>
    </ul>
  </section>
</template>

<style scoped>
/* 注：`.community-comments__head` 原来靠视图里一条共享选择器拿到「两端对齐 + 居中 + 12px 间距」，
   那条选择器留在视图（还管着 hero / 详情头等），这里必须自带一份，否则搬过来就塌。 */
.community-comments {
  padding-top: 16px;
}

.community-comments__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

/* 评论区标题原来吃的是视图里 `.community-panel h3` 那条（margin 0 + 深墨色） */
.community-comments__head h3 {
  margin: 0;
  color: var(--73-ink);
}

/* 同步指示的小胶囊：淡蓝底 + 蓝描边 + 蓝字 */
.community-comments__loading {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid var(--73-accent-line);
  border-radius: var(--73-radius-pill);
  background: var(--73-accent-soft);
  color: var(--73-accent);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  box-shadow: var(--73-shadow-card);
}

.community-comments__spinner {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  border: 2px solid var(--73-accent-line);
  border-top-color: var(--73-accent);
  border-radius: var(--73-radius-pill);
  animation: community-comments-spin 720ms linear infinite;
}

@keyframes community-comments-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 「帖子公开后才能评论」的琥珀提示条 */
.community-status-note {
  margin-bottom: 18px;
  padding: 12px 14px;
  border: 1px solid var(--73-warning-line);
  border-radius: var(--73-radius-inner);
  background: var(--73-warning-soft);
  color: var(--73-warning-text);
  font-size: 13px;
  font-weight: 700;
}

/* 「暂无评论」：原来借用视图 scoped 的 `.community-empty--compact`，父级作用域命不中组件内部，
   这里自带一份等价样式（72px 最小高 + 浅底圆角块）。 */
.community-comments__empty {
  display: flex;
  min-height: 72px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  padding: 18px;
  border-radius: var(--73-radius-inner);
  background: var(--73-bg-soft);
}

.community-comment-box {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}

.community-comment-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 折叠开关是 `<ul>` 的直接子节点，靠这组负外边距贴住上下两条评论 */
.community-replies-toggle {
  display: block;
  margin: -4px 0 -2px 50px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--73-accent);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.community-replies-toggle:hover,
.community-replies-toggle:focus-visible {
  color: var(--73-accent);
  text-decoration: underline;
}
</style>
