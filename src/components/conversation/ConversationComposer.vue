<script setup lang="ts">
import { ref } from 'vue'

import type { ConversationAttachmentDraft } from '@/composables/useConversationComposer'
import ConversationAttachmentPreview from '@/components/conversation/ConversationAttachmentPreview.vue'
import ConversationComposerInput from '@/components/conversation/ConversationComposerInput.vue'

/**
 * 会话底部的作曲器：关闭提示、表情面板、待发送的截图附件、校验与失败提示、只读提示，
 * 以及输入行本身。
 *
 * 从 `RequirementConversationModal.vue` 里整块搬出来。草稿、发送与附件校验仍归外层
 * （`useConversationComposer`），这里只持有表情面板的开关；发送成功后外层通过
 * `closeEmojiPanel()` 收起面板，与原来「发送成功就把面板关掉」一致。
 */
defineProps<{
  draft: string
  sending: boolean
  loading: boolean
  /** 只读（会话已关闭或需求已到期归档）。 */
  locked: boolean
  conversationClosed: boolean
  /** 需求已到期归档：只读提示条要出现，发送被拦时也讲同一件事。 */
  requirementArchived: boolean
  canSend: boolean
  sendError: string
  attachmentError: string
  attachment: ConversationAttachmentDraft | null
}>()

const emit = defineEmits<{
  'update:draft': [value: string]
  submit: []
  'attach-file': [file: File]
  'clear-attachment': []
}>()

const emojiOptions = [
  '😀',
  '😄',
  '😊',
  '😉',
  '👍',
  '👌',
  '🙏',
  '🤝',
  '🎉',
  '✨',
  '🔥',
  '💡',
  '📌',
  '✅',
  '❗',
  '👀',
]

const emojiPanelOpen = ref(false)
const inputRef = ref<InstanceType<typeof ConversationComposerInput> | null>(null)

function toggleEmojiPanel() {
  emojiPanelOpen.value = !emojiPanelOpen.value
}

function insertEmoji(emoji: string) {
  inputRef.value?.insertEmoji(emoji)
}

/** 发送成功后收起面板（判断在发送那边，这里只提供动作）。 */
function closeEmojiPanel() {
  emojiPanelOpen.value = false
}

defineExpose({ closeEmojiPanel })
</script>

<template>
  <footer class="conversation-modal__composer">
    <!-- 需求取消、或交付资源已转为需求方资源后会话都会关闭，文案只讲共同点：仅供查看、不能再发言。 -->
    <p v-if="conversationClosed" class="conversation-modal__closed-tip">
      会话已关闭：这笔需求已结束，历史消息仅供查看，双方都不能再发言。
    </p>
    <div class="conversation-modal__composer-main">
      <Transition name="conversation-emoji">
        <div v-if="emojiPanelOpen" class="conversation-modal__emoji-panel">
          <button
            v-for="emoji in emojiOptions"
            :key="emoji"
            class="conversation-modal__emoji-btn"
            type="button"
            :aria-label="`插入表情 ${emoji}`"
            @click="insertEmoji(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </Transition>

      <ConversationAttachmentPreview
        v-if="attachment"
        :attachment="attachment"
        @remove="emit('clear-attachment')"
      />

      <p v-if="attachmentError" class="conversation-modal__attachment-error">
        {{ attachmentError }}
      </p>

      <!-- 发送失败贴在这里，与附件错误同一位置、同一套样式（复用 __attachment-error 的视觉，
           不新造样式）；时间线不受影响，草稿也还在，用户改一改就能重发。 -->
      <p
        v-if="sendError"
        class="conversation-modal__attachment-error conversation-modal__send-error"
        role="alert"
      >
        {{ sendError }}
      </p>

      <!-- R014：合同有效期届满进入锁定 / 已清除后，会话只读；历史消息与附件仍可查看与下载。 -->
      <p
        v-if="requirementArchived"
        class="conversation-modal__readonly-hint"
        role="status"
        data-testid="conversation-archive-readonly"
      >
        合同有效期已届满，会话在资料保留期内只读：不能发消息或传附件，历史内容仍可查看与下载。
      </p>

      <ConversationComposerInput
        ref="inputRef"
        :draft="draft"
        :sending="sending"
        :loading="loading"
        :locked="locked"
        :can-send="canSend"
        :emoji-open="emojiPanelOpen"
        @update:draft="emit('update:draft', $event)"
        @submit="emit('submit')"
        @attach-file="emit('attach-file', $event)"
        @toggle-emoji="toggleEmojiPanel"
      />
    </div>
  </footer>
</template>

<style scoped>
.conversation-modal__closed-tip {
  grid-column: 1 / -1;
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.conversation-modal-wrap--inline .conversation-modal__composer {
  padding: 12px 14px;
}

.conversation-modal__composer-main {
  gap: 8px;
  position: relative;
  min-width: 0;
  display: grid;
}

.conversation-modal__composer .conversation-modal__emoji-btn {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  font-size: 18px;
  line-height: 1;
}

.conversation-emoji-enter-active,
.conversation-emoji-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.conversation-emoji-enter-from,
.conversation-emoji-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.conversation-modal__emoji-panel {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 0;
  z-index: 4;
  border-color: rgba(207, 220, 238, 0.96);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 38px rgba(71, 102, 148, 0.18);
  display: grid;
  grid-template-columns: repeat(8, 32px);
  gap: 6px;
  width: max-content;
  max-width: 100%;
  padding: 8px;
  border: 1px solid rgba(185, 204, 190, 0.72);
  border-radius: 14px;
}

.conversation-modal__composer .conversation-modal__emoji-btn:hover {
  border-color: rgba(79, 140, 255, 0.34);
  background: #eef6ff;
  transform: translateY(-1px);
}

.conversation-modal__attachment-error {
  margin: 0;
  padding-left: 4px;
  color: #b42318;
  font-size: 12px;
  line-height: 1.35;
}

/* === 输入区：上一行业务入口，下一行「表情 · 附件 · 输入框 · 发送」同一水平线 ===
   发送键已挪进输入行，底栏不再需要给它留第二列。 */
.conversation-modal__composer {
  grid-template-columns: minmax(0, 1fr);
  flex: 0 0 auto;
  display: grid;
  margin-top: 0;
  gap: 10px;
  padding: 8px 12px;
  border-top: 1px solid rgba(167, 190, 166, 0.36);
  align-items: end;
  border-top-color: rgba(216, 228, 244, 0.95);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 -10px 24px rgba(71, 102, 148, 0.06);
}

@media (max-width: 640px) {
  .conversation-modal__emoji-panel {
    left: 0;
    max-width: calc(100vw - 36px);
    grid-template-columns: repeat(6, 32px);
  }

  .conversation-modal__composer {
    padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
    gap: 8px;
    grid-template-columns: minmax(0, 1fr) 44px;
  }
}

/* R014：到期归档后会话只读的提示条。放在作曲器顶部，讲清「只读但历史可看可下载」。 */
.conversation-modal__readonly-hint {
  margin: 0 0 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #fde68a;
  background: #fffbeb;
  color: #92400e;
  font-size: 12.5px;
  line-height: 1.6;
}
</style>

<style scoped src="./conversation-shared.css"></style>
