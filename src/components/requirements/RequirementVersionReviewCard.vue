<script setup lang="ts">
import type {
  RequirementItem,
  RequirementPendingResourceVersionDeleteRequest,
} from '@/api/requirements'
import {
  formatPendingVersionRequestedAt,
  pendingResourceVersionDeleteRequests,
  pendingResourceVersionTitle,
  pendingVersionRejectNote,
} from '@/shared/requirementRowRules'

/**
 * 版本删除审核的展开卡：跟在需求行后面单独占一行 `<li>`（`<ul>` 与 `:key` 留在视图）。
 *
 * 展开态、进行中守卫、拒绝原因草稿都是视图的状态，这里只读 props、一律 emit；
 * 同意后该版本文件会被永久删除，故在列表里就把这句警告常驻显示。
 */
defineProps<{
  item: RequirementItem
  /** 本需求的审核请求进行中（同一条需求的按钮一起置灰）。 */
  reviewLoading: boolean
  /** 正在填拒绝原因的那个版本 id。 */
  rejectTargetId: number | null
  /** 拒绝原因草稿：视图按版本 id 存一份 record。 */
  rejectNotes: Record<number, string>
}>()

const emit = defineEmits<{
  close: []
  approve: [request: RequirementPendingResourceVersionDeleteRequest]
  reject: [request: RequirementPendingResourceVersionDeleteRequest]
  openReject: [request: RequirementPendingResourceVersionDeleteRequest]
  cancelReject: []
  updateNote: [versionId: number, value: string]
}>()

function onNoteInput(request: RequirementPendingResourceVersionDeleteRequest, event: Event) {
  emit('updateNote', request.version_id, (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <li class="requirement-review-card-row">
    <section class="requirement-review-card" @click.stop>
      <div class="requirement-review-card__header">
        <div>
          <h4>版本删除审核</h4>
        </div>
        <button class="ghost small" type="button" @click.stop="emit('close')">收起</button>
      </div>
      <div class="requirement-review-card-list">
        <article
          v-for="request in pendingResourceVersionDeleteRequests(item)"
          :key="request.version_id"
          class="requirement-review-item"
        >
          <div class="requirement-review-item__main">
            <div>
              <strong>{{ pendingResourceVersionTitle(request) }}</strong>
              <p>申请时间：{{ formatPendingVersionRequestedAt(request) }}</p>
            </div>
            <div class="requirement-review-item__actions">
              <button
                class="ghost small"
                type="button"
                :disabled="reviewLoading"
                @click.stop="emit('approve', request)"
              >
                {{ reviewLoading ? '处理中...' : '同意删除' }}
              </button>
              <button
                class="ghost small"
                type="button"
                :class="{ active: rejectTargetId === request.version_id }"
                :disabled="reviewLoading"
                @click.stop="emit('openReject', request)"
              >
                拒绝删除
              </button>
            </div>
          </div>
          <p class="requirement-review-card__hint danger">
            同意后该版本文件会被永久删除，且无法恢复。
          </p>
          <div
            v-if="rejectTargetId === request.version_id"
            class="requirement-review-item__reject-panel"
          >
            <label class="requirement-review-card__field requirement-review-card__field--stacked">
              <span>拒绝原因</span>
              <textarea
                :value="pendingVersionRejectNote(rejectNotes, request)"
                class="comment-input"
                rows="4"
                maxlength="500"
                placeholder="可选：说明拒绝删除该版本的原因"
                @input="onNoteInput(request, $event)"
              ></textarea>
              <small class="requirement-note"
                >已输入 {{ pendingVersionRejectNote(rejectNotes, request).length }} / 500 字</small
              >
            </label>
            <div class="requirement-review-card__actions">
              <button class="ghost small" type="button" @click.stop="emit('cancelReject')">
                取消
              </button>
              <button
                class="ghost small"
                type="button"
                :disabled="reviewLoading"
                @click.stop="emit('reject', request)"
              >
                {{ reviewLoading ? '处理中...' : '确认拒绝删除' }}
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>
  </li>
</template>
