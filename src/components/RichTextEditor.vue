<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { EditorContent, Mark, mergeAttributes, useEditor, type Editor } from '@tiptap/vue-3'
import Link from '@tiptap/extension-link'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableRow } from '@tiptap/extension-table-row'
import Underline from '@tiptap/extension-underline'
import { common, createLowlight } from 'lowlight'
import {
    ArrowDown,
    Brush,
    Link as LinkIcon,
    RefreshLeft,
    RefreshRight,
} from '@element-plus/icons-vue'

import { renderMarkdownToRichHtml, sanitizeRichHtml, sanitizeRichHtmlForEditing } from '@/utils/sanitizeHtml'
import {
    hasMeaningfulRichEditorContent,
    insertRichEditorAttachment,
    insertRichEditorImage,
    insertRichEditorVideo,
    isRichEditorLinkUrl,
    isRichEditorMediaUrl,
    normalizeRichEditorUrl,
    RichEditorAttachment,
    richEditorDefaultLabel,
    RichEditorImage,
    RichEditorVideo,
} from '@/utils/richEditorMedia'
import { useCodeBlockCopy } from '@/composables/useCodeBlockCopy'

type ToolbarAction = 'bold' | 'italic' | 'underline' | 'bullet' | 'ordered' | 'blockquote' | 'code'
type InsertAction = 'attachment' | 'image' | 'video'
type HeadingLevel = 1 | 2 | 3 | 4 | 5
type HeadingOptionValue = '' | HeadingLevel
type ToolbarDropdown = 'heading' | 'insert' | 'codeLanguage'
type NotifyType = 'success' | 'warning' | 'error'

const props = withDefaults(
    defineProps<{
        modelValue: string
        floatingToolbar?: boolean
        floatingToolbarTop?: number | string
    }>(),
    {
        floatingToolbar: true,
    },
)

const emit = defineEmits<{
    'update:modelValue': [value: string]
    notify: [message: string, type?: NotifyType]
}>()

const headingLevels: HeadingLevel[] = [1, 2, 3, 4, 5]
const headingOptions: Array<{ label: string; value: HeadingOptionValue }> = [
    { label: '正文', value: '' },
    ...headingLevels.map((level) => ({ label: `H${level}`, value: level })),
]
const fontSizeMin = 12
const fontSizeMax = 48
const markdownCodeBlockLanguage = 'md'
const toolbarActions: Array<{ label: string; action: ToolbarAction; title: string }> = [
    { label: 'B', action: 'bold', title: '加粗' },
    { label: 'I', action: 'italic', title: '斜体' },
    { label: 'U', action: 'underline', title: '下划线' },
    { label: '列表', action: 'bullet', title: '无序列表' },
    { label: '编号', action: 'ordered', title: '有序列表' },
    { label: '引用', action: 'blockquote', title: '引用' },
    { label: '</>', action: 'code', title: '代码块' },
]
const insertOptions: Array<{ label: string; action: InsertAction }> = [
    { label: '附件', action: 'attachment' },
    { label: '图片', action: 'image' },
    { label: '视频', action: 'video' },
]
const codeLanguageOptions: Array<{ label: string; value: string; aliases?: string[] }> = [
    { label: '纯文本', value: '' },
    { label: 'MD', value: markdownCodeBlockLanguage, aliases: ['markdown'] },
    { label: 'JSON', value: 'json' },
    { label: 'Rust', value: 'rust', aliases: ['rs'] },
    { label: 'C++', value: 'cpp', aliases: ['c++', 'cxx', 'cc'] },
    { label: 'C', value: 'c' },
    { label: 'C#', value: 'csharp', aliases: ['c#', 'cs'] },
    { label: 'Java', value: 'java' },
    { label: 'JavaScript', value: 'javascript', aliases: ['js'] },
    { label: 'TypeScript', value: 'typescript', aliases: ['ts'] },
    { label: 'Python', value: 'python', aliases: ['py'] },
    { label: 'Go', value: 'go', aliases: ['golang'] },
    { label: 'SQL', value: 'sql' },
    { label: 'Shell', value: 'shell', aliases: ['bash', 'sh', 'zsh'] },
    { label: 'HTML', value: 'html' },
    { label: 'CSS', value: 'css' },
    { label: 'XML', value: 'xml' },
    { label: 'YAML', value: 'yaml', aliases: ['yml'] },
]
const codeLanguageAliasMap = new Map<string, string>()
codeLanguageOptions.forEach((option) => {
    if (option.value) {
        codeLanguageAliasMap.set(option.value, option.value)
    }
    option.aliases?.forEach((alias) => {
        codeLanguageAliasMap.set(alias, option.value)
    })
})
const codeHighlighter = createLowlight(common)

const fontSizeInput = ref('')
const editorRevision = ref(0)
const editorRootRef = ref<HTMLElement | null>(null)
const toolbarRef = ref<HTMLElement | null>(null)
const toolbarFloating = ref(false)
const toolbarPlaceholderHeight = ref(0)
const toolbarFloatingStyle = ref<Record<string, string>>({})
const openDropdown = ref<ToolbarDropdown | null>(null)
let pushingEditorUpdate = false
let toolbarResizeObserver: ResizeObserver | null = null
let toolbarScrollContainer: HTMLElement | null = null

const floatingToolbarEnabled = computed(() => props.floatingToolbar !== false)

const floatingToolbarTop = computed(() => normalizeCssPixelValue(props.floatingToolbarTop))

const editorStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {
        '--rich-text-editor-min-height': 'clamp(280px, 38vh, 420px)',
    }
    if (floatingToolbarTop.value !== null) {
        style['--rich-text-editor-toolbar-top'] = `${floatingToolbarTop.value}px`
    }
    return style
})

const toolbarShellStyle = computed<Record<string, string> | undefined>(() => {
    const style: Record<string, string> = {}

    if (floatingToolbarEnabled.value) {
        style.position = 'sticky'
        style.top = 'var(--rich-text-editor-toolbar-top)'
    }

    if (!toolbarFloating.value || toolbarPlaceholderHeight.value <= 0) {
        return Object.keys(style).length ? style : undefined
    }

    style.height = `${toolbarPlaceholderHeight.value}px`
    return style
})

useCodeBlockCopy({
    rootRef: editorRootRef,
    notify: (message, type) => emit('notify', message, type),
})

function isScrollableContainer(element: HTMLElement): boolean {
    const style = getComputedStyle(element)
    return /(auto|scroll|overlay)/.test(style.overflowY)
}

function normalizeCssPixelValue(value: number | string | undefined): number | null {
    if (value === undefined || value === '') {
        return null
    }

    const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null
}

function findFloatingScrollContainer(root: HTMLElement): HTMLElement | null {
    let current = root.parentElement
    while (current && current !== document.body) {
        if (isScrollableContainer(current)) {
            return current
        }
        current = current.parentElement
    }

    return null
}

function getFloatingToolbarTop(root: HTMLElement): number {
    if (floatingToolbarTop.value !== null) {
        return floatingToolbarTop.value
    }

    const defaultGap = 12
    const scrollContainer = findFloatingScrollContainer(root)
    if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect()
        if (containerRect.height > 0 && containerRect.bottom > defaultGap) {
            return Math.max(defaultGap, Math.round(containerRect.top + 10))
        }
    }

    const header = document.querySelector<HTMLElement>('.portal-header')
    const headerRect = header?.getBoundingClientRect()
    if (!headerRect || headerRect.height <= 0 || headerRect.bottom <= 0) {
        return defaultGap
    }

    return Math.max(defaultGap, Math.round(headerRect.bottom + 10))
}

function getFloatingToolbarHorizontalStyle(root: HTMLElement): Pick<CSSStyleDeclaration, 'left' | 'width'> {
    const rootRect = root.getBoundingClientRect()
    const viewportGap = 12
    const scrollContainer = findFloatingScrollContainer(root)
    const containerRect = scrollContainer?.getBoundingClientRect()
    const leftLimit = Math.max(viewportGap, Math.round(containerRect?.left ?? viewportGap))
    const rightLimit = Math.min(
        window.innerWidth - viewportGap,
        Math.round(containerRect?.right ?? window.innerWidth - viewportGap),
    )
    const left = Math.max(leftLimit, Math.round(rootRect.left))
    const availableWidth = Math.max(0, rightLimit - left)
    const width = Math.min(Math.round(rootRect.width), availableWidth)

    return {
        left: `${left}px`,
        width: `${width}px`,
    }
}

function resetFloatingToolbar() {
    toolbarPlaceholderHeight.value = 0
    toolbarFloating.value = false
    toolbarFloatingStyle.value = {}
}

function updateFloatingToolbar() {
    const root = editorRootRef.value
    const toolbar = toolbarRef.value
    if (!root || !toolbar || !floatingToolbarEnabled.value) {
        resetFloatingToolbar()
        return
    }

    const rootRect = root.getBoundingClientRect()
    const toolbarHeight = toolbar.offsetHeight
    const top = getFloatingToolbarTop(root)
    const scrollContainer = findFloatingScrollContainer(root)
    const containerBottom = scrollContainer?.getBoundingClientRect().bottom ?? window.innerHeight
    const canFloat =
        rootRect.top < top &&
        rootRect.bottom - toolbarHeight - 16 > top &&
        top + toolbarHeight + 8 < containerBottom

    toolbarPlaceholderHeight.value = toolbarHeight
    toolbarFloating.value = canFloat

    if (!canFloat) {
        toolbarFloatingStyle.value = {}
        return
    }

    toolbarFloatingStyle.value = {
        ...getFloatingToolbarHorizontalStyle(root),
        top: `${top}px`,
    }
}

function bindFloatingScrollContainer() {
    toolbarScrollContainer?.removeEventListener('scroll', updateFloatingToolbar)
    toolbarScrollContainer = editorRootRef.value ? findFloatingScrollContainer(editorRootRef.value) : null
    toolbarScrollContainer?.addEventListener('scroll', updateFloatingToolbar, { passive: true })
}

function closeToolbarDropdown() {
    openDropdown.value = null
}

function toggleToolbarDropdown(dropdown: ToolbarDropdown) {
    openDropdown.value = openDropdown.value === dropdown ? null : dropdown
}

function handleDocumentPointerDown(event: PointerEvent) {
    const root = editorRootRef.value
    if (root && event.target instanceof Node && root.contains(event.target)) {
        return
    }

    closeToolbarDropdown()
}

function handleDocumentKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
        closeToolbarDropdown()
    }
}

function normalizeFontSizeValue(value: unknown): number | null {
    const normalizedValue = String(value ?? '').trim()
    const parsed =
        typeof value === 'number'
            ? value
            : normalizedValue.match(/^(\d+(?:\.\d+)?)(?:px)?$/i)
                ? Number.parseFloat(normalizedValue)
                : Number.NaN
    if (!Number.isFinite(parsed)) {
        return null
    }
    return Math.min(fontSizeMax, Math.max(fontSizeMin, Math.round(parsed)))
}

function normalizeCodeBlockLanguage(value: unknown): string {
    const normalizedValue = String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_+#.-]/g, '')

    if (normalizedValue === 'markdown') {
        return markdownCodeBlockLanguage
    }

    return codeLanguageAliasMap.get(normalizedValue) ?? normalizedValue
}

function getMarkdownFenceForCode(code: string): string {
    const longestBacktickFence = (code.match(/`{3,}/g) ?? []).reduce(
        (maxLength, match) => Math.max(maxLength, match.length),
        2,
    )
    return '`'.repeat(longestBacktickFence + 1)
}

function createMarkdownCodeFence(language: string, code: string): string {
    const normalizedCode = code.replace(/\r\n?/g, '\n')
    const codeBody = normalizedCode.endsWith('\n') ? normalizedCode : `${normalizedCode}\n`
    const fence = getMarkdownFenceForCode(normalizedCode)

    return `${fence}${normalizeCodeBlockLanguage(language)}\n${codeBody}${fence}`
}

function parseMarkdownCodeFence(value: string): { language: string; code: string } | null {
    const normalizedValue = value.replace(/\r\n?/g, '\n').trim()
    const match = normalizedValue.match(/^(`{3,}|~{3,})([A-Za-z0-9_+#.-]*)[^\n]*\n([\s\S]*?)\n\1\s*$/)
    if (!match) {
        return null
    }

    return {
        language: normalizeCodeBlockLanguage(match[2] ?? ''),
        code: match[3] ?? '',
    }
}

const markdownTextSerializers: NonNullable<Parameters<Editor['getText']>[0]>['textSerializers'] = {
    codeBlock: ({ node }) => createMarkdownCodeFence(node.attrs.language, node.textContent),
}

function isMarkdownCodeBlockLanguage(language: string): boolean {
    return ['md', 'markdown'].includes(language)
}

function looksLikeMarkdown(text: string): boolean {
    const lines = text.split('\n')
    let tableSeparatorCount = 0
    for (const line of lines) {
        const trimmed = line.trim()
        if (/^\|[-:| ]+\|$/.test(trimmed)) {
            tableSeparatorCount++
        }
    }
    if (tableSeparatorCount >= 1) {
        return true
    }
    const markdownPatterns = /^#{1,6}\s|^\s*[-*+]\s|^\s*>\s|^\d+\.\s|```|~~~|\*\*[^*]+\*\*|\[.+\]\(.+\)/m
    return markdownPatterns.test(text)
}

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

const editor = useEditor({
    content: props.modelValue || '<p></p>',
    extensions: [
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
    ],
    editorProps: {
        attributes: {
            class: 'rich-text-editor__surface',
        },
        handleClickOn: (view, pos, node, nodePos, event, direct) => {
            if (node.type.name === 'codeBlock' && direct) {
                const $pos = view.state.doc.resolve(pos)
                if ($pos.parent.type.name === 'codeBlock') {
                    const tr = view.state.tr.setSelection(
                        (view.state.selection.constructor as any).near($pos)
                    )
                    view.dispatch(tr)
                    view.focus()
                    return true
                }
            }
            return false
        },
        handleClick: (view, pos, event) => {
            const $pos = view.state.doc.resolve(pos)
            if ($pos.parent.type.name === 'codeBlock') {
                const tr = view.state.tr.setSelection(
                    (view.state.selection.constructor as any).near($pos)
                )
                view.dispatch(tr)
                view.focus()
                return true
            }
            return false
        },
        handlePaste: (view, event) => {
            if (!event.clipboardData || editor.value?.isActive('codeBlock')) {
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
                    editor.value?.commands.insertContent(renderedMarkdown)
                    return true
                }

                const codeBlock = view.state.schema.nodes.codeBlock
                if (!codeBlock) {
                    return false
                }

                event.preventDefault()
                const codeNode = fencedCodeBlock.code ? view.state.schema.text(fencedCodeBlock.code) : undefined
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
                    editor.value?.commands.insertContent(renderedMarkdown)
                    return true
                }
            }

            return false
        },
    },
    onUpdate: ({ editor: currentEditor }) => {
        const nextValue = hasMeaningfulRichEditorContent(currentEditor)
            ? sanitizeRichHtmlForEditing(currentEditor.getHTML())
            : ''
        pushingEditorUpdate = true
        emit('update:modelValue', nextValue)
        void nextTick(() => {
            pushingEditorUpdate = false
        })
        syncFontSizeInput()
    },
    onSelectionUpdate: () => {
        syncFontSizeInput()
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

watch(floatingToolbarEnabled, updateFloatingToolbar)

onMounted(() => {
    void nextTick(() => {
        bindFloatingScrollContainer()
        updateFloatingToolbar()
        if (typeof ResizeObserver !== 'undefined') {
            toolbarResizeObserver = new ResizeObserver(updateFloatingToolbar)
            if (editorRootRef.value) {
                toolbarResizeObserver.observe(editorRootRef.value)
            }
            if (toolbarRef.value) {
                toolbarResizeObserver.observe(toolbarRef.value)
            }
        }
    })

    window.addEventListener('scroll', updateFloatingToolbar, true)
    window.addEventListener('resize', updateFloatingToolbar)
    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
    toolbarResizeObserver?.disconnect()
    toolbarScrollContainer?.removeEventListener('scroll', updateFloatingToolbar)
    window.removeEventListener('scroll', updateFloatingToolbar, true)
    window.removeEventListener('resize', updateFloatingToolbar)
    document.removeEventListener('pointerdown', handleDocumentPointerDown)
    document.removeEventListener('keydown', handleDocumentKeydown)
    editor.value?.destroy()
})

function setContent(value: string, emitUpdate = false) {
    editor.value?.commands.setContent(value || '<p></p>', { emitUpdate })
    syncFontSizeInput()
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
    editorRevision.value
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
    editorRevision.value
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
    editorRevision.value
    return Boolean(editor.value?.isActive('codeBlock'))
}

function currentCodeLanguageValue(): string {
    editorRevision.value
    if (!editor.value?.isActive('codeBlock')) {
        return ''
    }

    return normalizeCodeBlockLanguage(editor.value.getAttributes('codeBlock').language)
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
        emit('notify', '请输入有效的字号', 'warning')
        return
    }

    editor.value.chain().focus().setMark('fontSize', { size }).run()
    fontSizeInput.value = String(size)
}

function toggleLink() {
    if (!editor.value) {
        return
    }

    const currentHref = editor.value.getAttributes('link').href ?? ''
    const raw = window.prompt('输入跳转链接，留空将移除链接', currentHref)
    if (raw === null) {
        return
    }

    const href = normalizeRichEditorUrl(raw)
    if (!href) {
        editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
        return
    }

    if (!isRichEditorLinkUrl(href)) {
        emit('notify', '请输入有效的链接地址', 'warning')
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
    editorRevision.value
    if (!editor.value) {
        return false
    }

    if (action === 'undo') {
        return editor.value.can().chain().focus().undo().run()
    }

    return editor.value.can().chain().focus().redo().run()
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

function promptInsertImage() {
    const raw = window.prompt('输入图片地址，支持 https:// 或 /uploads/...')
    if (raw === null) {
        return
    }

    const src = normalizeRichEditorUrl(raw)
    if (!isRichEditorMediaUrl(src)) {
        emit('notify', '请输入有效的图片地址', 'warning')
        return
    }

    const alt = window.prompt('图片说明（可选）', richEditorDefaultLabel(src, '图片')) ?? ''
    insertImage(src, alt.trim())
}

function promptInsertVideo() {
    const raw = window.prompt('输入视频地址，支持 https:// 或 /uploads/...')
    if (raw === null) {
        return
    }

    const src = normalizeRichEditorUrl(raw)
    if (!isRichEditorMediaUrl(src)) {
        emit('notify', '请输入有效的视频地址', 'warning')
        return
    }

    const title = window.prompt('视频标题（可选）', richEditorDefaultLabel(src, '视频')) ?? ''
    insertVideo(src, title.trim())
}

function promptInsertAttachment() {
    const raw = window.prompt('输入附件地址，支持 https://、mailto:、tel: 或 /uploads/...')
    if (raw === null) {
        return
    }

    const href = normalizeRichEditorUrl(raw)
    if (!isRichEditorLinkUrl(href)) {
        emit('notify', '请输入有效的附件地址', 'warning')
        return
    }

    const label = window.prompt('附件名称', richEditorDefaultLabel(href, '附件')) ?? ''
    insertAttachment(href, label.trim())
}

function runInsertAction(action: InsertAction) {
    closeToolbarDropdown()
    switch (action) {
        case 'attachment':
            promptInsertAttachment()
            return
        case 'image':
            promptInsertImage()
            return
        case 'video':
            promptInsertVideo()
            return
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
    <div ref="editorRootRef" class="rich-text-editor" :style="editorStyle">
        <div class="rich-text-editor__toolbar-shell" :style="toolbarShellStyle">
            <div ref="toolbarRef" class="rich-text-editor__toolbar" :class="{ 'is-floating': toolbarFloating }"
                :style="toolbarFloatingStyle" aria-label="编辑器工具栏">
                <div class="rich-text-editor__dropdown">
                    <button class="rich-text-editor__dropdown-trigger"
                        :class="{ 'is-open': openDropdown === 'heading' }" type="button" title="标题级别"
                        aria-haspopup="menu" :aria-expanded="openDropdown === 'heading'"
                        @click="toggleToolbarDropdown('heading')" @keydown.down.prevent="openDropdown = 'heading'"
                        @keydown.escape.stop.prevent="closeToolbarDropdown">
                        <span>{{ currentHeadingLabel() }}</span>
                        <el-icon class="rich-text-editor__dropdown-caret" aria-hidden="true">
                            <ArrowDown />
                        </el-icon>
                    </button>
                    <div v-if="openDropdown === 'heading'" class="rich-text-editor__dropdown-menu" role="menu">
                        <button v-for="item in headingOptions" :key="item.label"
                            class="rich-text-editor__dropdown-option"
                            :class="{ 'is-active': currentHeadingValue() === item.value }" type="button"
                            role="menuitemradio" :aria-checked="currentHeadingValue() === item.value"
                            @click="applyHeadingOption(item.value)">
                            {{ item.label }}
                        </button>
                    </div>
                </div>

                <label class="rich-text-editor__font-size" title="字体大小（px）">
                    <input v-model="fontSizeInput" class="rich-text-editor__font-size-input" type="number"
                        :min="fontSizeMin" :max="fontSizeMax" step="1" placeholder="字号" aria-label="字体大小"
                        @change="applyFontSize()" @keydown.enter.prevent="applyFontSize()" />
                    <span>px</span>
                </label>

                <button v-for="item in toolbarActions" :key="item.action" class="rich-text-editor__tool" :class="[
                    `rich-text-editor__tool--${item.action}`,
                    { 'is-active': isToolbarActive(item.action) },
                ]" type="button" :title="item.title" :aria-label="item.title" @click="runToolbarAction(item.action)">
                    {{ item.label }}
                </button>

                <div v-if="isCodeBlockActive()"
                    class="rich-text-editor__dropdown rich-text-editor__dropdown--code-language">
                    <button class="rich-text-editor__dropdown-trigger rich-text-editor__dropdown-trigger--code-language"
                        :class="{ 'is-open': openDropdown === 'codeLanguage' }" type="button" title="代码语言"
                        aria-haspopup="menu" :aria-expanded="openDropdown === 'codeLanguage'"
                        @click="toggleToolbarDropdown('codeLanguage')"
                        @keydown.down.prevent="openDropdown = 'codeLanguage'"
                        @keydown.escape.stop.prevent="closeToolbarDropdown">
                        <span>{{ currentCodeLanguageLabel() }}</span>
                        <el-icon class="rich-text-editor__dropdown-caret" aria-hidden="true">
                            <ArrowDown />
                        </el-icon>
                    </button>
                    <div v-if="openDropdown === 'codeLanguage'"
                        class="rich-text-editor__dropdown-menu rich-text-editor__dropdown-menu--code-language"
                        role="menu">
                        <button v-for="item in codeLanguageOptions" :key="item.label"
                            class="rich-text-editor__dropdown-option"
                            :class="{ 'is-active': currentCodeLanguageValue() === item.value }" type="button"
                            role="menuitemradio" :aria-checked="currentCodeLanguageValue() === item.value"
                            @click="applyCodeLanguageOption(item.value)">
                            {{ item.label }}
                        </button>
                    </div>
                </div>

                <button class="rich-text-editor__tool" :class="{ 'is-active': editor?.isActive('link') }" type="button"
                    title="插入链接" aria-label="插入链接" @click="toggleLink">
                    <el-icon aria-hidden="true">
                        <LinkIcon />
                    </el-icon>
                    <span class="rich-text-editor__tool-text">链接</span>
                </button>

                <div class="rich-text-editor__dropdown">
                    <button class="rich-text-editor__dropdown-trigger" :class="{ 'is-open': openDropdown === 'insert' }"
                        type="button" title="插入内容" aria-haspopup="menu" :aria-expanded="openDropdown === 'insert'"
                        @click="toggleToolbarDropdown('insert')" @keydown.down.prevent="openDropdown = 'insert'"
                        @keydown.escape.stop.prevent="closeToolbarDropdown">
                        <span>插入</span>
                        <el-icon class="rich-text-editor__dropdown-caret" aria-hidden="true">
                            <ArrowDown />
                        </el-icon>
                    </button>
                    <div v-if="openDropdown === 'insert'" class="rich-text-editor__dropdown-menu" role="menu">
                        <button v-for="item in insertOptions" :key="item.action"
                            class="rich-text-editor__dropdown-option" type="button" role="menuitem"
                            @click="runInsertAction(item.action)">
                            {{ item.label }}
                        </button>
                    </div>
                </div>
                <button class="rich-text-editor__tool" type="button" title="撤销" aria-label="撤销"
                    :disabled="!canRunHistoryAction('undo')" @click="runHistoryAction('undo')">
                    <el-icon aria-hidden="true">
                        <RefreshLeft />
                    </el-icon>
                </button>
                <button class="rich-text-editor__tool" type="button" title="重做" aria-label="重做"
                    :disabled="!canRunHistoryAction('redo')" @click="runHistoryAction('redo')">
                    <el-icon aria-hidden="true">
                        <RefreshRight />
                    </el-icon>
                </button>

                <button class="rich-text-editor__tool rich-text-editor__tool--clear" type="button" title="清除格式"
                    aria-label="清除格式" @click="clearFormatting">
                    <el-icon aria-hidden="true">
                        <Brush />
                    </el-icon>
                    <span class="rich-text-editor__tool-text">清除</span>
                </button>
            </div>
        </div>

        <div class="rich-text-editor__body">
            <EditorContent v-if="editor" :editor="editor" />
        </div>
    </div>
</template>

<style scoped>
.rich-text-editor {
    --rich-text-editor-toolbar-top: 12px;
    position: relative;
    display: grid;
    gap: 12px;
    min-width: 0;
    color: #1e293b;
}

.rich-text-editor__toolbar-shell {
    position: relative;
    z-index: 8;
}

.rich-text-editor__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 10px;
    border: 1px solid rgba(203, 213, 225, 0.82);
    border-radius: 12px;
    background: rgba(248, 250, 252, 0.9);
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.1);
    backdrop-filter: blur(14px);
}

.rich-text-editor__toolbar.is-floating {
    position: fixed;
    z-index: 45;
    max-width: calc(100vw - 24px);
    margin: 0;
}

.rich-text-editor__dropdown-trigger,
.rich-text-editor__tool {
    min-height: 34px;
    padding: 4px 9px;
    border: 1px solid rgba(203, 213, 225, 0.86);
    border-radius: 8px;
    background: #fff;
    color: #334155;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    line-height: 1;
}

.rich-text-editor__dropdown {
    position: relative;
    flex: 0 0 auto;
}

.rich-text-editor__dropdown-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 88px;
}

.rich-text-editor__dropdown-trigger--code-language {
    min-width: 108px;
}

.rich-text-editor__font-size {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    width: auto;
    min-height: 34px;
    margin-bottom: 0;
    border: 1px solid rgba(203, 213, 225, 0.86);
    border-radius: 8px;
    background: #fff;
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
}

.rich-text-editor__font-size:focus-within,
.rich-text-editor__dropdown-trigger:focus-visible,
.rich-text-editor__tool:focus-visible {
    border-color: #2563eb;
    outline: none;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

.rich-text-editor__dropdown-trigger.is-open {
    border-color: rgba(37, 99, 235, 0.7);
    background: #eff6ff;
    color: #1d4ed8;
}

.rich-text-editor__dropdown-caret {
    font-size: 13px;
    transition: transform 160ms ease;
}

.rich-text-editor__dropdown-trigger.is-open .rich-text-editor__dropdown-caret {
    transform: rotate(180deg);
}

.rich-text-editor__dropdown-menu {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 70;
    display: grid;
    min-width: 132px;
    gap: 3px;
    padding: 6px;
    border: 1px solid rgba(191, 219, 254, 0.9);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.14);
    backdrop-filter: blur(14px);
}

.rich-text-editor__dropdown-menu--code-language {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-width: 232px;
}

.rich-text-editor__dropdown-option {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: #334155;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    text-align: left;
    white-space: nowrap;
    transition:
        background-color 160ms ease,
        color 160ms ease;
}

.rich-text-editor__dropdown-option:hover,
.rich-text-editor__dropdown-option:focus-visible {
    outline: none;
    background: rgba(219, 234, 254, 0.78);
    color: #1d4ed8;
}

.rich-text-editor__dropdown-option.is-active {
    background: #2563eb;
    color: #fff;
}

.rich-text-editor__font-size-input {
    flex: 0 0 64px;
    width: 64px;
    min-height: 32px;
    padding: 0 4px 0 9px;
    border: 0;
    background: transparent;
    color: #334155;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    outline: none;
}

.rich-text-editor__font-size-input::placeholder {
    color: #94a3b8;
}

.rich-text-editor__font-size span {
    padding-right: 8px;
}

.rich-text-editor__tool {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 6px;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
    transition:
        border-color 160ms ease,
        background-color 160ms ease,
        color 160ms ease,
        box-shadow 160ms ease,
        transform 160ms ease,
        opacity 160ms ease;
}

.rich-text-editor__tool:hover:not(:disabled) {
    border-color: rgba(37, 99, 235, 0.52);
    background: #fff;
    color: #1d4ed8;
    box-shadow: 0 7px 16px rgba(37, 99, 235, 0.1);
    transform: translateY(-1px);
}

.rich-text-editor__tool:disabled {
    cursor: not-allowed;
    opacity: 0.38;
    box-shadow: none;
}

.rich-text-editor__tool :deep(.el-icon) {
    font-size: 15px;
}

.rich-text-editor__tool.is-active {
    border-color: #2563eb;
    background: rgba(219, 234, 254, 0.92);
    color: #1d4ed8;
}

.rich-text-editor__tool--italic {
    font-style: italic;
}

.rich-text-editor__tool--underline {
    text-decoration: underline;
    text-underline-offset: 2px;
}

.rich-text-editor__tool--code {
    font-size: 12px;
}

.rich-text-editor__tool--clear,
.rich-text-editor__tool:has(.rich-text-editor__tool-text) {
    width: auto;
}

.rich-text-editor__tool:not(:has(.rich-text-editor__tool-text)) {
    width: 34px;
    padding: 0;
}

.rich-text-editor__body {
    overflow: hidden;
    border: 1px solid rgba(17, 24, 39, 0.08);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.9);
}

.rich-text-editor :deep(.rich-text-editor__surface) {
    min-height: var(--rich-text-editor-min-height);
    padding: 16px;
    color: #1e293b;
    line-height: 1.75;
    outline: none;
}

.rich-text-editor :deep(.rich-text-editor__surface p),
.rich-text-editor :deep(.rich-text-editor__surface ul),
.rich-text-editor :deep(.rich-text-editor__surface ol),
.rich-text-editor :deep(.rich-text-editor__surface blockquote) {
    margin: 0 0 12px;
    color: #334155;
}

.rich-text-editor :deep(.rich-text-editor__surface p:last-child),
.rich-text-editor :deep(.rich-text-editor__surface ul:last-child),
.rich-text-editor :deep(.rich-text-editor__surface ol:last-child) {
    margin-bottom: 0;
}

.rich-text-editor :deep(.rich-text-editor__surface h1),
.rich-text-editor :deep(.rich-text-editor__surface h2),
.rich-text-editor :deep(.rich-text-editor__surface h3),
.rich-text-editor :deep(.rich-text-editor__surface h4),
.rich-text-editor :deep(.rich-text-editor__surface h5) {
    margin: 18px 0 10px;
    color: #0f172a;
    line-height: 1.28;
}

.rich-text-editor :deep(.rich-text-editor__surface h1) {
    font-size: 28px;
}

.rich-text-editor :deep(.rich-text-editor__surface h2) {
    font-size: 24px;
}

.rich-text-editor :deep(.rich-text-editor__surface h3) {
    font-size: 21px;
}

.rich-text-editor :deep(.rich-text-editor__surface h4) {
    font-size: 18px;
}

.rich-text-editor :deep(.rich-text-editor__surface h5) {
    font-size: 16px;
}

.rich-text-editor :deep(.rich-text-editor__surface a) {
    color: #2563eb;
}

.rich-text-editor :deep(.rich-text-editor__surface pre) {
    --rich-code-accent: #64748b;
    --rich-code-label: 'CODE';
    position: relative;
    overflow: auto;
    margin: 0 0 12px;
    padding: 38px 16px 14px;
    border: 1px solid rgba(30, 41, 59, 0.88);
    border-left: 4px solid var(--rich-code-accent);
    border-radius: 14px;
    background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.045), transparent 42%),
        #0f172a;
    color: #e2e8f0;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.rich-text-editor :deep(.rich-text-editor__surface pre)::before {
    position: absolute;
    top: 10px;
    left: 14px;
    display: inline-flex;
    align-items: center;
    min-height: 18px;
    padding: 2px 8px;
    border: 1px solid color-mix(in srgb, var(--rich-code-accent) 54%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--rich-code-accent) 18%, rgba(15, 23, 42, 0.86));
    color: #f8fafc;
    content: var(--rich-code-label);
    font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
    font-size: 11px;
    font-weight: 900;
    line-height: 1.2;
    letter-spacing: 0;
    pointer-events: none;
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-json)) {
    --rich-code-accent: #f97316;
    --rich-code-label: 'JSON';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-rust)),
.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-rs)) {
    --rich-code-accent: #d97706;
    --rich-code-label: 'RUST';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-cpp)),
.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-cxx)),
.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-cc)) {
    --rich-code-accent: #38bdf8;
    --rich-code-label: 'C++';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-c)) {
    --rich-code-accent: #94a3b8;
    --rich-code-label: 'C';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-csharp)),
.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-cs)) {
    --rich-code-accent: #8b5cf6;
    --rich-code-label: 'C#';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-java)) {
    --rich-code-accent: #ef4444;
    --rich-code-label: 'JAVA';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-javascript)),
.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-js)) {
    --rich-code-accent: #facc15;
    --rich-code-label: 'JS';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-typescript)),
.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-ts)) {
    --rich-code-accent: #3b82f6;
    --rich-code-label: 'TS';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-python)),
.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-py)) {
    --rich-code-accent: #22c55e;
    --rich-code-label: 'PYTHON';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-go)),
.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-golang)) {
    --rich-code-accent: #06b6d4;
    --rich-code-label: 'GO';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-sql)) {
    --rich-code-accent: #a78bfa;
    --rich-code-label: 'SQL';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-shell)),
.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-bash)),
.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-sh)),
.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-zsh)) {
    --rich-code-accent: #10b981;
    --rich-code-label: 'SHELL';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-html)) {
    --rich-code-accent: #fb7185;
    --rich-code-label: 'HTML';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-css)) {
    --rich-code-accent: #60a5fa;
    --rich-code-label: 'CSS';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-xml)) {
    --rich-code-accent: #f472b6;
    --rich-code-label: 'XML';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-yaml)),
.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-yml)) {
    --rich-code-accent: #f59e0b;
    --rich-code-label: 'YAML';
}

.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-md)),
.rich-text-editor :deep(.rich-text-editor__surface pre:has(code.language-markdown)) {
    --rich-code-accent: #2563eb;
    --rich-code-label: 'MD';
}

.rich-text-editor :deep(.rich-text-editor__surface code) {
    font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
}

.rich-text-editor :deep(.rich-text-editor__surface pre code) {
    display: block;
    min-width: max-content;
    color: inherit;
    line-height: 1.75;
    tab-size: 4;
}

.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-comment),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-quote) {
    color: #94a3b8;
    font-style: italic;
}

.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-doctag),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-keyword),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-meta .hljs-keyword),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-template-tag),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-template-variable) {
    color: #f472b6;
    font-weight: 800;
}

.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-attr),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-attribute),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-property),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-variable) {
    color: #7dd3fc;
}

.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-string),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-regexp) {
    color: #86efac;
}

.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-number),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-literal),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-symbol),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-bullet) {
    color: #fbbf24;
}

.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-built_in),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-class .hljs-title),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-title.class_),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-type) {
    color: #67e8f9;
    font-weight: 700;
}

.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-function .hljs-title),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-title.function_),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-title) {
    color: #93c5fd;
    font-weight: 700;
}

.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-meta),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-section),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-selector-tag),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-tag),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-name) {
    color: #fb7185;
}

.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-link),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-operator),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-params),
.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-subst) {
    color: #cbd5e1;
}

.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-addition) {
    color: #86efac;
    background: rgba(34, 197, 94, 0.12);
}

.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-deletion) {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.12);
}

.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-emphasis) {
    font-style: italic;
}

.rich-text-editor :deep(.rich-text-editor__surface pre .hljs-strong) {
    font-weight: 800;
}

.rich-text-editor :deep(.rich-text-editor__surface blockquote) {
    padding-left: 14px;
    border-left: 3px solid #bfdbfe;
    color: #475569;
}

.rich-text-editor :deep(.rich-text-editor__surface li) {
    color: #334155;
}

.rich-text-editor :deep(.rich-text-editor__surface .rich-editor-media) {
    display: block;
    max-width: 100%;
    margin: 12px 0;
    border: 1px solid rgba(203, 213, 225, 0.86);
    border-radius: 14px;
    background: #f8fafc;
}

.rich-text-editor :deep(.rich-text-editor__surface .rich-editor-image) {
    height: auto;
}

.rich-text-editor :deep(.rich-text-editor__surface .rich-editor-video) {
    width: 100%;
    min-height: 220px;
}

.rich-text-editor :deep(.rich-text-editor__surface .rich-editor-attachment) {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    margin: 10px 0;
    padding: 9px 12px;
    border: 1px solid rgba(191, 219, 254, 0.96);
    border-radius: 10px;
    background: rgba(239, 246, 255, 0.9);
    color: #2563eb;
    font-weight: 800;
    text-decoration: none;
    overflow-wrap: anywhere;
}

.rich-text-editor :deep(.rich-text-editor__surface hr) {
    margin: 18px 0;
    border: 0;
    border-top: 1px solid rgba(17, 24, 39, 0.1);
}

.rich-text-editor :deep(.rich-text-editor__surface table) {
    width: 100%;
    margin: 0 0 14px;
    border-collapse: collapse;
}

.rich-text-editor :deep(.rich-text-editor__surface th),
.rich-text-editor :deep(.rich-text-editor__surface td) {
    padding: 10px 12px;
    border: 1px solid rgba(17, 24, 39, 0.08);
    text-align: left;
}

.rich-text-editor :deep(.rich-text-editor__surface th) {
    background: rgba(17, 24, 39, 0.04);
}
</style>
