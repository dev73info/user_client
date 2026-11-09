<script setup lang="ts">
import { ref, watch } from 'vue'

import { TButton, TDialog } from 'ui_73info'

import type { SatisfactionPayload } from '@/api/tickets'

const props = withDefaults(
  defineProps<{
    open: boolean
    loading?: boolean
    rating?: number | null
    comment?: string | null
  }>(),
  { loading: false, rating: 0, comment: '' },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: SatisfactionPayload]
}>()

const localRating = ref(props.rating ?? 0)
const localComment = ref(props.comment ?? '')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    localRating.value = props.rating ?? 0
    localComment.value = props.comment ?? ''
  },
)

function submit() {
  if (localRating.value < 1) return
  emit('submit', {
    rating: localRating.value,
    comment: localComment.value.trim() || null,
  })
}
</script>

<template>
  <TDialog :open="open" title="评价工单" width="420px" @update:open="emit('update:open', $event)">
    <div class="ticket-satisfaction">
      <div class="ticket-satisfaction__stars" role="radiogroup" aria-label="满意度">
        <button
          v-for="star in 5"
          :key="star"
          type="button"
          role="radio"
          class="ticket-satisfaction__star"
          :class="{ 'ticket-satisfaction__star--active': star <= localRating }"
          :aria-checked="star === localRating"
          :aria-label="`${star} 星`"
          @click="localRating = star"
        >
          {{ star <= localRating ? '★' : '☆' }}
        </button>
      </div>
      <textarea
        v-model="localComment"
        rows="3"
        maxlength="500"
        placeholder="补充评价（选填）"
        aria-label="评价内容"
      />
      <div class="ticket-satisfaction__actions">
        <TButton variant="outline" :disabled="loading" @click="emit('update:open', false)">
          取消
        </TButton>
        <TButton
          variant="solid"
          tone="accent"
          :loading="loading"
          :disabled="localRating < 1"
          @click="submit"
        >
          提交评价
        </TButton>
      </div>
    </div>
  </TDialog>
</template>

<style scoped>
.ticket-satisfaction {
  display: grid;
  gap: 12px;
}
.ticket-satisfaction__stars {
  display: flex;
  gap: 4px;
}
.ticket-satisfaction__star {
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--73-ink-muted);
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}
.ticket-satisfaction__star--active {
  color: var(--73-warning);
}
.ticket-satisfaction textarea {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--73-border);
  border-radius: 8px;
  background: var(--73-surface-strong);
  color: var(--73-ink);
  font: inherit;
  resize: vertical;
}
.ticket-satisfaction__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
