<script setup lang="ts">
import { Close, TIcon } from 'ui_73info'

import type { ConversationAttachmentDraft } from '@/composables/useConversationComposer'

/**
 * 作曲器里待发送的截图附件：缩略图、文件名与大小、移除按钮。
 *
 * 从 `RequirementConversationModal.vue` 的作曲器里整块搬出来。预览地址由外层
 * `useConversationComposer` 用 `URL.createObjectURL` 生成、移除时 revoke，这里只摆样子。
 */
defineProps<{
  attachment: ConversationAttachmentDraft
}>()

const emit = defineEmits<{
  remove: []
}>()
</script>

<template>
  <div class="conversation-modal__attachment-preview">
    <img :src="attachment.previewUrl" alt="截图预览" />
    <div>
      <strong>{{ attachment.name }}</strong>
      <span>{{ attachment.sizeLabel }}</span>
    </div>
    <button
      class="conversation-modal__attachment-remove"
      type="button"
      aria-label="移除附件"
      title="移除附件"
      @click="emit('remove')"
    >
      <TIcon>
        <Close />
      </TIcon>
    </button>
  </div>
</template>

<style scoped>
.conversation-modal__attachment-preview img {
  width: 48px;
  object-fit: cover;
}

.conversation-modal__attachment-preview div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.conversation-modal__attachment-preview strong,
.conversation-modal__attachment-preview span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-modal__attachment-preview strong {
  color: var(--73-ink);
  font-size: 13px;
  line-height: 1.25;
}

.conversation-modal__attachment-preview span {
  color: var(--73-ink-muted);
  font-size: 12px;
}

.conversation-modal__composer .conversation-modal__attachment-remove {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  color: var(--73-ink-muted);
}

.conversation-modal__composer .conversation-modal__attachment-remove:hover {
  border-color: color-mix(in srgb, var(--73-danger) 20%, transparent);
  background: var(--73-danger-soft);
  color: var(--73-danger);
}

.conversation-modal__attachment-preview {
  border-color: color-mix(in srgb, var(--73-accent-soft) 96%, transparent);
  background: var(--73-surface-strong);
  box-shadow: 0 12px 24px color-mix(in srgb, var(--73-accent) 10%, transparent);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: min(420px, 100%);
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--73-ink-disabled) 72%, transparent);
  border-radius: 14px;
}

.conversation-modal__attachment-preview img {
  background: var(--73-surface-strong);
  height: 48px;
  border-radius: 10px;
}

@media (max-width: 640px) {
  .conversation-modal__attachment-preview {
    width: 100%;
  }
}
</style>

<style scoped src="./conversation-shared.css"></style>
