<script setup lang="ts">
import { ref } from 'vue'
import { MagicStick, Paperclip, Position, TIcon } from 'ui_73info'

import ConversationComposerField from '@/components/conversation/ConversationComposerField.vue'

/**
 * 会话作曲器的输入行：表情 / 附件两颗工具按钮、隐藏的文件选择、输入框、发送键。
 *
 * 从 `RequirementConversationModal.vue` 的作曲器里整块搬出来。草稿与发送仍归外层
 * （`useConversationComposer`），这里只管输入行本身；表情面板在外层作曲器里，
 * 点了表情要插到光标处，由这里把调用转给输入框组件。
 */
const props = defineProps<{
  draft: string
  sending: boolean
  loading: boolean
  /** 只读（会话已关闭或需求已到期归档）：输入框与两颗工具按钮一起禁用。 */
  locked: boolean
  canSend: boolean
  /** 表情面板是否开着（面板在外层作曲器里，这里只用来点亮按钮）。 */
  emojiOpen: boolean
}>()

const emit = defineEmits<{
  'update:draft': [value: string]
  submit: []
  'attach-file': [file: File]
  'toggle-emoji': []
}>()

const attachmentInputRef = ref<HTMLInputElement | null>(null)
const fieldRef = ref<InstanceType<typeof ConversationComposerField> | null>(null)

/* 表情面板与附件选择器都要跟着作曲器一起关掉。守卫里的条件必须和发送同口径：
   只判会话关闭而漏掉归档只读期，这两颗按钮看起来是可用的，点下去要到发送那一步才被拦。 */
function toggleEmojiPanel() {
  if (props.sending || props.loading || props.locked) {
    return
  }
  emit('toggle-emoji')
}

function openAttachmentPicker() {
  // 同上：与发送同口径，归档只读期不许打开文件选择
  if (props.sending || props.loading || props.locked) {
    return
  }
  attachmentInputRef.value?.click()
}

function handleAttachmentFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    emit('attach-file', file)
  }
  input.value = ''
}

/** 表情插到光标处：面板在外层，点了表情转给输入框。 */
function insertEmoji(emoji: string) {
  fieldRef.value?.insertEmoji(emoji)
}

defineExpose({ insertEmoji })
</script>

<template>
  <div class="conversation-modal__input-row">
    <button
      class="conversation-modal__tool-btn"
      :class="{ 'is-active': emojiOpen }"
      type="button"
      :disabled="sending || loading || locked"
      aria-label="选择表情"
      title="选择表情"
      @click="toggleEmojiPanel"
    >
      <TIcon>
        <MagicStick />
      </TIcon>
    </button>
    <button
      class="conversation-modal__tool-btn"
      type="button"
      :disabled="sending || loading || locked"
      aria-label="添加截图附件"
      title="添加截图附件"
      @click="openAttachmentPicker"
    >
      <TIcon>
        <Paperclip />
      </TIcon>
    </button>
    <input
      ref="attachmentInputRef"
      class="conversation-modal__attachment-native"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      @change="handleAttachmentFileChange"
    />
    <ConversationComposerField
      ref="fieldRef"
      :draft="draft"
      :sending="sending"
      :loading="loading"
      :locked="locked"
      @update:draft="emit('update:draft', $event)"
      @submit="emit('submit')"
      @attach-file="emit('attach-file', $event)"
    />
    <button
      class="conversation-modal__send-btn"
      type="button"
      :disabled="!canSend"
      aria-label="发送消息"
      title="发送消息"
      @click="emit('submit')"
    >
      <TIcon>
        <Position />
      </TIcon>
    </button>
  </div>
</template>

<style scoped>
.conversation-modal__send-btn {
  display: inline-grid;
  place-items: center;
  border: 0;
  cursor: pointer;
  transition:
    background 140ms ease,
    box-shadow 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

.conversation-modal__send-btn {
  width: 46px;
  height: 46px;
  min-width: 0;
  padding: 0;
  border-radius: 999px;
  background: var(--73-accent);
  color: var(--73-surface-strong);
  font-size: 20px;
  box-shadow: 0 10px 22px color-mix(in srgb, var(--73-accent) 22%, transparent);
}

.conversation-modal__send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  background: var(--73-accent);
  box-shadow: 0 12px 26px color-mix(in srgb, var(--73-accent) 26%, transparent);
}

.conversation-modal__send-btn:disabled {
  cursor: not-allowed;
  background: var(--73-ink-disabled);
  box-shadow: none;
  opacity: 0.8;
}

@media (max-width: 640px) {
  .conversation-modal__send-btn {
    width: 44px;
    height: 44px;
  }
}

.conversation-modal__composer .conversation-modal__tool-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.conversation-modal__attachment-native {
  display: none;
}

.conversation-modal__composer .conversation-modal__tool-btn {
  width: 36px;
  height: 36px;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--73-accent) 8%, transparent);
  border-radius: 999px;
  font-size: 17px;
}

.conversation-modal__composer .conversation-modal__tool-btn:hover:not(:disabled),
.conversation-modal__composer .conversation-modal__tool-btn.is-active {
  border-color: color-mix(in srgb, var(--73-accent) 44%, transparent);
  background: var(--73-accent-soft);
  color: var(--73-accent);
  box-shadow: 0 10px 20px color-mix(in srgb, var(--73-accent) 14%, transparent);
  transform: translateY(-1px);
}

.conversation-modal__composer .conversation-modal__send-btn:disabled {
  background: var(--73-ink-disabled);
  color: var(--73-surface-strong);
  box-shadow: none;
}

.conversation-modal__composer .conversation-modal__send-btn {
  background: var(--73-accent);
  box-shadow: 0 12px 24px color-mix(in srgb, var(--73-accent) 24%, transparent);
  align-self: center;
  width: 48px;
  min-width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  color: var(--73-surface-strong);
  font-size: 22px;
}

.conversation-modal__composer .conversation-modal__send-btn:hover:not(:disabled) {
  background: var(--73-accent);
  box-shadow: 0 14px 28px color-mix(in srgb, var(--73-accent) 28%, transparent);
}

.conversation-modal__input-row .conversation-modal__tool-btn,
.conversation-modal__input-row .conversation-modal__send-btn {
  flex: 0 0 auto;
}

/* 输入框可长高（高度由输入框组件的 resizeDraftInput 写在行内）：外壳不再钉死高度，
   单行时靠 min-height 与 align-items:center 居中；多行时胶囊圆角会变成「药丸」，改用固定圆角 */
.conversation-modal__input-row {
  align-items: flex-end;
  display: flex;
  gap: 6px;
  min-width: 0;
}

@media (max-width: 640px) {
  .conversation-modal__composer .conversation-modal__tool-btn {
    width: 34px;
    height: 34px;
    box-shadow: none;
  }

  /* 发送键与表情、附件同为 34px；输入框单行高 40px，三颗按钮底边各抬 3px，
     单行时与输入框中线对齐，多行时仍贴着最后一行 */
  .conversation-modal__composer .conversation-modal__send-btn {
    width: 34px;
    min-width: 34px;
    height: 34px;
    box-shadow: none;
  }

  .conversation-modal__input-row .conversation-modal__tool-btn,
  .conversation-modal__input-row .conversation-modal__send-btn {
    margin-bottom: 3px;
  }
}
</style>

<style scoped src="./conversation-shared.css"></style>
