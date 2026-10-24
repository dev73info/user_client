<script setup lang="ts">
import { computed } from 'vue'
import { Picture, TIcon } from 'ui_73info'

import { apiUrl } from '@/api/http'
import { formatBytes, isImageAttachment } from '@/shared/attachmentFile'
import { avatarText, formatMessageClock } from '@/shared/conversationTime'
import type { RequirementConversationMessage } from '@/shared/conversations'

/**
 * 时间线上的一条消息气泡（含截图附件与「前任开发者」署名）。
 *
 * 从 `RequirementConversationModal.vue` 的时间线里整块搬出来，只接一条消息与三个已算好的
 * 布尔：是不是我方、要不要露头像、是不是前任开发者发的。判断仍由父组件的时间线摊平逻辑做。
 */
const props = defineProps<{
  message: RequirementConversationMessage
  mine: boolean
  showAvatar: boolean
  /** 被公开的历史消息、且是前任开发者发的：气泡上署名，避免误认成当前负责人。 */
  previousDeveloper: boolean
}>()

const attachmentUrl = computed(() =>
  props.message.attachment_url ? apiUrl(props.message.attachment_url) : '',
)
const attachmentLabel = computed(() => props.message.attachment_name || '截图附件')
</script>

<template>
  <article class="conversation-message" :class="{ 'conversation-message--mine': mine }">
    <div v-if="!mine" class="conversation-message__avatar-slot" aria-hidden="true">
      <div v-if="showAvatar" class="conversation-message__avatar">
        {{ avatarText(message.sender) }}
      </div>
    </div>
    <div class="conversation-message__bubble">
      <span v-if="previousDeveloper" class="conversation-message__history-tag">
        前任开发者 {{ message.sender }}
      </span>
      <div v-if="message.attachment_url" class="conversation-message__attachment">
        <a
          class="conversation-message__attachment-link"
          :href="attachmentUrl"
          target="_blank"
          rel="noopener noreferrer"
          :title="attachmentLabel"
        >
          <img v-if="isImageAttachment(message)" :src="attachmentUrl" :alt="attachmentLabel" />
          <span v-else class="conversation-message__attachment-file">
            <TIcon>
              <Picture />
            </TIcon>
          </span>
        </a>
        <div class="conversation-message__attachment-meta">
          <span>{{ attachmentLabel }}</span>
          <small v-if="message.attachment_size">{{ formatBytes(message.attachment_size) }}</small>
        </div>
      </div>
      <p v-if="message.content">{{ message.content }}</p>
      <time :title="message.created_at">{{ formatMessageClock(message.created_at) }}</time>
    </div>
  </article>
</template>

<style scoped>
.conversation-message p {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--73-border) 90%, transparent);
  border-radius: 14px 14px 14px 4px;
  background: var(--73-surface-strong);
  color: var(--73-ink);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.conversation-message--mine p {
  border-color: color-mix(in srgb, var(--73-accent) 18%, transparent);
  border-radius: 14px 14px 4px 14px;
  background: var(--73-accent-soft);
}

.conversation-message--mine {
  justify-content: flex-end;
  margin-left: auto;
}

.conversation-message__bubble p {
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.conversation-message--mine .conversation-message__bubble p {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.conversation-message {
  max-width: 880px;
}

.conversation-message {
  margin: 0 0 4px;
}

.conversation-message__avatar-slot {
  flex: 0 0 28px;
}

.conversation-message__bubble {
  column-gap: 10px;
  row-gap: 2px;
}

.conversation-message__bubble time {
  margin: 0;
}

.conversation-message__attachment-file {
  display: grid;
  place-items: center;
  height: 120px;
  color: var(--73-accent);
  font-size: 28px;
}

.conversation-message__attachment-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  color: var(--73-ink-soft);
  font-size: 11px;
  line-height: 1.25;
}

.conversation-message__attachment-meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-message__attachment-meta small {
  flex: 0 0 auto;
  color: var(--73-ink-muted);
  font-size: 10px;
}

.conversation-message__attachment + p {
  grid-column: 1 / -1;
  margin-top: 2px;
}

.conversation-message__avatar-slot {
  width: 30px;
  flex-basis: 30px;
  display: inline-flex;
  justify-content: center;
}

.conversation-message--mine .conversation-message__bubble {
  border-color: color-mix(in srgb, var(--73-accent) 84%, transparent);
  border-radius: 15px 15px 6px 15px;
  background: var(--73-accent-soft);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--73-accent) 10%, transparent);
}

.conversation-message {
  flex: 0 0 auto;
  margin-bottom: 10px;
  display: flex;
  width: 100%;
  margin-right: auto;
  margin-left: auto;
  max-width: 100%;
  min-height: 0;
  align-items: flex-end;
  gap: 8px;
}

.conversation-message:last-child {
  margin-bottom: 0;
}

.conversation-message__bubble {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 104px;
  padding: 10px 12px 7px;
  position: relative;
  color: var(--73-ink);
  grid-template-columns: minmax(0, auto) auto;
  width: fit-content;
  max-width: min(72%, 620px);
  border: 1px solid color-mix(in srgb, var(--73-accent-soft) 92%, transparent);
  border-radius: 15px 15px 15px 6px;
  background: color-mix(in srgb, var(--73-surface-strong) 96%, transparent);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--73-accent) 8%, transparent);
}

.conversation-message__bubble p,
.conversation-message--mine .conversation-message__bubble p {
  width: 100%;
  font-size: 15px;
  line-height: 1.5;
  grid-column: 1;
  min-width: 0;
  color: var(--73-ink);
}

.conversation-message__bubble time {
  align-self: flex-end;
  margin-top: 0;
  font-size: 11px;
  line-height: 1;
  display: block;
  text-align: right;
  grid-column: 2;
  white-space: nowrap;
  color: var(--73-ink-placeholder);
}

.conversation-message__attachment {
  width: min(280px, 64vw);
  grid-column: 1 / -1;
  display: grid;
  gap: 5px;
  max-width: 100%;
}

.conversation-message__attachment-link {
  border: 1px solid color-mix(in srgb, var(--73-accent-soft) 88%, transparent);
  background: var(--73-accent-soft);
  display: block;
  overflow: hidden;
  border-radius: 8px;
  color: inherit;
}

.conversation-message__attachment-link img {
  background: var(--73-accent-soft);
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: contain;
}

@media (max-width: 640px) {
  .conversation-message {
    margin-bottom: 8px;
    width: 100%;
    max-width: 100%;
  }

  .conversation-message__bubble {
    min-width: 98px;
    padding: 9px 11px 7px;
    max-width: calc(100% - 42px);
  }

  .conversation-message__bubble p,
  .conversation-message--mine .conversation-message__bubble p {
    font-size: 14px;
  }
}

/* 被公开的历史消息：标出这是前任开发者发的 */
.conversation-message__history-tag {
  align-self: flex-start;
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--73-warning) 16%, transparent);
  color: var(--73-warning-text);
  font-size: 10.5px;
  font-weight: 800;
  line-height: 1.5;
  white-space: nowrap;
}
</style>

<style scoped src="./conversation-shared.css"></style>
