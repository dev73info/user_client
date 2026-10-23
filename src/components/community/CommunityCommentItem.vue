<script setup lang="ts">
import { TButton, TInput } from 'ui_73info'

import type { CommunityCommentItemRow } from '@/composables/useCommunityCommentRows'

/**
 * 评论树里的一条评论（根节点就是 `<ul>` 的直接子节点 `<li>`）。
 *
 * 为什么单独拆成组件：评论树模板 + `.community-comment-item*` 那一整套样式加起来超过
 * 单个 `.vue` 的 400 行预算。**拆分没有拆掉 DOM 层级**——本组件只有一个根节点 `<li>`，
 * 渲染出来仍是 `<ul><button/><li/><button/></ul>`，和改造前逐节点一致，
 * 所以 `.community-comment-list` 的 `gap`、`.community-replies-toggle` 的负外边距都不受影响。
 *
 * 纯展示：判断与数据全在 `useCommunityComments` 算好的行里（`row.depth` / `row.floor` /
 * `row.parentName` / `row.avatarUrl` / `row.initial`），组件只负责「已采纳」与「能不能采纳」
 * 这两条一眼可见的规则，和一个受控的评论草稿。
 */

type Comment = CommunityCommentItemRow['comment']

defineProps<{
  /** 一条评论行（含楼层、深度、回复上下文、头像地址）。 */
  row: CommunityCommentItemRow
  /** 回复目标 id：等于本行评论 id 时展开行内回复框。 */
  replyingToId: number | null
  /** 评论提交中（行内回复框的按钮跟着转圈）。 */
  sending: boolean
  /** 正在点赞的那条评论 id。 */
  likeLoadingId: number | null
  /** 当前登录人能否采纳回答（本人帖子 + 悬赏进行中）。 */
  canManageBounty: boolean
  /** 帖子作者：作者自己的评论不给「采纳」。 */
  authorName: string
  /** 已被采纳的评论 id（悬赏收尾后置上）。 */
  acceptedCommentId: number | null
}>()

const emit = defineEmits<{
  /** 点了「回复」，设置回复目标在父级（要过登录守卫）。 */
  reply: [comment: Comment]
  /** 行内回复框的「取消回复」。 */
  'cancel-reply': []
  /** 点了「赞 / 已赞」。 */
  like: [comment: Comment]
  /** 点了「采纳」。 */
  accept: [comment: Comment]
  /** 点了「发表评论」，校验与请求都在父级。 */
  submit: []
  /** 头像加载失败，父级把那条评论的头像地址清掉、回落到首字母。 */
  'avatar-error': [comment: Comment]
}>()

/** 评论草稿：取值来自父级，写入立刻回传（与顶部输入框共用同一份）。 */
const draft = defineModel<string>('draft', { required: true })

function isAccepted(comment: Comment, acceptedCommentId: number | null): boolean {
  return acceptedCommentId != null && acceptedCommentId === comment.id
}

/** 「采纳」只出现在：本人帖子 + 悬赏进行中 + 不是自己的评论 + 还没采纳过。 */
function canAccept(
  comment: Comment,
  canManageBounty: boolean,
  authorName: string,
  acceptedCommentId: number | null,
): boolean {
  return (
    canManageBounty && comment.commenter !== authorName && !isAccepted(comment, acceptedCommentId)
  )
}
</script>

<template>
  <li
    class="community-comment-item"
    :class="{
      'is-reply': Boolean(row.comment.parent_comment_id),
      'is-accepted': isAccepted(row.comment, acceptedCommentId),
    }"
    :style="{ '--comment-depth': String(row.depth) }"
  >
    <div class="community-comment-item__avatar">
      <img
        v-if="row.avatarUrl"
        :src="row.avatarUrl"
        :alt="`${row.comment.commenter} 的头像`"
        @error="emit('avatar-error', row.comment)"
      />
      <span v-else>{{ row.initial }}</span>
    </div>
    <div class="community-comment-item__body">
      <strong
        :class="{
          'username-gradient':
            row.comment.commenter_username_gradient && !row.comment.commenter_username_color,
        }"
        :style="
          row.comment.commenter_username_color
            ? { color: row.comment.commenter_username_color }
            : {}
        "
        >{{ row.comment.commenter }}</strong
      >
      <span
        v-if="isAccepted(row.comment, acceptedCommentId)"
        class="community-comment-item__accepted"
        >已采纳</span
      >
      <span class="community-comment-item__floor">#{{ row.floor }}</span>
      <div v-if="row.parentName || row.parentExcerpt" class="community-comment-item__reply-context">
        <span v-if="row.parentName" class="community-comment-item__reply-to">
          回复 @{{ row.parentName }}
        </span>
        <span
          v-if="row.parentExcerpt"
          class="community-comment-item__reply-quote"
          :title="row.parentExcerpt"
        >
          {{ row.parentExcerpt }}
        </span>
      </div>
      <p>{{ row.comment.comment_text }}</p>
      <div class="community-comment-item__actions">
        <button
          v-if="canAccept(row.comment, canManageBounty, authorName, acceptedCommentId)"
          type="button"
          class="community-comment-item__accept"
          @click="emit('accept', row.comment)"
        >
          采纳
        </button>
        <button type="button" @click="emit('reply', row.comment)">回复</button>
        <button
          type="button"
          :class="{ 'is-liked': row.comment.liked_by_me }"
          :disabled="likeLoadingId === row.comment.id"
          @click="emit('like', row.comment)"
        >
          {{ row.comment.liked_by_me ? '已赞' : '赞' }}
          <span>{{ row.comment.like_count || 0 }}</span>
        </button>
        <time>{{ row.comment.created_at }}</time>
      </div>
      <div v-if="replyingToId === row.comment.id" class="community-inline-reply-box">
        <div class="community-comment-replying">
          回复 {{ row.comment.commenter }}
          <button class="community-reply-cancel" type="button" @click="emit('cancel-reply')">
            取消回复
          </button>
        </div>
        <TInput
          v-model="draft"
          show-count
          type="textarea"
          :rows="3"
          :maxlength="800"
          :placeholder="`回复 ${row.comment.commenter}：`"
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
    </div>
  </li>
</template>

<style scoped>
.community-comment-item {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

/* 采纳标记的琥珀色 var(--73-warning) / var(--73-warning-soft)，与「已采纳」角标（var(--73-warning) / var(--73-warning-soft)）同一支色相。
   这组值没有等值的 --73-warning-*（令牌是 color-mix(in srgb, var(--73-warning) 14%, transparent) / var(--73-warning-text) 那一支），
   换令牌就是改视觉，保留字面量。 */
.community-comment-item.is-accepted {
  border-color: var(--73-warning) !important;
  background: var(--73-warning-soft);
}

.community-comment-item__accepted {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--73-warning);
  background: var(--73-warning-soft);
}

.community-comment-item__avatar {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  overflow: hidden;
  border-radius: var(--73-radius-pill);
  background: color-mix(in srgb, var(--73-accent-soft) 92%, transparent);
  color: var(--73-accent);
  font-weight: 900;
}

.community-comment-item__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.community-comment-item__body {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--73-border) 90%, transparent);
  border-radius: var(--73-radius-inner);
  background: color-mix(in srgb, var(--73-surface-strong) 72%, transparent);
}

.community-comment-item__floor {
  margin-left: 6px;
  color: var(--73-ink-placeholder);
  font-size: 12px;
  font-weight: 600;
}

/* 回复的缩进。`--comment-depth`（行的深度，由 JS 写进本节点内联样式）是留给「按层缩进」的钩子，
   本轮不接：改造前就是这一条定死 28px，改成 calc(28px * var(--comment-depth)) 会改掉第 2 层
   以后的视觉，属于要单独走查的改动。 */
.community-comment-item.is-reply {
  margin-left: 28px;
}

.community-comment-item__reply-to {
  flex-shrink: 0;
  color: var(--73-accent);
  font-size: 12px;
  font-weight: 700;
}

.community-comment-item__reply-context {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
  margin-top: 3px;
  line-height: 1.5;
}

.community-comment-item__reply-quote {
  min-width: 0;
  overflow: hidden;
  color: var(--73-ink-placeholder);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.community-comment-item strong {
  color: var(--73-ink);
}

.community-comment-item p {
  margin: 6px 0;
  color: var(--73-ink-soft);
  line-height: 1.65;
  overflow-wrap: anywhere;
}

/* 时间戳原来还吃视图那条共享选择器给的 `line-height: 1.7`，搬过来要自己带上 */
.community-comment-item time {
  display: block;
  margin-left: auto;
  color: var(--73-ink-placeholder);
  font-size: 11px;
  line-height: 1.7;
  text-align: right;
}

.community-comment-item__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.community-comment-replying button,
.community-comment-item__actions button {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--73-ink-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.community-comment-item__actions button {
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--73-border) 95%, transparent);
  border-radius: var(--73-radius-pill);
  background: color-mix(in srgb, var(--73-surface-strong) 86%, transparent);
}

.community-comment-replying button:hover,
.community-comment-item__actions button:hover,
.community-comment-item__actions button.is-liked {
  color: var(--73-accent);
}

.community-comment-item__actions .community-comment-item__accept {
  color: var(--73-warning);
  border-color: var(--73-warning);
}

.community-comment-item__actions button span {
  margin-left: 3px;
  color: var(--73-ink-placeholder);
  font-size: 11px;
}

.community-comment-item__actions button:hover,
.community-comment-item__actions button.is-liked {
  border-color: color-mix(in srgb, var(--73-accent) 90%, transparent);
  background: var(--73-accent-soft);
}

.community-comment-item__actions button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.community-inline-reply-box {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--73-border) 90%, transparent);
}

.community-comment-replying {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-left: 3px solid var(--73-accent);
  background: var(--73-accent-soft);
  color: var(--73-accent);
  font-size: 13px;
  font-weight: 700;
}

/* 行内回复框里的「回复 X」不再要左侧那道蓝竖线与底色 */
.community-inline-reply-box .community-comment-replying {
  padding: 0;
  border-left: 0;
  background: transparent;
}

.community-reply-cancel {
  min-height: 28px;
  padding: 0 10px !important;
  border: 1px solid color-mix(in srgb, var(--73-ink-placeholder) 50%, transparent) !important;
  border-radius: 7px;
  background: var(--73-surface-strong) !important;
  color: var(--73-ink-soft) !important;
  font-size: 12px !important;
  font-weight: 700;
}

.community-reply-cancel:hover {
  border-color: color-mix(in srgb, var(--73-accent) 50%, transparent) !important;
  background: var(--73-accent-soft) !important;
  color: var(--73-accent) !important;
}

.community-inline-reply-box .community-comment-submit {
  justify-self: end;
}
</style>
