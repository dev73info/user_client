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
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 14px 14px 14px 4px;
  background: #ffffff;
  color: #0f172a;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.conversation-message--mine p {
  border-color: rgba(46, 116, 255, 0.18);
  border-radius: 14px 14px 4px 14px;
  background: #eaf2ff;
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
  color: #2d76ec;
  font-size: 28px;
}

.conversation-message__attachment-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  color: #536b55;
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
  color: #78907a;
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
  border-color: rgba(172, 202, 255, 0.84);
  border-radius: 15px 15px 6px 15px;
  background: #e8f1ff;
  box-shadow: 0 8px 20px rgba(45, 118, 236, 0.1);
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
  color: #0f172a;
  grid-template-columns: minmax(0, auto) auto;
  width: fit-content;
  max-width: min(72%, 620px);
  border: 1px solid rgba(218, 229, 244, 0.92);
  border-radius: 15px 15px 15px 6px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 8px 20px rgba(71, 102, 148, 0.08);
}

.conversation-message__bubble p,
.conversation-message--mine .conversation-message__bubble p {
  width: 100%;
  font-size: 15px;
  line-height: 1.5;
  grid-column: 1;
  min-width: 0;
  color: #182335;
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
  color: #7d8da3;
}

.conversation-message__attachment {
  width: min(280px, 64vw);
  grid-column: 1 / -1;
  display: grid;
  gap: 5px;
  max-width: 100%;
}

.conversation-message__attachment-link {
  border: 1px solid rgba(216, 228, 244, 0.88);
  background: #f8fbff;
  display: block;
  overflow: hidden;
  border-radius: 8px;
  color: inherit;
}

.conversation-message__attachment-link img {
  background: #f8fbff;
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
  background: rgba(245, 158, 11, 0.16);
  color: #92400e;
  font-size: 10.5px;
  font-weight: 800;
  line-height: 1.5;
  white-space: nowrap;
}
</style>

<style scoped src="./conversation-shared.css"></style>
