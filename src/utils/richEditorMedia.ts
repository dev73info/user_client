import { mergeAttributes, Node, type Editor } from '@tiptap/vue-3'

export const RichEditorImage = Node.create({
  name: 'richEditorImage',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      title: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes({ class: 'rich-editor-media rich-editor-image', alt: '' }, HTMLAttributes),
    ]
  },
})

export const RichEditorVideo = Node.create({
  name: 'richEditorVideo',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      title: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'video[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      mergeAttributes(
        { class: 'rich-editor-media rich-editor-video', controls: '', preload: 'metadata' },
        HTMLAttributes,
      ),
    ]
  },
})

export const RichEditorAttachment = Node.create({
  name: 'richEditorAttachment',
  priority: 1000,
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      href: {
        default: '',
        parseHTML: (element) => element.getAttribute('href') ?? '',
      },
      label: {
        default: '附件',
        parseHTML: (element) => element.textContent?.trim() || element.getAttribute('title') || '附件',
        renderHTML: () => ({}),
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('title') ?? '',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a.rich-editor-attachment[href]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const href = String(node.attrs.href || '')
    const label = String(node.attrs.label || node.attrs.title || href || '附件')

    return [
      'a',
      mergeAttributes(
        {
          class: 'rich-editor-attachment',
          href,
          rel: 'noopener noreferrer',
          target: '_blank',
          title: label,
        },
        HTMLAttributes,
      ),
      label,
    ]
  },
})

export function normalizeRichEditorUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (/^(https?:|mailto:|tel:|\/(?!\/)|#)/i.test(trimmed)) {
    return trimmed
  }

  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(trimmed)) {
    return `https://${trimmed}`
  }

  return trimmed
}

export function isRichEditorLinkUrl(value: string): boolean {
  return /^(https?:|mailto:|tel:|\/(?!\/)|#)/i.test(value)
}

export function isRichEditorMediaUrl(value: string): boolean {
  return /^(https?:|\/(?!\/))/i.test(value)
}

export function richEditorDefaultLabel(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return fallback
  }

  try {
    const url = new URL(trimmed, window.location.origin)
    const segment = url.pathname.split('/').filter(Boolean).at(-1)
    return segment ? decodeURIComponent(segment) : fallback
  } catch {
    return fallback
  }
}

export function hasMeaningfulRichEditorContent(editor: Pick<Editor, 'getHTML' | 'getText'>) {
  const text = editor.getText().trim()
  if (text) {
    return true
  }

  const html = editor.getHTML()
  return /<(img|video)\b/i.test(html) || /class=(['"])[^'"]*rich-editor-attachment/i.test(html)
}

export function insertRichEditorImage(editor: Editor, src: string, alt: string) {
  editor
    .chain()
    .focus()
    .insertContent([{ type: 'richEditorImage', attrs: { src, alt } }, { type: 'paragraph' }])
    .run()
}

export function insertRichEditorVideo(editor: Editor, src: string, title: string) {
  editor
    .chain()
    .focus()
    .insertContent([{ type: 'richEditorVideo', attrs: { src, title } }, { type: 'paragraph' }])
    .run()
}

export function insertRichEditorAttachment(editor: Editor, href: string, label: string) {
  editor
    .chain()
    .focus()
    .insertContent([
      { type: 'richEditorAttachment', attrs: { href, label, title: label } },
      { type: 'paragraph' },
    ])
    .run()
}

export function insertRichEditorEmoji(editor: Editor, emoji: string) {
  editor.chain().focus().insertContent(emoji).run()
}