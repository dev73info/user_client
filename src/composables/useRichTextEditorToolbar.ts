import { ref, type Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { isRichEditorLinkUrl, normalizeRichEditorUrl } from '@/utils/richEditorMedia'
import {
  codeLanguageOptions,
  detectCodeBlockLanguage,
  normalizeCodeBlockLanguage,
} from '@/utils/richEditorCodeLanguage'
import {
  fontSizeMax,
  fontSizeMin,
  headingLevels,
  normalizeFontSizeValue,
  type HeadingOptionValue,
} from '@/utils/richEditorTypography'
import type { NotifyType, ToolbarAction, ToolbarDropdown } from '@/utils/richEditorToolbarOptions'

/**
 * 富文本编辑器工具栏的状态与命令：标题级别、字号、加粗 / 列表 / 引用 / 代码块、
 * 代码块语言、链接、撤销重做、清除格式。
 *
 * 从 `RichTextEditor.vue` 整块搬出来，判断口径与命令顺序原样保留。编辑器实例由调用方传入；
 * 清除格式走回调，因为它同时也是编辑器对外暴露的能力（`defineExpose` 上的
 * `clearFormatting`），不能只存在于工具栏里。「插入」下拉的三条流程在
 * `useRichEditorMediaInsert`。
 *
 * `revision` 是「让读编辑器状态的函数跟着变」的触发器：这些函数在渲染期被模板调用，
 * 读一次 `revision.value` 就把重算挂到了编辑器的选中 / 事务变化上（原来在组件里也是这个写法）。
 */
export function useRichTextEditorToolbar(options: {
  editor: Ref<Editor | undefined>
  revision: Ref<number>
  promptValue: (message: string, title: string, defaultValue?: string) => Promise<string | null>
  notify: (message: string, type?: NotifyType) => void
  clearFormatting: () => void
}) {
  const { editor, revision, promptValue, notify } = options

  const openDropdown = ref<ToolbarDropdown | null>(null)
  const fontSizeInput = ref('')

  function closeToolbarDropdown() {
    openDropdown.value = null
  }

  function toggleToolbarDropdown(dropdown: ToolbarDropdown) {
    openDropdown.value = openDropdown.value === dropdown ? null : dropdown
  }

  function runToolbarAction(action: ToolbarAction) {
    if (!editor.value) {
      return
    }

    const chain = editor.value.chain().focus()
    switch (action) {
      case 'bold':
        chain.toggleBold().run()
        return
      case 'italic':
        chain.toggleItalic().run()
        return
      case 'underline':
        chain.toggleUnderline().run()
        return
      case 'bullet':
        chain.toggleBulletList().run()
        return
      case 'ordered':
        chain.toggleOrderedList().run()
        return
      case 'blockquote':
        chain.toggleBlockquote().run()
        return
      case 'code':
        if (editor.value.isActive('codeBlock')) {
          chain.setParagraph().run()
          return
        }

        chain.toggleCodeBlock().run()
        return
    }
  }

  function isToolbarActive(action: ToolbarAction): boolean {
    revision.value
    if (!editor.value) {
      return false
    }

    switch (action) {
      case 'bold':
        return editor.value.isActive('bold')
      case 'italic':
        return editor.value.isActive('italic')
      case 'underline':
        return editor.value.isActive('underline')
      case 'bullet':
        return editor.value.isActive('bulletList')
      case 'ordered':
        return editor.value.isActive('orderedList')
      case 'blockquote':
        return editor.value.isActive('blockquote')
      case 'code':
        return editor.value.isActive('codeBlock')
    }
  }

  function currentHeadingValue(): HeadingOptionValue {
    revision.value
    const level = headingLevels.find((item) => editor.value?.isActive('heading', { level: item }))
    return level || ''
  }

  function currentHeadingLabel(): string {
    const value = currentHeadingValue()
    return value ? `H${value}` : '正文'
  }

  function applyHeadingOption(value: HeadingOptionValue) {
    if (!editor.value) {
      return
    }

    const chain = editor.value.chain().focus()
    if (value) {
      chain.setHeading({ level: value }).run()
      closeToolbarDropdown()
      return
    }

    chain.setParagraph().run()
    closeToolbarDropdown()
  }

  function isCodeBlockActive(): boolean {
    revision.value
    return Boolean(editor.value?.isActive('codeBlock'))
  }

  function detectActiveCodeBlockLanguage(): string | null {
    const state = editor.value?.state
    if (!state) {
      return null
    }
    const parent = state.selection.$head.parent
    const node = parent.type.name === 'codeBlock' ? parent : null
    if (!node) {
      return null
    }
    return detectCodeBlockLanguage(node.textContent || '')
  }

  function currentCodeLanguageValue(): string {
    revision.value
    if (!editor.value?.isActive('codeBlock')) {
      return ''
    }

    const explicit = normalizeCodeBlockLanguage(editor.value.getAttributes('codeBlock').language)
    if (explicit) {
      return explicit
    }

    return detectActiveCodeBlockLanguage() ?? ''
  }

  function currentCodeLanguageLabel(): string {
    if (!isCodeBlockActive()) {
      return '语言'
    }

    const value = currentCodeLanguageValue()
    const option = codeLanguageOptions.find((item) => item.value === value)
    return option?.label || value.toUpperCase() || '纯文本'
  }

  function applyCodeLanguageOption(value: string) {
    if (!editor.value) {
      return
    }

    const language = normalizeCodeBlockLanguage(value)
    editor.value.chain().focus().setCodeBlock({ language }).run()
    closeToolbarDropdown()
  }

  function syncFontSizeInput() {
    const size = normalizeFontSizeValue(editor.value?.getAttributes('fontSize').size)
    fontSizeInput.value = size ? String(size) : ''
  }

  function applyFontSize(value = fontSizeInput.value) {
    if (!editor.value) {
      return
    }

    if (!String(value).trim()) {
      editor.value.chain().focus().unsetMark('fontSize').run()
      fontSizeInput.value = ''
      return
    }

    const size = normalizeFontSizeValue(value)
    if (!size) {
      notify('请输入有效的字号', 'warning')
      return
    }

    editor.value.chain().focus().setMark('fontSize', { size }).run()
    fontSizeInput.value = String(size)
  }

  async function toggleLink() {
    if (!editor.value) {
      return
    }

    const currentHref = editor.value.getAttributes('link').href ?? ''
    const raw = await promptValue('输入跳转链接，留空将移除链接', '插入链接', currentHref)
    if (raw === null) {
      return
    }

    const href = normalizeRichEditorUrl(raw)
    if (!href) {
      editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    if (!isRichEditorLinkUrl(href)) {
      notify('请输入有效的链接地址', 'warning')
      return
    }

    editor.value.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }

  function runHistoryAction(action: 'undo' | 'redo') {
    if (!editor.value) {
      return
    }

    if (action === 'undo') {
      editor.value.chain().focus().undo().run()
      return
    }

    editor.value.chain().focus().redo().run()
  }

  function canRunHistoryAction(action: 'undo' | 'redo'): boolean {
    revision.value
    if (!editor.value) {
      return false
    }

    if (action === 'undo') {
      return editor.value.can().chain().focus().undo().run()
    }

    return editor.value.can().chain().focus().redo().run()
  }

  const fontSizeBounds = { min: fontSizeMin, max: fontSizeMax }

  return {
    openDropdown,
    fontSizeInput,
    fontSizeBounds,
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
    clearFormatting: options.clearFormatting,
  }
}
