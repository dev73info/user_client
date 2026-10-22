<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorContent, useEditor, type Editor } from '@tiptap/vue-3'
import RichTextEditorPromptDialog from '@/components/rich-text/RichTextEditorPromptDialog.vue'
import RichTextEditorToolbar from '@/components/rich-text/RichTextEditorToolbar.vue'
import { useCodeBlockCopy } from '@/composables/useCodeBlockCopy'
import {
  normalizeCssPixelValue,
  useRichEditorFloatingToolbar,
} from '@/composables/useRichEditorFloatingToolbar'
import { useRichEditorPrompt } from '@/composables/useRichEditorPrompt'
import { markdownTextSerializers } from '@/utils/richEditorCodeLanguage'
import {
  hasMeaningfulRichEditorContent,
  insertRichEditorAttachment,
  insertRichEditorImage,
  insertRichEditorVideo,
  richEditorDefaultLabel,
} from '@/utils/richEditorMedia'
import type { NotifyType } from '@/utils/richEditorToolbarOptions'
import { sanitizeRichHtmlForEditing } from '@/utils/sanitizeHtml'
import {
  createRichTextEditorExtensions,
  createRichTextEditorProps,
} from '@/utils/richTextEditorExtensions'

/**
 * 富文本编辑器（tiptap + tiptap 原生工具栏）。
 *
 * 这一层只保留「编辑器本体」：`useEditor` 的装配、modelValue 的双向同步、对外暴露的
 * 取值 / 写入接口、以及吸顶悬浮工具栏与下拉的关闭时机。其余按职责分在六处：
 *
 * - 工具栏模板与它的样式：`components/rich-text/RichTextEditorToolbar.vue` + `rich-text-toolbar.css`
 * - 工具栏状态与命令：`composables/useRichTextEditorToolbar.ts`
 * - 吸顶悬浮：`composables/useRichEditorFloatingToolbar.ts`
 * - 单行输入弹窗：`components/rich-text/RichTextEditorPromptDialog.vue` + `composables/useRichEditorPrompt.ts`
 * - tiptap 扩展与交互回调：`utils/richTextEditorExtensions.ts`
 * - 代码语言 / Markdown / 字号档位：`utils/richEditorCodeLanguage.ts`、`utils/richEditorTypography.ts`
 */

const props = withDefaults(
  defineProps<{
    modelValue: string
    floatingToolbar?: boolean
    floatingToolbarTop?: number | string
    minHeight?: string
    maxHeight?: string
    autoHeight?: boolean
    toolbarOnFocus?: boolean
  }>(),
  {
    floatingToolbar: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  notify: [message: string, type?: NotifyType]
}>()

const editorRootRef = ref<HTMLElement | null>(null)
const toolbarComponentRef = ref<InstanceType<typeof RichTextEditorToolbar> | null>(null)
// 编辑器选中 / 事务变化计数：工具栏按它重算按钮选中态与下拉标题。
const editorRevision = ref(0)
// 内容更新 / 选中变化计数：工具栏按它把光标处字号同步回输入框。
const fontSizeRevision = ref(0)
let pushingEditorUpdate = false

const floatingToolbarEnabled = computed(() => props.floatingToolbar !== false)
const floatingToolbarTop = computed(() => normalizeCssPixelValue(props.floatingToolbarTop))

// 默认最小高度：固定起点，适合长文档编辑。
const DEFAULT_MIN_HEIGHT = 'clamp(280px, 38vh, 420px)'
// 自动高度模式下的最小高度：正好容纳一行正文。
// 1.75em 对应 surface 的 line-height，32px 对应其上下各 16px 的内边距，
// 因此空内容时高度即为一行，不留多余空白。
const AUTO_HEIGHT_MIN_HEIGHT = 'calc(1.75em + 32px)'

const autoHeightEnabled = computed(() => props.autoHeight === true)

// 工具栏按需显示：仅在编辑器获得焦点时出现，减少空置时的视觉干扰。
const toolbarOnFocusEnabled = computed(() => props.toolbarOnFocus === true)
const toolbarVisible = ref(false)

// 显式传入 minHeight 时优先使用，否则按是否开启自动高度选择默认值。
const resolvedMinHeight = computed(
  () => props.minHeight || (autoHeightEnabled.value ? AUTO_HEIGHT_MIN_HEIGHT : DEFAULT_MIN_HEIGHT),
)

const editorStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {
    '--rich-text-editor-min-height': resolvedMinHeight.value,
  }
  if (props.maxHeight) {
    style['--rich-text-editor-max-height'] = props.maxHeight
  }
  if (floatingToolbarTop.value !== null) {
    style['--rich-text-editor-toolbar-top'] = `${floatingToolbarTop.value}px`
  }
  return style
})

const {
  floating: toolbarFloating,
  floatingStyle: toolbarFloatingStyle,
  shellStyle: toolbarShellStyle,
} = useRichEditorFloatingToolbar({
  rootRef: editorRootRef,
  getToolbarElement: () => toolbarComponentRef.value?.getToolbarElement() ?? null,
  toolbarTop: floatingToolbarTop,
  enabled: floatingToolbarEnabled,
})

const { promptOpen, promptTitle, promptMessage, promptInput, promptValue, settlePrompt } =
  useRichEditorPrompt()

useCodeBlockCopy({
  rootRef: editorRootRef,
  notify: (message, type) => emit('notify', message, type),
})

const editor = useEditor({
  content: props.modelValue || '<p></p>',
  extensions: createRichTextEditorExtensions(),
  editorProps: createRichTextEditorProps(() => editor.value),
  onUpdate: ({ editor: currentEditor }) => {
    const nextValue = hasMeaningfulRichEditorContent(currentEditor)
      ? sanitizeRichHtmlForEditing(currentEditor.getHTML())
      : ''
    pushingEditorUpdate = true
    emit('update:modelValue', nextValue)
    void nextTick(() => {
      pushingEditorUpdate = false
    })
    fontSizeRevision.value += 1
  },
  onSelectionUpdate: () => {
    fontSizeRevision.value += 1
    editorRevision.value += 1
  },
  onTransaction: () => {
    editorRevision.value += 1
  },
})

watch(
  () => props.modelValue,
  (value) => {
    if (pushingEditorUpdate) {
      return
    }
    setContent(value, false)
  },
)

// editor 在组件 onMounted 后才由 tiptap 的 useEditor 创建。
// 若打开弹窗时（如发布草稿恢复）modelValue 的更新先于 editor 就绪，
// 上面的 watch 会因 editor 尚未创建而静默丢弃内容，导致富文本恢复为空。
// 因此在 editor 就绪后把当前的 modelValue 同步一次，确保内容不丢失。
watch(editor, (editorInstance) => {
  if (editorInstance && props.modelValue) {
    editorInstance.commands.setContent(props.modelValue, { emitUpdate: false })
  }
})

function handleRootFocusIn() {
  if (toolbarOnFocusEnabled.value) {
    toolbarVisible.value = true
  }
}

function handleRootFocusOut(event: FocusEvent) {
  if (!toolbarOnFocusEnabled.value) {
    return
  }
  const nextTarget = event.relatedTarget
  // 焦点仍在编辑器内部（如字号输入框）时保持工具栏可见。
  if (nextTarget instanceof Node && editorRootRef.value?.contains(nextTarget)) {
    return
  }
  toolbarVisible.value = false
  toolbarComponentRef.value?.closeDropdown()
}

function handleDocumentPointerDown(event: PointerEvent) {
  const root = editorRootRef.value
  if (root && event.target instanceof Node && root.contains(event.target)) {
    return
  }

  toolbarComponentRef.value?.closeDropdown()
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    toolbarComponentRef.value?.closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
  editor.value?.destroy()
})

function setContent(value: string, emitUpdate = false) {
  editor.value?.commands.setContent(value || '<p></p>', { emitUpdate })
  fontSizeRevision.value += 1
}

function getHTML(): string {
  return editor.value?.getHTML() || ''
}

function getText(options?: Parameters<Editor['getText']>[0]): string {
  return editor.value?.getText(options) || ''
}

function getMarkdown(): string {
  return (
    editor.value?.getText({
      blockSeparator: '\n\n',
      textSerializers: markdownTextSerializers,
    }) || ''
  )
}

function focus() {
  editor.value?.chain().focus().run()
}

function insertImage(src: string, alt = '') {
  if (editor.value) {
    insertRichEditorImage(editor.value, src, alt)
  }
}

function insertVideo(src: string, title = '') {
  if (editor.value) {
    insertRichEditorVideo(editor.value, src, title)
  }
}

function insertAttachment(href: string, label = '') {
  if (editor.value) {
    insertRichEditorAttachment(editor.value, href, label || richEditorDefaultLabel(href, '附件'))
  }
}

function clearFormatting() {
  editor.value?.chain().focus().unsetAllMarks().clearNodes().run()
}

defineExpose({
  clearFormatting,
  focus,
  getHTML,
  getMarkdown,
  getText,
  insertAttachment,
  insertImage,
  insertVideo,
  setContent,
})
</script>

<template>
  <div
    ref="editorRootRef"
    class="rich-text-editor"
    :class="{
      'rich-text-editor--auto-height': autoHeightEnabled,
      'rich-text-editor--toolbar-on-focus': toolbarOnFocusEnabled,
    }"
    :style="editorStyle"
    @focusin="handleRootFocusIn"
    @focusout="handleRootFocusOut"
  >
    <div
      v-show="!toolbarOnFocusEnabled || toolbarVisible"
      class="rich-text-editor__toolbar-shell"
      :style="toolbarShellStyle"
    >
      <RichTextEditorToolbar
        ref="toolbarComponentRef"
        :editor="editor"
        :revision="editorRevision"
        :font-size-revision="fontSizeRevision"
        :floating="toolbarFloating"
        :floating-style="toolbarFloatingStyle"
        :guard-pointer-down="toolbarOnFocusEnabled"
        :prompt-value="promptValue"
        :insert-image="insertImage"
        :insert-video="insertVideo"
        :insert-attachment="insertAttachment"
        :clear-formatting="clearFormatting"
        @notify="(message, type) => emit('notify', message, type)"
      />
    </div>

    <div class="rich-text-editor__body">
      <EditorContent v-if="editor" :editor="editor" />
    </div>

    <!-- 单行输入弹窗：接替 ElMessageBox.prompt，做法见 useRichEditorPrompt 上方注释 -->
    <RichTextEditorPromptDialog
      v-model="promptInput"
      :open="promptOpen"
      :title="promptTitle"
      :message="promptMessage"
      @settle="settlePrompt"
    />
  </div>
</template>

<style scoped src="./rich-text/rich-text-editor.css"></style>
