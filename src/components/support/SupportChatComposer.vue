<script setup lang="ts">
import { computed, ref } from 'vue'

import type { SupportAttachment } from '@/api/support'

const props = defineProps<{
  input: string
  sending: boolean
  uploading: boolean
  pendingAttachments: SupportAttachment[]
  attachmentError: string
}>()

const emit = defineEmits<{
  (event: 'update:input', value: string): void
  (event: 'send'): void
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
    !props.sending &&
    !props.uploading &&
    (Boolean(props.input.trim()) || props.pendingAttachments.length > 0),
)

function pickFile() {
  if (props.uploading) return
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
    <div v-if="pendingAttachments.length" class="support-composer__pending">
      <span v-for="file in pendingAttachments" :key="file.id" class="support-composer__file">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M7.25 10.5 11 6.75a2.3 2.3 0 0 1 3.25 3.25l-5.5 5.5a3.7 3.7 0 0 1-5.25-5.25l5.5-5.5"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
          />
        </svg>
        <span>{{ file.file_name }}</span>
        <small>{{ formatSize(file.size_bytes) }}</small>
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
    <div class="support-composer__box">
      <textarea
        v-model="inputModel"
        class="support-input"
        rows="2"
        maxlength="5000"
        placeholder="输入消息，Enter 发送"
        aria-label="客服消息"
        @keydown="onKeydown"
      />
      <div class="support-composer__actions">
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
          class="support-composer__icon"
          :disabled="uploading || sending"
          aria-label="添加图片或文件"
          title="添加图片或文件"
          @click="pickFile"
        >
          <svg v-if="!uploading" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m20.5 11.5-7.72 7.72a5.5 5.5 0 1 1-7.78-7.78l8.49-8.49a3.67 3.67 0 1 1 5.18 5.18l-8.49 8.49a1.83 1.83 0 1 1-2.59-2.59l7.78-7.78"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span v-else class="support-composer__spinner" aria-hidden="true" />
        </button>
        <span class="support-composer__tip">图片 / 文件</span>
        <button type="button" class="support-send" :disabled="!canSend" @click="emit('send')">
          <span v-if="!sending">发送</span>
          <span v-else class="support-composer__spinner" aria-hidden="true" />
          <svg v-if="!sending" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="m3 10 13-6-4.15 12L9.5 11 3 10Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.support-composer {
  display: grid;
  gap: 7px;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--73-border);
  background: var(--73-surface-strong);
}

.support-composer__pending {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.support-composer__file {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 4px 4px 4px 8px;
  border: 1px solid var(--73-border);
  border-radius: 9px;
  background: var(--73-inset);
  color: var(--73-ink-soft);
  font-size: 11px;
}

.support-composer__file svg {
  width: 13px;
  height: 13px;
  flex: none;
}

.support-composer__file span {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.support-composer__file small {
  flex: none;
  color: var(--73-ink-muted);
  font-size: 10px;
}

.support-composer__file button {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--73-ink-muted);
  cursor: pointer;
}

.support-composer__file button:hover {
  background: var(--73-surface-strong);
  color: var(--73-ink);
}

.support-composer__box {
  display: grid;
  gap: 5px;
  padding: 8px 9px 7px;
  border: 1px solid var(--73-border);
  border-radius: 12px;
  background: var(--73-surface-strong);
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease;
}

.support-composer__box:focus-within {
  border-color: var(--73-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--73-accent) 12%, transparent);
}

.support-input {
  width: 100%;
  min-height: 48px;
  max-height: 112px;
  box-sizing: border-box;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--73-ink);
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
}

.support-input::placeholder {
  color: var(--73-ink-placeholder);
}

.support-composer__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.support-composer__input {
  display: none;
}

.support-composer__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--73-ink-muted);
  cursor: pointer;
}

.support-composer__icon:hover:not(:disabled) {
  background: var(--73-inset);
  color: var(--73-ink);
}

.support-composer__icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.support-composer__icon svg {
  width: 19px;
  height: 19px;
}

.support-composer__tip {
  color: var(--73-ink-disabled);
  font-size: 11px;
}

.support-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 32px;
  min-width: 68px;
  margin-left: auto;
  padding: 0 11px;
  border: none;
  border-radius: 9px;
  background: var(--73-accent);
  color: var(--73-accent-contrast);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.support-send svg {
  width: 15px;
  height: 15px;
}

.support-send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.support-composer__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: support-spin 0.7s linear infinite;
}

.support-composer__error {
  margin: 0;
  color: var(--73-danger);
  font-size: 12px;
}

@keyframes support-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .support-composer {
    padding-bottom: calc(10px + env(safe-area-inset-bottom));
  }

  .support-composer__icon {
    width: 38px;
    height: 38px;
  }

  .support-send {
    height: 38px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .support-composer__spinner {
    animation-duration: 1.4s;
  }
}
</style>
