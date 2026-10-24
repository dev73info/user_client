<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { TLoading } from 'ui_73info'

import { COMMENT_MAX_LENGTH, useResourceComments } from '@/composables/useResourceComments'
import { useAuthStore } from '@/stores/auth'
import { formatResourceTime } from '@/utils/resourceTime'

/**
 * 资源评论卡（评论列表 + 输入框 + 登录 / 未发布栅栏）。
 *
 * 取数与提交都在 `useResourceComments` 里，这一层只画：
 * 面板那边因此不再持有评论状态，换资源时由 `:key` 整体重挂、状态自然清空（既有行为）。
 *
 * 与面板只共享两样：`auth.token`（登录态，直接从 store 读）与 `isPublished`
 * （未公开发布的资源评论区只留一句说明）。
 */
const props = defineProps<{
  resourceId: number
  /** 资源是否已公开发布：未发布时评论区不开放 */
  isPublished: boolean
}>()

const auth = useAuthStore()

const {
  comments,
  loading,
  submitting,
  text,
  textLength,
  countLabel,
  canSubmit,
  gate,
  load,
  submit,
  reset,
  handleGateAction,
} = useResourceComments({
  getResourceId: () => (props.resourceId > 0 ? props.resourceId : null),
  isPublished: () => props.isPublished,
  hasResource: () => props.resourceId > 0,
})

onMounted(() => {
  void load()
})

// 换资源：先清掉上一条的评论与草稿再重拉（面板换资源时整块重挂，这里只是兜底）
watch(
  () => props.resourceId,
  () => {
    reset()
    void load()
  },
)

// 登录 / 换号后评论要重拉：登录后才看得到「我的」标记与新增的评论
watch(
  () => auth.token,
  () => {
    void load()
  },
)

/** 头像位取评论者名字的首字（中文取首字，英文取首字母大写） */
function getCommenterInitial(value: string): string {
  return Array.from(value.trim())[0]?.toUpperCase() || '用'
}
</script>

<template>
  <article class="resource-detail-page__content-card resource-detail-page__comments-card">
    <header class="resource-detail-page__section-head">
      <h2>资源评论</h2>
      <span>{{ countLabel }}</span>
    </header>

    <section class="resource-detail-page__comment-composer">
      <div v-if="gate" class="resource-detail-page__comment-gate">
        <div>
          <strong>{{ gate.title }}</strong>
          <p>{{ gate.description }}</p>
        </div>
        <button
          v-if="gate.actionLabel"
          class="resource-detail-page__comment-action"
          type="button"
          @click="handleGateAction"
        >
          {{ gate.actionLabel }}
        </button>
      </div>
      <form v-else class="resource-detail-page__comment-form" @submit.prevent="submit">
        <textarea
          v-model="text"
          class="resource-detail-page__comment-input"
          rows="4"
          maxlength="300"
          placeholder="写下你对这个资源的使用体验、兼容性补充或改进建议"
        ></textarea>
        <div class="resource-detail-page__comment-toolbar">
          <span
            class="resource-detail-page__comment-count"
            :class="{ danger: textLength > COMMENT_MAX_LENGTH }"
          >
            {{ textLength }} / {{ COMMENT_MAX_LENGTH }}
          </span>
          <button class="resource-detail-page__comment-submit" type="submit" :disabled="!canSubmit">
            {{ submitting ? '发布中...' : '发布评论' }}
          </button>
        </div>
      </form>
    </section>

    <TLoading tag="div" class="resource-detail-page__comment-list" :loading="loading">
      <article
        v-for="comment in comments"
        :key="comment.id"
        class="resource-detail-page__comment-item"
        :class="{ mine: auth.username && comment.commenter === auth.username }"
      >
        <div class="resource-detail-page__comment-avatar">
          {{ getCommenterInitial(comment.commenter) }}
        </div>
        <div class="resource-detail-page__comment-body">
          <div class="resource-detail-page__comment-meta">
            <strong>{{ comment.commenter }}</strong>
            <span>{{ formatResourceTime(comment.updated_at) }}</span>
          </div>
          <p>{{ comment.comment }}</p>
        </div>
      </article>
      <p v-if="!loading && comments.length === 0" class="resource-detail-page__paragraph">
        暂时还没有评论。
      </p>
    </TLoading>
  </article>
</template>

<style scoped>
/* 色值全部取父级声明的 `--rdp-*`（`raw-color` 门禁按文件聚合，新文件里不许出现裸色值）；
   断点沿用 640 / 900 / 1180 三档。 */

/* 段落头：scoped 规则不跨组件作用域，父级那份进不来，这里留一份同款 */
.resource-detail-page__section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.resource-detail-page__section-head h2 {
  margin: 0;
  color: var(--rdp-ink);
}

.resource-detail-page__section-head span {
  font-size: 12px;
}

.resource-detail-page__comment-composer,
.resource-detail-page__comment-item {
  border-radius: 18px;
  border: 1px solid var(--rdp-card-border);
  background: var(--rdp-comment-surface);
}

.resource-detail-page__comment-composer {
  padding: 16px;
}

.resource-detail-page__comment-gate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.resource-detail-page__comment-gate strong,
.resource-detail-page__comment-meta strong {
  color: var(--rdp-ink);
}

.resource-detail-page__comment-gate p,
.resource-detail-page__comment-body p,
.resource-detail-page__comment-meta span,
.resource-detail-page__comment-count {
  margin: 0;
  color: var(--rdp-muted);
  line-height: 1.7;
}

.resource-detail-page__comment-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resource-detail-page__comment-input {
  width: 100%;
  min-height: 108px;
  resize: vertical;
  border: 1px solid var(--rdp-input-border);
  border-radius: 16px;
  background: var(--rdp-input-surface);
  color: var(--rdp-ink);
  padding: 12px 14px;
  font: inherit;
  line-height: 1.7;
  outline: none;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease;
}

.resource-detail-page__comment-input:focus {
  border-color: var(--rdp-accent-border);
  background: var(--rdp-input-surface-focus);
  box-shadow: 0 0 0 4px var(--rdp-accent-ring);
}

.resource-detail-page__comment-toolbar,
.resource-detail-page__comment-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.resource-detail-page__comment-count {
  font-size: 13px;
  font-weight: 700;
}

.resource-detail-page__comment-count.danger {
  color: var(--rdp-danger);
}

.resource-detail-page__comment-action,
.resource-detail-page__comment-submit {
  border: 0;
  border-radius: 12px;
  min-height: 40px;
  padding: 0 16px;
  color: var(--rdp-on-accent);
  background: linear-gradient(135deg, var(--rdp-accent), var(--rdp-accent-alt));
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    opacity 180ms ease;
}

.resource-detail-page__comment-action:hover,
.resource-detail-page__comment-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 22px var(--rdp-btn-shadow);
}

.resource-detail-page__comment-submit:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.resource-detail-page__comment-list {
  min-height: 72px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resource-detail-page__comment-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
}

.resource-detail-page__comment-item.mine {
  border-color: var(--rdp-mine-border);
  background: var(--rdp-mine-surface);
}

.resource-detail-page__comment-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--rdp-link);
  background: var(--rdp-avatar-surface);
  font-weight: 800;
}

.resource-detail-page__comment-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.resource-detail-page__comment-body p {
  white-space: pre-wrap;
  word-break: break-word;
}

.resource-detail-page__comment-meta span {
  font-size: 12px;
}

/* 空态提示：原父级与 `__meta` / `__summary` 共用一条，落在本组件的是这一条 */
.resource-detail-page__paragraph {
  margin: 0;
  color: var(--rdp-muted);
  line-height: 1.8;
}

@media (max-width: 640px) {
  .resource-detail-page__comment-gate,
  .resource-detail-page__comment-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .resource-detail-page__comment-action,
  .resource-detail-page__comment-submit {
    width: 100%;
  }

  .resource-detail-page__comment-item {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .resource-detail-page__comment-avatar {
    width: 36px;
    height: 36px;
  }
}
</style>
