<script setup lang="ts">
import { ref } from 'vue'

import { TButton, TIcon, Document } from 'ui_73info'

import type { TicketAttachment } from '@/api/tickets'

const DEFAULT_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip'
const ALLOWED_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'zip',
]

const props = withDefaults(
  defineProps<{
    attachments: TicketAttachment[]
    readonly?: boolean
    uploading?: boolean
    disabled?: boolean
    accept?: string
    maxSizeMb?: number
  }>(),
  { readonly: false, uploading: false, disabled: false, accept: DEFAULT_ACCEPT, maxSizeMb: 20 },
)

const emit = defineEmits<{
  upload: [file: File]
  download: [attachment: TicketAttachment]
  remove: [attachment: TicketAttachment]
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const localError = ref('')

function pickFile() {
  if (props.disabled || props.readonly) return
  localError.value = ''
  fileInput.value?.click()
}

function onChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    localError.value = '仅支持 png/jpg/gif/webp/pdf/doc/docx/xls/xlsx/ppt/pptx/txt/zip'
    return
  }
  if (file.size > props.maxSizeMb * 1024 * 1024) {
    localError.value = `附件不能超过 ${props.maxSizeMb}MB`
    return
  }
  emit('upload', file)
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}
</script>

<template>
  <div class="ticket-attachments">
    <ul v-if="attachments.length" class="ticket-attachments__list">
      <li v-for="item in attachments" :key="item.id" class="ticket-attachments__item">
        <TIcon><Document /></TIcon>
        <button
          type="button"
          class="ticket-attachments__name"
          :title="`下载 ${item.file_name}`"
          @click="emit('download', item)"
        >
          {{ item.file_name }}
        </button>
        <span class="ticket-attachments__size">{{ formatSize(item.size_bytes) }}</span>
        <TButton
          v-if="!readonly"
          variant="text"
          tone="danger"
          size="sm"
          @click="emit('remove', item)"
        >
          移除
        </TButton>
      </li>
    </ul>
    <div v-if="!readonly" class="ticket-attachments__upload">
      <TButton variant="outline" :loading="uploading" :disabled="disabled" @click="pickFile">
        添加附件
      </TButton>
      <input
        ref="fileInput"
        type="file"
        class="ticket-attachments__input"
        :accept="accept"
        @change="onChange"
      />
    </div>
    <p v-if="localError" class="ticket-attachments__error" role="alert">{{ localError }}</p>
  </div>
</template>

<style scoped>
.ticket-attachments {
  display: grid;
  gap: 8px;
}
.ticket-attachments__list {
  display: grid;
  gap: 6px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.ticket-attachments__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--73-border);
  border-radius: 8px;
  background: var(--73-surface-strong);
  font-size: 12px;
}
.ticket-attachments__name {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--73-accent);
  font: inherit;
  text-align: left;
  word-break: break-all;
  cursor: pointer;
}
.ticket-attachments__name:hover {
  text-decoration: underline;
}
.ticket-attachments__size {
  flex: 0 0 auto;
  color: var(--73-ink-muted);
}
.ticket-attachments__upload {
  display: flex;
}
.ticket-attachments__input {
  display: none;
}
.ticket-attachments__error {
  margin: 0;
  color: var(--73-danger-text);
  font-size: 12px;
}
</style>
