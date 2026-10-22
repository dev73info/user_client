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
  color: #172033;
  font-size: 13px;
  line-height: 1.25;
}

.conversation-modal__attachment-preview span {
  color: #6b7f6d;
  font-size: 12px;
}

.conversation-modal__composer .conversation-modal__attachment-remove {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  color: #64748b;
}

.conversation-modal__composer .conversation-modal__attachment-remove:hover {
  border-color: rgba(190, 18, 60, 0.2);
  background: #fff1f2;
  color: #be123c;
}

.conversation-modal__attachment-preview {
  border-color: rgba(207, 220, 238, 0.96);
  background: #ffffff;
  box-shadow: 0 12px 24px rgba(71, 102, 148, 0.1);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: min(420px, 100%);
  padding: 8px;
  border: 1px solid rgba(185, 204, 190, 0.72);
  border-radius: 14px;
}

.conversation-modal__attachment-preview img {
  background: #f1f6fb;
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
