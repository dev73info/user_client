<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { findClipboardImage } from '@/composables/useConversationComposer'

/**
 * 会话作曲器的输入框（外壳 + textarea）：草稿绑定、随内容长高、回车发送、粘贴截图、插入表情。
 *
 * 从 `RequirementConversationModal.vue` 的作曲器里整块搬出来。草稿的真源仍在父组件
 * （`useConversationComposer` 管发送与清空），这里只做输入框这一层。
 */
const props = defineProps<{
  draft: string
  /** 只读（会话已关闭或需求已到期归档）。 */
  locked: boolean
  sending: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  'update:draft': [value: string]
  submit: []
  'attach-file': [file: File]
}>()

const draftInputRef = ref<HTMLTextAreaElement | null>(null)

/* 输入框随内容长高，封顶 4 行后改为框内滚动；样式表里的固定高度只是单行时的起点，
   不跟着撑高的话换行后前面的字和光标都会被裁掉。 */
const DRAFT_MAX_LINES = 4
function resizeDraftInput() {
  const el = draftInputRef.value
  if (!el) return
  el.style.height = ''
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 22
  const maxHeight = lineHeight * DRAFT_MAX_LINES
  const next = Math.min(el.scrollHeight, maxHeight)
  el.style.height = `${next}px`
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

watch(
  () => props.draft,
  () => {
    void nextTick(resizeDraftInput)
  },
)

/* v-model 走可写 computed：草稿的真源在父组件，断句与 IME 组词仍交给 v-model 处理。 */
const draftModel = computed({
  get: () => props.draft,
  set: (value: string) => emit('update:draft', value),
})

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Enter' || event.shiftKey) {
    return
  }

  event.preventDefault()
  emit('submit')
}

function handlePaste(event: ClipboardEvent) {
  const file = findClipboardImage(event.clipboardData)
  if (!file) {
    return
  }

  event.preventDefault()
  emit('attach-file', file)
}

/** 表情插到光标处（光标跟着挪到表情后面）：表情面板在输入行，点了表情回调到这里。 */
function insertEmoji(emoji: string) {
  const input = draftInputRef.value
  if (!input) {
    emit('update:draft', `${props.draft}${emoji}`)
    return
  }

  const selectionStart = input.selectionStart ?? props.draft.length
  const selectionEnd = input.selectionEnd ?? selectionStart
  emit(
    'update:draft',
    `${props.draft.slice(0, selectionStart)}${emoji}${props.draft.slice(selectionEnd)}`,
  )

  void nextTick(() => {
    input.focus()
    const cursorPosition = selectionStart + emoji.length
    input.setSelectionRange(cursorPosition, cursorPosition)
  })
}

defineExpose({ insertEmoji })
</script>

<template>
  <div class="conversation-modal__input-shell">
    <textarea
      ref="draftInputRef"
      v-model="draftModel"
      maxlength="5000"
      placeholder="输入消息"
      spellcheck="false"
      autocomplete="new-password"
      autocorrect="off"
      autocapitalize="off"
      aria-autocomplete="none"
      data-ms-editor="false"
      data-gramm="false"
      data-gramm_editor="false"
      data-enable-grammarly="false"
      data-lt-active="false"
      data-form-type="other"
      data-lpignore="true"
      data-1p-ignore="true"
      :disabled="locked"
      @keydown="handleKeydown"
      @paste="handlePaste"
    ></textarea>
  </div>
</template>

<style scoped>
.conversation-modal__composer textarea {
  min-height: 72px;
  resize: vertical;
  border: 1px solid color-mix(in srgb, var(--73-ink-disabled) 95%, transparent);
  border-radius: 12px;
  padding: 10px 12px;
  color: var(--73-ink);
  font: inherit;
  line-height: 1.6;
}

.conversation-modal-wrap--inline .conversation-modal__composer textarea {
  min-height: 60px;
}

.conversation-modal__input-shell textarea {
  width: 100%;
  min-height: 38px;
  max-height: 120px;
  resize: none;
  border: 0;
  outline: 0;
  padding: 6px 0;
  color: var(--73-ink);
  background: transparent;
  font: inherit;
  line-height: 1.55;
}

.conversation-modal__input-shell span {
  color: var(--73-ink-placeholder);
  font-size: 11px;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .conversation-modal__input-shell {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
    border-radius: 16px;
  }

  .conversation-modal__input-shell span {
    justify-self: end;
  }
}

.conversation-modal__input-shell {
  min-height: 52px;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
  padding: 8px 10px 8px 12px;
  border: 1px solid color-mix(in srgb, var(--73-ink-disabled) 95%, transparent);
  border-radius: 18px;
  background: var(--73-surface-strong);
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--73-ink) 3%, transparent);
}

.conversation-modal-wrap--inline .conversation-modal__input-shell textarea {
  min-height: 38px;
}

.conversation-modal__composer .conversation-modal__input-shell textarea::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.conversation-modal__composer .conversation-modal__input-shell textarea::-webkit-scrollbar-button,
.conversation-modal__composer .conversation-modal__input-shell textarea::-webkit-resizer {
  display: none;
  width: 0;
  height: 0;
}

.conversation-modal__composer .conversation-modal__input-shell input {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  min-width: 0;
  height: 24px;
  border: 0;
  outline: 0;
  padding: 0 82px 0 0;
  background: transparent;
  color: var(--73-ink);
  font: inherit;
  font-size: 15px;
  line-height: 24px;
}

.conversation-modal__composer .conversation-modal__input-shell input::placeholder {
  color: var(--73-ink-placeholder);
}

.conversation-modal__composer .conversation-modal__input-shell textarea::placeholder {
  color: var(--73-ink-placeholder);
}

@media (max-width: 640px) {
  .conversation-modal__composer .conversation-modal__input-shell textarea {
    height: 22px;
    min-height: 22px;
    font-size: 14px;
    line-height: 22px;
  }

  .conversation-modal__composer .conversation-modal__input-shell input {
    height: 22px;
    padding-right: 70px;
    font-size: 14px;
    line-height: 22px;
  }

  .conversation-modal__composer .conversation-modal__input-shell span {
    font-size: 11px;
  }
}

.conversation-modal__composer .conversation-modal__input-shell {
  min-height: 50px;
  height: 50px;
  border-color: color-mix(in srgb, var(--73-accent-soft) 96%, transparent);
  background: var(--73-surface-strong);
  box-shadow:
    0 8px 22px color-mix(in srgb, var(--73-accent) 8%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--73-surface-strong) 96%, transparent);
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 12px 0 18px;
  border-radius: 999px;
}

.conversation-modal__composer .conversation-modal__input-shell:focus-within {
  border-color: color-mix(in srgb, var(--73-accent) 70%, transparent);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--73-accent) 13%, transparent),
    0 10px 24px color-mix(in srgb, var(--73-accent) 10%, transparent);
}

.conversation-modal__composer .conversation-modal__input-shell textarea {
  color: var(--73-ink);
  appearance: none;
  -webkit-appearance: none;
  height: 24px;
  min-height: 24px;
  max-height: 72px;
  padding: 0;
  resize: none;
  font-size: 15px;
  line-height: 24px;
  overflow: hidden;
  scrollbar-width: none;
}

.conversation-modal__composer .conversation-modal__input-shell span {
  color: var(--73-ink-placeholder);
  position: absolute;
  top: 50%;
  right: 16px;
  z-index: 2;
  transform: translateY(-50%);
  padding-left: 8px;
  background: var(--73-surface-strong);
  font-size: 12px;
  line-height: 1;
  pointer-events: none;
}

.conversation-modal__input-row .conversation-modal__input-shell {
  flex: 1 1 auto;
  min-width: 0;
}

.conversation-modal__composer .conversation-modal__input-row .conversation-modal__input-shell {
  height: auto;
  padding: 8px 9px 8px 15px;
  border-radius: 20px;
}

/* textarea 自身 overflow 不可见、内边距为 0 时，光标落在首字前会被左缘裁掉：
   左右各留 3px 给光标，外壳内边距同步减 3px，文字位置不变 */
.conversation-modal__composer
  .conversation-modal__input-row
  .conversation-modal__input-shell
  textarea {
  max-height: none;
  padding-right: 3px;
  padding-left: 3px;
}

@media (max-width: 640px) {
  .conversation-modal__composer .conversation-modal__input-row .conversation-modal__input-shell {
    padding-right: 11px;
    padding-left: 11px;
  }

  .conversation-modal__composer .conversation-modal__input-shell {
    min-height: 40px;
    height: 40px;
    padding-right: 14px;
    padding-left: 14px;
  }
}
</style>
