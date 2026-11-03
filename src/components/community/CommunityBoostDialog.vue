<script setup lang="ts">
import { ref, watch } from 'vue'
import { Promotion, TButton, TDialog, TIcon } from 'ui_73info'

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
  <TDialog
    v-model:open="open"
    title="积分推广"
    width="520px"
    class="community-boost-dialog"
    :mask-closable="!props.submitting"
  >
    <div class="community-boost">
      <header class="community-boost__intro">
        <span class="community-boost__intro-icon" aria-hidden="true">
          <TIcon :size="18"><Promotion /></TIcon>
        </span>
        <div>
          <strong>选择曝光方式</strong>
          <p>选择适合的推荐位置，让更多开发者看到这篇帖子。</p>
        </div>
      </header>

      <div class="community-boost-options" role="radiogroup" aria-label="推广类型">
        <label
          v-for="item in COMMUNITY_BOOST_OPTIONS"
          :key="item.value"
          :class="{ active: kind === item.value }"
        >
          <input v-model="kind" type="radio" name="community-boost" :value="item.value" />
          <span class="community-boost-options__dot" aria-hidden="true"></span>
          <span class="community-boost-options__label">{{ item.label }}</span>
        </label>
      </div>

      <p class="community-boost-warning">
        <span class="community-boost-warning__mark" aria-hidden="true">i</span>
        推广将按当前积分规则扣除积分。
      </p>
      <p v-if="error" class="community-boost-error" role="alert">{{ error }}</p>
      <p
        v-if="errorCode === COMMUNITY_INSUFFICIENT_POINTS"
        class="community-boost-error"
        role="status"
      >
        当前积分余额不足。
      </p>
    </div>
    <template #footer>
      <TButton variant="outline" :disabled="submitting" @click="open = false">取消</TButton>
      <TButton variant="solid" tone="accent" :loading="submitting" @click="emit('submit', kind)">
        确认推广
      </TButton>
    </template>
  </TDialog>
</template>

<style scoped>
.community-boost {
  display: grid;
  gap: 16px;
}
.community-boost__intro {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--73-border-soft);
  border-radius: 10px;
  background: color-mix(in srgb, var(--73-accent-soft) 45%, var(--73-surface));
}
.community-boost__intro-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: 9px;
  background: var(--73-accent-soft);
  color: var(--73-accent);
}
.community-boost__intro strong {
  display: block;
  color: var(--73-ink);
  font-size: 13px;
  font-weight: 600;
}
.community-boost__intro p {
  margin: 2px 0 0;
  color: var(--73-ink-muted);
  font-size: 12px;
  line-height: 1.5;
}
.community-boost-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.community-boost-options label {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 12px 14px;
  border: 1px solid var(--73-border);
  border-radius: 10px;
  background: var(--73-surface);
  color: var(--73-ink-soft);
  cursor: pointer;
  transition:
    border-color var(--73-transition),
    background-color var(--73-transition),
    color var(--73-transition),
    box-shadow var(--73-transition);
}
.community-boost-options label:hover {
  border-color: var(--73-border-hover);
  color: var(--73-ink);
}
.community-boost-options label.active {
  border-color: var(--73-accent);
  background: color-mix(in srgb, var(--73-accent-soft) 55%, var(--73-surface));
  color: var(--73-accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--73-accent) 55%, transparent);
}
.community-boost-options label:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}
.community-boost-options input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.community-boost-options__dot {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  border: 1.5px solid var(--73-border-hover);
  border-radius: 50%;
  background: var(--73-surface);
  transition: border-color var(--73-transition);
}
.community-boost-options__dot::after {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--73-accent);
  transform: scale(0);
  transition: transform var(--73-transition);
}
.community-boost-options label.active .community-boost-options__dot {
  border-color: var(--73-accent);
}
.community-boost-options label.active .community-boost-options__dot::after {
  transform: scale(1);
}
.community-boost-options__label {
  font-size: 13px;
  font-weight: 500;
}
.community-boost-warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--73-warning-line);
  border-radius: 8px;
  background: var(--73-warning-soft);
  color: var(--73-warning-text);
  font-size: 12px;
  line-height: 1.5;
}
.community-boost-warning__mark {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: color-mix(in srgb, var(--73-warning) 18%, transparent);
  font-family: var(--73-font-family-mono);
  font-size: 10px;
  font-weight: 700;
}
.community-boost-error {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--73-danger) 30%, var(--73-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--73-danger) 7%, var(--73-surface));
  color: var(--73-danger);
  font-size: 12px;
}
@media (max-width: 640px) {
  .community-boost-options {
    grid-template-columns: 1fr;
  }
  .community-boost-options label:last-child:nth-child(odd) {
    grid-column: auto;
  }
}
</style>
