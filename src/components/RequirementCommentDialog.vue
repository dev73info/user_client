<script setup lang="ts">
import { ref, watch } from 'vue'

import { commentRequirement } from '@/api/requirements'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  visible: boolean
  token: string | null
  requirementId: string
  title: string
  initialRating?: number | null
  initialText?: string | null
}>()

const emit = defineEmits<{
  close: []
  submitted: []
}>()

const { showToast } = useToast()

const commentRating = ref(5)
const commentText = ref('')
const commentLoading = ref(false)

watch(
  () => props.visible,
  (open) => {
    if (!open) {
      return
    }
    commentRating.value = props.initialRating ?? 5
    commentText.value = props.initialText?.trim() ?? ''
  },
)

function starFill(index: number) {
  const rating = commentRating.value
  if (rating >= index) {
    return 100
  }
  if (rating >= index - 0.5) {
    return 50
  }
  return 0
}

function starClass(index: number) {
  const fill = starFill(index)
  return fill === 100 ? 'full' : fill === 50 ? 'half' : ''
}

function setRating(event: MouseEvent, index: number) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const clickedInLeftHalf = event.clientX - rect.left < rect.width / 2
  commentRating.value = clickedInLeftHalf ? index - 0.5 : index
}

function requestClose() {
  if (!commentLoading.value) {
    emit('close')
  }
}

async function submitRequirementComment() {
  if (!props.token || !props.requirementId) {
    showToast('请先登录后再发表评价', 'error')
    return
  }

  if (commentRating.value < 1 || commentRating.value > 5) {
    showToast('请为已完成需求打分，范围 1 到 5 分', 'error')
    return
  }

  if (commentText.value.trim().length > 200) {
    showToast('评论字数不能超过 200 字', 'error')
    return
  }

  commentLoading.value = true
  try {
    await commentRequirement(props.token, props.requirementId, {
      rating: commentRating.value,
      comment: commentText.value.trim(),
    })
    showToast('评价提交成功', 'success')
    emit('submitted')
    emit('close')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '评价提交失败', 'error')
  } finally {
    commentLoading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="modal-wrap comment-modal-wrap"
      @click.self="requestClose"
    >
      <section class="pay-modal comment-modal" aria-label="需求评价弹窗">
        <header class="comment-modal__head">
          <h3>评价需求</h3>
        </header>

        <div class="comment-modal__meta">
          <div class="comment-modal__meta-row">
            <span class="comment-modal__meta-label">需求</span>
            <strong class="comment-modal__meta-value">{{ title }}</strong>
          </div>
          <div class="comment-modal__meta-row">
            <span class="comment-modal__meta-label">编号</span>
            <span class="comment-modal__meta-value comment-modal__meta-value--mono">
              {{ requirementId }}
            </span>
          </div>
        </div>

        <div class="comment-modal__section">
          <div class="comment-modal__section-head">
            <strong>评分</strong>
            <span class="comment-modal__score">{{ commentRating.toFixed(1) }} 分</span>
          </div>
          <div class="rating-row" role="group" aria-label="点击星星评分，左半为半分">
            <button
              v-for="star in 5"
              :key="star"
              type="button"
              class="rating-star"
              :class="starClass(star)"
              :aria-label="`${star} 星`"
              @click="setRating($event, star)"
            >
              ★
            </button>
          </div>
        </div>

        <div class="comment-modal__section comment-modal__field">
          <div class="comment-modal__section-head">
            <strong>评论</strong>
            <span class="comment-modal__counter">{{ commentText.length }}/200</span>
          </div>
          <textarea
            v-model="commentText"
            class="comment-input"
            rows="3"
            maxlength="200"
            placeholder="选填，说说协作体验（最多 200 字）"
          ></textarea>
        </div>

        <div class="actions comment-modal__actions">
          <button class="ghost" type="button" @click="requestClose">取消</button>
          <button
            class="ghost primary"
            type="button"
            :disabled="commentLoading"
            @click="submitRequirementComment"
          >
            {{ commentLoading ? '提交中...' : '提交评价' }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-wrap.comment-modal-wrap {
  z-index: 1400;
}
</style>
