<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import { downloadSupportAttachment, type SupportAttachment } from '@/api/support'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ attachments: SupportAttachment[] }>()

const auth = useAuthStore()
const imageUrls = ref<Record<number, string>>({})
const failedImages = ref<Set<number>>(new Set())
const downloading = ref<number | null>(null)
const error = ref('')
let disposed = false
let generation = 0

function isImage(attachment: SupportAttachment) {
  return (attachment.content_type ?? '').startsWith('image/')
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}

function revokeImages() {
  for (const url of Object.values(imageUrls.value)) URL.revokeObjectURL(url)
  imageUrls.value = {}
}

async function loadImages(items: SupportAttachment[]) {
  const current = ++generation
  revokeImages()
  failedImages.value = new Set()
  const token = auth.token.trim()
  if (!token) return
  for (const attachment of items.filter(isImage)) {
    try {
      const blob = await downloadSupportAttachment(token, attachment.id)
      if (disposed || current !== generation || auth.token.trim() !== token) return
      imageUrls.value[attachment.id] = URL.createObjectURL(blob)
    } catch {
      if (current === generation) failedImages.value.add(attachment.id)
    }
  }
}

async function download(attachment: SupportAttachment) {
  const token = auth.token.trim()
  if (!token || downloading.value !== null) return
  downloading.value = attachment.id
  error.value = ''
  try {
    const blob = await downloadSupportAttachment(token, attachment.id)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = attachment.file_name
    link.click()
    URL.revokeObjectURL(url)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '下载附件失败'
  } finally {
    downloading.value = null
  }
}

watch(() => props.attachments, loadImages, { immediate: true })

onBeforeUnmount(() => {
  disposed = true
  revokeImages()
})
</script>

<template>
  <div v-if="attachments.length" class="support-files">
    <div v-if="attachments.some(isImage)" class="support-files__images">
      <button
        v-for="attachment in attachments.filter(isImage)"
        :key="attachment.id"
        type="button"
        class="support-files__image"
        :aria-label="`下载图片 ${attachment.file_name}`"
        @click="download(attachment)"
      >
        <img
          v-if="imageUrls[attachment.id]"
          :src="imageUrls[attachment.id]"
          :alt="attachment.file_name"
        />
        <span v-else class="support-files__image-placeholder">
          {{ failedImages.has(attachment.id) ? '图片加载失败' : '加载中…' }}
        </span>
      </button>
    </div>
    <button
      v-for="attachment in attachments.filter((item) => !isImage(item))"
      :key="attachment.id"
      type="button"
      class="support-files__file"
      :disabled="downloading === attachment.id"
      @click="download(attachment)"
    >
      <span class="support-files__icon" aria-hidden="true">文件</span>
      <span class="support-files__name">{{ attachment.file_name }}</span>
      <span class="support-files__size">{{ formatSize(attachment.size_bytes) }}</span>
    </button>
    <p v-if="error" class="support-files__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.support-files {
  display: grid;
  gap: 6px;
  margin-top: 6px;
  width: 100%;
}

.support-files__images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.support-files__image {
  width: 112px;
  height: 84px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--73-border);
  border-radius: 8px;
  background: var(--73-inset);
  cursor: pointer;
}

.support-files__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.support-files__image-placeholder {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 6px;
  color: var(--73-ink-muted);
  font-size: 11px;
}

.support-files__file {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 9px;
  border: 1px solid var(--73-border);
  border-radius: 8px;
  background: var(--73-surface-strong);
  color: var(--73-ink);
  text-align: left;
  cursor: pointer;
}

.support-files__file:disabled {
  opacity: 0.6;
  cursor: wait;
}

.support-files__icon {
  flex: 0 0 auto;
  color: var(--73-accent);
  font-size: 10px;
}

.support-files__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.support-files__size {
  flex: 0 0 auto;
  color: var(--73-ink-muted);
  font-size: 11px;
}

.support-files__error {
  margin: 0;
  color: var(--73-danger);
  font-size: 11px;
}
</style>
