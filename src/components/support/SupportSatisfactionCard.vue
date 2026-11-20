<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { SupportConversation } from '@/api/support'

const props = defineProps<{
  conversation: SupportConversation | null
  submitting: boolean
  error: string
}>()

const emit = defineEmits<{
  submit: [rating: number, comment: string]
}>()

const rating = ref(0)
const comment = ref('')
const canRate = computed(
  () => props.conversation?.status === 'closed' && !props.conversation.satisfaction_rating,
)

watch(
  () => [props.conversation?.id, props.conversation?.satisfaction_rating],
  () => {
    rating.value = props.conversation?.satisfaction_rating ?? 0
    comment.value = props.conversation?.satisfaction_comment ?? ''
  },
  { immediate: true },
)

function submit() {
  if (rating.value >= 1 && !props.submitting) emit('submit', rating.value, comment.value)
}
</script>

<template>
  <section v-if="conversation?.status === 'closed'" class="support-rating">
    <div class="support-rating__head">
      <strong>本次服务评价</strong>
      <span v-if="conversation.satisfaction_rating" class="support-rating__stars">
        {{ '★'.repeat(conversation.satisfaction_rating) }}
        {{ '☆'.repeat(5 - conversation.satisfaction_rating) }}
      </span>
    </div>
    <p v-if="conversation.satisfaction_comment" class="support-rating__comment">
      {{ conversation.satisfaction_comment }}
    </p>
    <template v-if="canRate">
      <div class="support-rating__picker" role="radiogroup" aria-label="满意度评分">
        <button
          v-for="star in 5"
          :key="star"
          type="button"
          role="radio"
          :aria-checked="star === rating"
          :aria-label="`${star} 星`"
          :class="{ 'is-active': star <= rating }"
          @click="rating = star"
        >
          {{ star <= rating ? '★' : '☆' }}
        </button>
      </div>
      <textarea
        v-model="comment"
        rows="2"
        maxlength="500"
        placeholder="补充评价（选填）"
        aria-label="评价内容"
      />
      <p v-if="error" class="support-rating__error" role="alert">{{ error }}</p>
      <button
        type="button"
        class="support-rating__submit"
        :disabled="rating < 1 || submitting"
        @click="submit"
      >
        {{ submitting ? '提交中…' : '提交评价' }}
      </button>
    </template>
  </section>
</template>

<style scoped>
.support-rating {
  display: grid;
  gap: 8px;
  margin: 0 14px 10px;
  padding: 11px 12px;
  border: 1px solid var(--73-border);
  border-radius: 10px;
  background: var(--73-inset);
}

.support-rating__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.support-rating__stars {
  color: var(--73-warning);
  letter-spacing: 1px;
}

.support-rating__comment {
  margin: 0;
  color: var(--73-ink-soft);
  font-size: 12px;
  white-space: pre-wrap;
}

.support-rating__picker {
  display: flex;
  gap: 2px;
}

.support-rating__picker button {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--73-ink-muted);
  font-size: 27px;
  cursor: pointer;
}

.support-rating__picker button.is-active {
  color: var(--73-warning);
}

.support-rating textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 9px;
  border: 1px solid var(--73-border);
  border-radius: 8px;
  background: var(--73-surface-strong);
  color: var(--73-ink);
  font: inherit;
  font-size: 13px;
  resize: vertical;
}

.support-rating__submit {
  justify-self: end;
  min-height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: var(--73-accent);
  color: var(--73-accent-contrast);
  cursor: pointer;
}

.support-rating__submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.support-rating__error {
  margin: 0;
  color: var(--73-danger);
  font-size: 12px;
}
</style>
