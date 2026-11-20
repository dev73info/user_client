<script setup lang="ts">
import { computed, ref } from 'vue'

import type { SupportAttachment } from '@/api/support'

const props = defineProps<{
  authenticated: boolean
  input: string
  sending: boolean
  uploading: boolean
  pendingAttachments: SupportAttachment[]
  attachmentError: string
}>()

const emit = defineEmits<{
  (event: 'update:input', value: string): void
  (event: 'send'): void
  (event: 'login'): void
  (event: 'attach', files: FileList): void
  (event: 'remove-attachment', id: number): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const inputModel = computed({
  get: () => props.input,
  set: (value: string) => emit('update:input', value),
})
const canSend = computed(
  () =>
    props.authenticated &&
    !props.sending &&
    !props.uploading &&
    (Boolean(props.input.trim()) || props.pendingAttachments.length > 0),
)

function pickFile() {
  if (!props.authenticated || props.uploading) return
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) emit('attach', input.files)
  input.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  if (canSend.value) emit('send')
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}
</script>

<template>
  <footer class="support-composer">
    <div v-if="!authenticated" class="support-login">
      <span>请先登录后再使用在线客服</span>
      <button type="button" @click="emit('login')">去登录</button>
    </div>
    <template v-else>
      <div v-if="pendingAttachments.length" class="support-composer__pending">
        <span v-for="file in pendingAttachments" :key="file.id" class="support-composer__file">
          {{ file.file_name }} · {{ formatSize(file.size_bytes) }}
          <button
            type="button"
            :aria-label="`移除 ${file.file_name}`"
            @click="emit('remove-attachment', file.id)"
          >
            ×
          </button>
        </span>
      </div>
      <p v-if="attachmentError" class="support-composer__error" role="alert">
        {{ attachmentError }}
      </p>
      <div class="support-composer__row">
        <input
          ref="fileInput"
          type="file"
          class="support-composer__input"
          accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
          multiple
          @change="onFileChange"
        />
        <button
          type="button"
          class="support-composer__attach"
          :disabled="uploading || sending"
          aria-label="添加图片或文件"
          @click="pickFile"
        >
          {{ uploading ? '上传中…' : '图片/文件' }}
        </button>
        <textarea
          v-model="inputModel"
          class="support-input"
          rows="2"
          maxlength="5000"
          placeholder="请输入消息，Enter 发送，Shift+Enter 换行"
          aria-label="客服消息"
          @keydown="onKeydown"
        />
        <button type="button" class="support-send" :disabled="!canSend" @click="emit('send')">
          {{ sending ? '发送中…' : '发送' }}
        </button>
      </div>
    </template>
  </footer>
</template>

<style scoped>
.support-composer {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid var(--73-border);
  background: var(--73-surface-strong);
}

.support-login {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 48px;
  color: var(--73-ink-soft);
  font-size: 13px;
}

.support-login button {
  min-height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: var(--73-accent);
  color: var(--73-accent-contrast);
  cursor: pointer;
}

.support-composer__pending {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.support-composer__file {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  padding: 3px 4px 3px 8px;
  border: 1px solid var(--73-border);
  border-radius: 999px;
  background: var(--73-inset);
  color: var(--73-ink-soft);
  font-size: 11px;
}

.support-composer__file button {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--73-ink-muted);
  cursor: pointer;
}

.support-composer__row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.support-composer__input {
  display: none;
}

.support-composer__attach {
  min-height: 36px;
  padding: 0 8px;
  border: 1px solid var(--73-border);
  border-radius: 8px;
  background: var(--73-surface-strong);
  color: var(--73-ink-soft);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.support-composer__attach:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.support-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--73-border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  resize: none;
  outline: none;
}

.support-input:focus {
  border-color: var(--73-accent);
}

.support-send {
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: var(--73-accent);
  color: var(--73-accent-contrast);
  font-size: 14px;
  cursor: pointer;
}

.support-send:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.support-composer__error {
  margin: 0;
  color: var(--73-danger);
  font-size: 12px;
}

@media (max-width: 640px) {
  .support-composer {
    padding-bottom: calc(10px + env(safe-area-inset-bottom));
  }

  .support-composer__attach,
  .support-send {
    min-height: 44px;
  }
}
</style>
