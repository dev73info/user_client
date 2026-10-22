<script setup lang="ts">
import { ref, toRef, watch } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { ArrowDown, Brush, Link as LinkIcon, RefreshLeft, RefreshRight, TIcon } from 'ui_73info'
import { useRichTextEditorToolbar } from '@/composables/useRichTextEditorToolbar'
import { useRichEditorMediaInsert } from '@/composables/useRichEditorMediaInsert'
import { codeLanguageOptions } from '@/utils/richEditorCodeLanguage'
import { fontSizeMax, fontSizeMin, headingOptions } from '@/utils/richEditorTypography'
import { insertOptions, toolbarActions, type NotifyType } from '@/utils/richEditorToolbarOptions'

/**
 * 富文本编辑器的工具栏：标题级别、字号、加粗 / 斜体 / 下划线 / 列表 / 引用 / 代码块、
 * 代码块语言、链接、插入、撤销重做、清除格式。
 *
 * 从 `RichTextEditor.vue` 里整块搬出来，结构与文案原样保留。命令与状态在
 * `useRichTextEditorToolbar`，这里只管渲染与把事件接上去；工具栏元素通过
 * `toolbarElement` 暴露给外层，吸顶悬浮要量它的高度。
 *
 * `fontSizeRevision` 是外层在「编辑器内容更新 / 选中变化」时递增的计数，用来把
 * 光标处的字号同步回输入框——与原来是同一个触发点，不跟着事务变化同步，
 * 免得用户正在输入的字号被清掉。
 */
const props = defineProps<{
  editor: Editor | undefined
  /** 编辑器选中 / 事务变化计数器，用来重算按钮选中态与下拉标题。 */
  revision: number
  /** 内容更新 / 选中变化计数器，用来同步字号输入框。 */
  fontSizeRevision: number
  floating: boolean
  floatingStyle: Record<string, string> | undefined
  /** 工具栏只在聚焦时显示：按下按钮要阻止默认行为，否则按钮会在 click 生效前就被隐藏。 */
  guardPointerDown: boolean
  promptValue: (message: string, title: string, defaultValue?: string) => Promise<string | null>
  insertImage: (src: string, alt?: string) => void
  insertVideo: (src: string, title?: string) => void
  insertAttachment: (href: string, label?: string) => void
  clearFormatting: () => void
}>()

const emit = defineEmits<{
  notify: [message: string, type?: NotifyType]
}>()

const toolbarRef = ref<HTMLElement | null>(null)

const {
  openDropdown,
  fontSizeInput,
  closeToolbarDropdown,
  toggleToolbarDropdown,
  runToolbarAction,
  isToolbarActive,
  currentHeadingValue,
  currentHeadingLabel,
  applyHeadingOption,
  isCodeBlockActive,
  currentCodeLanguageValue,
  currentCodeLanguageLabel,
  applyCodeLanguageOption,
  syncFontSizeInput,
  applyFontSize,
  toggleLink,
  runHistoryAction,
  canRunHistoryAction,
} = useRichTextEditorToolbar({
  editor: toRef(props, 'editor'),
  revision: toRef(props, 'revision'),
  promptValue: (message, title, defaultValue) => props.promptValue(message, title, defaultValue),
  notify: (message, type) => emit('notify', message, type),
  clearFormatting: () => props.clearFormatting(),
})

const { runInsertAction } = useRichEditorMediaInsert({
  promptValue: (message, title, defaultValue) => props.promptValue(message, title, defaultValue),
  notify: (message, type) => emit('notify', message, type),
  insertImage: (src, alt) => props.insertImage(src, alt),
  insertVideo: (src, title) => props.insertVideo(src, title),
  insertAttachment: (href, label) => props.insertAttachment(href, label),
  closeDropdown: closeToolbarDropdown,
})

watch(
  () => props.fontSizeRevision,
  () => syncFontSizeInput(),
)

// 阻止工具栏按钮抢走编辑器焦点：否则按钮会在 mousedown 后、click 生效前
// 就因编辑器失焦而被隐藏，导致点击不生效。
function handleToolbarPointerDown(event: MouseEvent) {
  if (!props.guardPointerDown) {
    return
  }
  const target = event.target
  // 字号输入框等可编辑控件需要正常获取焦点，不阻止默认行为。
  if (
    target instanceof HTMLElement &&
    target.closest('input, textarea, [contenteditable="true"]')
  ) {
    return
  }
  event.preventDefault()
}

defineExpose({
  /** 工具栏根元素（吸顶悬浮要量高度）。 */
  getToolbarElement: () => toolbarRef.value,
  /** 外层在编辑器失焦 / 点击外部 / Esc 时收起下拉。 */
  closeDropdown: closeToolbarDropdown,
})
</script>

<template>
  <div
    ref="toolbarRef"
    class="rich-text-editor__toolbar"
    :class="{ 'is-floating': props.floating }"
    :style="props.floatingStyle"
    aria-label="编辑器工具栏"
    @mousedown="handleToolbarPointerDown"
  >
    <div class="rich-text-editor__dropdown">
      <button
        class="rich-text-editor__dropdown-trigger"
        :class="{ 'is-open': openDropdown === 'heading' }"
        type="button"
        title="标题级别"
        aria-haspopup="menu"
        :aria-expanded="openDropdown === 'heading'"
        @click="toggleToolbarDropdown('heading')"
        @keydown.down.prevent="openDropdown = 'heading'"
        @keydown.escape.stop.prevent="closeToolbarDropdown"
      >
        <span>{{ currentHeadingLabel() }}</span>
        <TIcon class="rich-text-editor__dropdown-caret" aria-hidden="true">
          <ArrowDown />
        </TIcon>
      </button>
      <div v-if="openDropdown === 'heading'" class="rich-text-editor__dropdown-menu" role="menu">
        <button
          v-for="item in headingOptions"
          :key="item.label"
          class="rich-text-editor__dropdown-option"
          :class="{ 'is-active': currentHeadingValue() === item.value }"
          type="button"
          role="menuitemradio"
          :aria-checked="currentHeadingValue() === item.value"
          @click="applyHeadingOption(item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <label class="rich-text-editor__font-size" title="字体大小（px）">
      <input
        v-model="fontSizeInput"
        class="rich-text-editor__font-size-input"
        type="number"
        :min="fontSizeMin"
        :max="fontSizeMax"
        step="1"
        placeholder="字号"
        aria-label="字体大小"
        @change="applyFontSize()"
        @keydown.enter.prevent="applyFontSize()"
      />
      <span>px</span>
    </label>

    <button
      v-for="item in toolbarActions"
      :key="item.action"
      class="rich-text-editor__tool"
      :class="[
        `rich-text-editor__tool--${item.action}`,
        { 'is-active': isToolbarActive(item.action) },
      ]"
      type="button"
      :title="item.title"
      :aria-label="item.title"
      @click="runToolbarAction(item.action)"
    >
      {{ item.label }}
    </button>

    <div
      v-if="isCodeBlockActive()"
      class="rich-text-editor__dropdown rich-text-editor__dropdown--code-language"
    >
      <button
        class="rich-text-editor__dropdown-trigger rich-text-editor__dropdown-trigger--code-language"
        :class="{ 'is-open': openDropdown === 'codeLanguage' }"
        type="button"
        title="代码语言"
        aria-haspopup="menu"
        :aria-expanded="openDropdown === 'codeLanguage'"
        @click="toggleToolbarDropdown('codeLanguage')"
        @keydown.down.prevent="openDropdown = 'codeLanguage'"
        @keydown.escape.stop.prevent="closeToolbarDropdown"
      >
        <span>{{ currentCodeLanguageLabel() }}</span>
        <TIcon class="rich-text-editor__dropdown-caret" aria-hidden="true">
          <ArrowDown />
        </TIcon>
      </button>
      <div
        v-if="openDropdown === 'codeLanguage'"
        class="rich-text-editor__dropdown-menu rich-text-editor__dropdown-menu--code-language"
        role="menu"
      >
        <button
          v-for="item in codeLanguageOptions"
          :key="item.label"
          class="rich-text-editor__dropdown-option"
          :class="{ 'is-active': currentCodeLanguageValue() === item.value }"
          type="button"
          role="menuitemradio"
          :aria-checked="currentCodeLanguageValue() === item.value"
          @click="applyCodeLanguageOption(item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <button
      class="rich-text-editor__tool"
      :class="{ 'is-active': props.editor?.isActive('link') }"
      type="button"
      title="插入链接"
      aria-label="插入链接"
      @click="toggleLink"
    >
      <TIcon aria-hidden="true">
        <LinkIcon />
      </TIcon>
      <span class="rich-text-editor__tool-text">链接</span>
    </button>

    <div class="rich-text-editor__dropdown">
      <button
        class="rich-text-editor__dropdown-trigger"
        :class="{ 'is-open': openDropdown === 'insert' }"
        type="button"
        title="插入内容"
        aria-haspopup="menu"
        :aria-expanded="openDropdown === 'insert'"
        @click="toggleToolbarDropdown('insert')"
        @keydown.down.prevent="openDropdown = 'insert'"
        @keydown.escape.stop.prevent="closeToolbarDropdown"
      >
        <span>插入</span>
        <TIcon class="rich-text-editor__dropdown-caret" aria-hidden="true">
          <ArrowDown />
        </TIcon>
      </button>
      <div v-if="openDropdown === 'insert'" class="rich-text-editor__dropdown-menu" role="menu">
        <button
          v-for="item in insertOptions"
          :key="item.action"
          class="rich-text-editor__dropdown-option"
          type="button"
          role="menuitem"
          @click="runInsertAction(item.action)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
    <button
      class="rich-text-editor__tool"
      type="button"
      title="撤销"
      aria-label="撤销"
      :disabled="!canRunHistoryAction('undo')"
      @click="runHistoryAction('undo')"
    >
      <TIcon aria-hidden="true">
        <RefreshLeft />
      </TIcon>
    </button>
    <button
      class="rich-text-editor__tool"
      type="button"
      title="重做"
      aria-label="重做"
      :disabled="!canRunHistoryAction('redo')"
      @click="runHistoryAction('redo')"
    >
      <TIcon aria-hidden="true">
        <RefreshRight />
      </TIcon>
    </button>

    <button
      class="rich-text-editor__tool rich-text-editor__tool--clear"
      type="button"
      title="清除格式"
      aria-label="清除格式"
      @click="props.clearFormatting()"
    >
      <TIcon aria-hidden="true">
        <Brush />
      </TIcon>
      <span class="rich-text-editor__tool-text">清除</span>
    </button>
  </div>
</template>

<style scoped src="./rich-text-toolbar.css"></style>
