import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { Mark, mergeAttributes, useEditor, type Editor } from '@tiptap/vue-3'
import Link from '@tiptap/extension-link'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableRow } from '@tiptap/extension-table-row'
import Underline from '@tiptap/extension-underline'
import { renderMarkdownToRichHtml } from '@/utils/sanitizeHtml'
import { RichEditorAttachment, RichEditorImage, RichEditorVideo } from '@/utils/richEditorMedia'
import {
  codeHighlighter,
  detectHighlightLanguage,
  isMarkdownCodeBlockLanguage,
  looksLikeMarkdown,
  parseMarkdownCodeFence,
} from '@/utils/richEditorCodeLanguage'
import { headingLevels, normalizeFontSizeValue } from '@/utils/richEditorTypography'

/**
 * 富文本编辑器 tiptap 侧的装配：扩展清单、`FontSize` 自定义 mark、以及 `editorProps`。
 *
 * 从 `RichTextEditor.vue` 里整块搬出来，内容原样保留——只把原来直接闭包编辑器实例的地方
 * 改成由调用方传进来的 `getEditor()`，因为编辑器实例的创建（`useEditor`）仍在组件里，
 * 而 `handlePaste` 需要在粘贴时才取它（创建期还拿不到）。
 */

/** 字号 mark：把 `font-size` 存成 `size` 属性，渲染成带内联样式的 `<span>`。 */
const FontSize = Mark.create({
  name: 'fontSize',

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element: HTMLElement) => normalizeFontSizeValue(element.style.fontSize),
        renderHTML: (attributes) => {
          const size = normalizeFontSizeValue(attributes.size)
          return size ? { style: `font-size: ${size}px` } : {}
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        style: 'font-size',
        getAttrs: (value) => {
          const size = normalizeFontSizeValue(value)
          return size ? { size } : false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

export function createRichTextEditorExtensions() {
  return [
    StarterKit.configure({
      heading: {
        levels: headingLevels,
      },
      codeBlock: false,
      link: false,
      underline: false,
    }),
    CodeBlockLowlight.extend({
      name: 'codeBlock',
      defining: false,
      renderHTML({ node, HTMLAttributes }) {
        let language = node.attrs.language || null
        if (!language) {
          const detected = detectHighlightLanguage(node.textContent || '')
          if (detected) {
            language = detected
          }
        }
        return [
          'pre',
          mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
          ['code', { class: language ? `language-${language}` : null }, 0],
        ]
      },
    }).configure({
      lowlight: codeHighlighter,
      defaultLanguage: null,
      enableTabIndentation: true,
      tabSize: 4,
      HTMLAttributes: {
        class: 'code-block',
      },
    }),
    Underline,
    FontSize,
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
    }),
    RichEditorImage,
    RichEditorVideo,
    RichEditorAttachment,
    Table.configure({
      resizable: false,
    }),
    TableRow,
    TableCell,
    TableHeader,
  ]
}

/**
 * 交互回调：点进代码块时把光标落进去、粘贴 Markdown 时按 Markdown 渲染。
 *
 * `getEditor` 而不是直接传实例，是因为这些回调挂在 `useEditor` 的入参上，
 * 创建期实例还不存在，只能在回调真正触发时再取。
 */
/** `useEditor` 入参里 `editorProps` 的类型：`EditorProps` 本身从 `@tiptap/pm/view` 走，
 *  没有从 `@tiptap/vue-3` 再导出，只能顺着 `useEditor` 的签名取。 */
type UseEditorOptions = NonNullable<Parameters<typeof useEditor>[0]>

export function createRichTextEditorProps(
  getEditor: () => Editor | undefined,
): UseEditorOptions['editorProps'] {
  return {
    attributes: {
      class: 'rich-text-editor__surface rich-text-body',
    },
    handleClickOn: (view, pos, node, nodePos, event, direct) => {
      if (node.type.name === 'codeBlock' && direct) {
        const $pos = view.state.doc.resolve(pos)
        if ($pos.parent.type.name === 'codeBlock') {
          const tr = view.state.tr.setSelection(
            (view.state.selection.constructor as any).near($pos),
          )
          view.dispatch(tr)
          view.focus()
          return true
        }
      }
      return false
    },
    handleClick: (view, pos) => {
      const $pos = view.state.doc.resolve(pos)
      if ($pos.parent.type.name === 'codeBlock') {
        const tr = view.state.tr.setSelection((view.state.selection.constructor as any).near($pos))
        view.dispatch(tr)
        view.focus()
        return true
      }
      return false
    },
    handlePaste: (view, event) => {
      if (!event.clipboardData || getEditor()?.isActive('codeBlock')) {
        return false
      }

      const plainText = event.clipboardData.getData('text/plain')
      const fencedCodeBlock = parseMarkdownCodeFence(plainText)
      if (fencedCodeBlock) {
        if (isMarkdownCodeBlockLanguage(fencedCodeBlock.language)) {
          const renderedMarkdown = renderMarkdownToRichHtml(fencedCodeBlock.code)
          if (!renderedMarkdown) {
            return false
          }

          event.preventDefault()
          getEditor()?.commands.insertContent(renderedMarkdown)
          return true
        }

        const codeBlock = view.state.schema.nodes.codeBlock
        if (!codeBlock) {
          return false
        }

        event.preventDefault()
        const codeNode = fencedCodeBlock.code
          ? view.state.schema.text(fencedCodeBlock.code)
          : undefined
        const transaction = view.state.tr
          .replaceSelectionWith(codeBlock.create({ language: fencedCodeBlock.language }, codeNode))
          .scrollIntoView()
        view.dispatch(transaction)

        return true
      }

      if (plainText && looksLikeMarkdown(plainText)) {
        const renderedMarkdown = renderMarkdownToRichHtml(plainText)
        if (renderedMarkdown) {
          event.preventDefault()
          getEditor()?.commands.insertContent(renderedMarkdown)
          return true
        }
      }

      return false
    },
  }
}
