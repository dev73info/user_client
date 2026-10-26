<script setup lang="ts">
import { ref, watch } from 'vue'
import { TButton, TDialog } from 'ui_73info'

import type { CommunityBoostKind } from '@/api/community'
import { COMMUNITY_BOOST_OPTIONS } from '@/shared/community'
import { COMMUNITY_INSUFFICIENT_POINTS } from '@/shared/api/errorCodes'

const props = defineProps<{
  submitting: boolean
  error: string
  errorCode: string
}>()
const emit = defineEmits<{ submit: [kind: CommunityBoostKind] }>()
const open = defineModel<boolean>('open', { required: true })
const kind = ref<CommunityBoostKind>('bump')

watch(open, (visible) => {
  if (visible) kind.value = 'bump'
})
</script>

<template>
  <TDialog v-model:open="open" title="积分推广" width="480px" :mask-closable="!props.submitting">
    <div class="community-boost-options" role="radiogroup" aria-label="推广类型">
      <label
        v-for="item in COMMUNITY_BOOST_OPTIONS"
        :key="item.value"
        :class="{ active: kind === item.value }"
      >
        <input v-model="kind" type="radio" name="community-boost" :value="item.value" />
        <span>{{ item.label }}</span>
      </label>
    </div>
    <p class="community-boost-warning">推广将按当前积分规则扣除积分。</p>
    <p v-if="error" class="community-boost-error" role="alert">{{ error }}</p>
    <p
      v-if="errorCode === COMMUNITY_INSUFFICIENT_POINTS"
      class="community-boost-error"
      role="status"
    >
      当前积分余额不足。
    </p>
    <template #footer>
      <TButton :disabled="submitting" @click="open = false">取消</TButton>
      <TButton variant="solid" tone="accent" :loading="submitting" @click="emit('submit', kind)">
        确认推广
      </TButton>
    </template>
  </TDialog>
</template>

<style scoped>
.community-boost-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.community-boost-options label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--73-border);
  border-radius: 10px;
  color: var(--73-ink-soft);
  cursor: pointer;
}
.community-boost-options label.active {
  border-color: var(--73-accent);
  color: var(--73-accent);
}
.community-boost-warning {
  margin: 16px 0 0;
  color: var(--73-warning);
  font-size: 12px;
}
.community-boost-error {
  margin: 12px 0 0;
  color: var(--73-danger);
  font-size: 13px;
}
@media (max-width: 640px) {
  .community-boost-options {
    grid-template-columns: 1fr;
  }
}
</style>
