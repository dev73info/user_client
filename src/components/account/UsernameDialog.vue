<script setup lang="ts">
import { computed } from 'vue'

import { TDialog } from 'ui_73info'

const props = defineProps<{
  visible: boolean
  initial: string
  saving: boolean
  error?: string
}>()
const emit = defineEmits<{
  'update:visible': [visible: boolean]
  'update:value': [value: string]
  submit: []
}>()
const value = computed({
  get: () => props.initial,
  set: (next: string) => emit('update:value', next),
})
</script>

<template>
  <TDialog
    :open="props.visible"
    title="修改用户名"
    class="account-dialog"
    width="480px"
    @update:open="emit('update:visible', $event)"
  >
    <div class="dialog-form">
      <div class="profile-update-row">
        <input
          v-model="value"
          type="text"
          aria-label="新的用户名"
          placeholder="请输入新的用户名"
          :disabled="props.saving"
          @keydown.enter="emit('submit')"
        />
        <button class="ghost small" type="button" :disabled="props.saving" @click="emit('submit')">
          {{ props.saving ? '保存中...' : '保存用户名' }}
        </button>
      </div>
      <p v-if="props.error" class="username-dialog__error" role="alert">{{ props.error }}</p>
    </div>
  </TDialog>
</template>

<style scoped>
.dialog-form {
  display: grid;
  gap: 12px;
}

.username-dialog__error {
  margin: 0;
  color: var(--73-danger-text, #b91c1c);
  font-size: 13px;
}
</style>
