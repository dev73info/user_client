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


import {
  TButton,
  TDialog,
  TIcon,
  TInput,
  ArrowDown,
  Brush,
  Link as LinkIcon,
  RefreshLeft,
  RefreshRight,
} from 'ui_73info'

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
    closeToolbarDropdown()
}

// 阻止工具栏按钮抢走编辑器焦点：否则按钮会在 mousedown 后、click 生效前
// 就因编辑器失焦而被隐藏，导致点击不生效。
function handleToolbarPointerDown(event: MouseEvent) {
    if (!toolbarOnFocusEnabled.value) {
        return
    }
    const target = event.target
    // 字号输入框等可编辑控件需要正常获取焦点，不阻止默认行为。
    if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) {
        return
    }
    event.preventDefault()
}

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
    let top = defaultGap

    const header = document.querySelector<HTMLElement>('.portal-header')
    const headerRect = header?.getBoundingClientRect()
    if (headerRect && headerRect.height > 0 && headerRect.bottom > 0) {
        top = Math.max(top, Math.round(headerRect.bottom + 10))
    }

    const scrollContainer = findFloatingScrollContainer(root)
    if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect()
        if (containerRect.height > 0 && containerRect.bottom > defaultGap) {
            top = Math.max(top, Math.round(containerRect.top + 10))
        }
    }

    return top
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
            renderHTML({ node, HTMLAttributes }) {
                let language = node.attrs.language || null
                if (!language) {
                    try {
                        const auto = codeHighlighter.highlightAuto(node.textContent || '')
                        const detected = (auto as { data?: { language?: string } } | null)?.data
                            ?.language
                        if (detected && codeHighlighter.listLanguages().includes(detected)) {
                            language = detected
                        }
                    } catch {
                        language = null
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
    ],
    editorProps: {
        attributes: {
            class: 'rich-text-editor__surface rich-text-body',
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

// editor 在组件 onMounted 后才由 tiptap 的 useEditor 创建。
// 若打开弹窗时（如发布草稿恢复）modelValue 的更新先于 editor 就绪，
// 上面的 watch 会因 editor 尚未创建而静默丢弃内容，导致富文本恢复为空。
// 因此在 editor 就绪后把当前的 modelValue 同步一次，确保内容不丢失。
watch(editor, (editorInstance) => {
    if (editorInstance && props.modelValue) {
        editorInstance.commands.setContent(props.modelValue, { emitUpdate: false })
    }
})

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
    try {
        const auto = codeHighlighter.highlightAuto(node.textContent || '')
        const detected = (auto as { data?: { language?: string } } | null)?.data?.language
        if (detected && codeHighlighter.listLanguages().includes(detected)) {
            return normalizeCodeBlockLanguage(detected)
        }
    } catch {
        return null
    }
    return null
}

function currentCodeLanguageValue(): string {
    editorRevision.value
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
        emit('notify', '请输入有效的字号', 'warning')
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

/* ---------------------------------------------------------------------------
   单行输入弹窗（替代 ElMessageBox.prompt）
   ---------------------------------------------------------------------------
   ui_73info 的 TMessageBox 只有 confirm / alert，没有带输入框的 prompt
   （见 ui_73info/doc/架构.md 第八节），所以这里用库的 TDialog + TInput 就地搭一个。

   语义与原 prompt 保持一致：确定交出输入值，取消 / Esc / 点遮罩交出 null。
   三条出口都走 settlePrompt，它先把 resolve 取走再置空，所以重复触发是安全的
   ——与库内 TMessageBox 的 finish() 同一个理由。
   --------------------------------------------------------------------------- */

const promptOpen = ref(false)
const promptTitle = ref('')
const promptMessage = ref('')
const promptInput = ref('')
let promptResolve: ((value: string | null) => void) | null = null

function promptValue(message: string, title: string, defaultValue = ''): Promise<string | null> {
    promptMessage.value = message
    promptTitle.value = title
    promptInput.value = defaultValue
    promptOpen.value = true
    return new Promise<string | null>((resolve) => {
        promptResolve = resolve
    })
}

function settlePrompt(value: string | null) {
    const resolve = promptResolve
    promptResolve = null
    promptOpen.value = false
    resolve?.(value)
}

async function promptInsertImage() {
    const raw = await promptValue('输入图片地址，支持 https:// 或 /uploads/...', '插入图片')
    if (raw === null) {
        return
    }

    const src = normalizeRichEditorUrl(raw)
    if (!isRichEditorMediaUrl(src)) {
        emit('notify', '请输入有效的图片地址', 'warning')
        return
    }

    const alt = (await promptValue('图片说明（可选）', '图片说明', richEditorDefaultLabel(src, '图片'))) ?? ''
    insertImage(src, alt.trim())
}

async function promptInsertVideo() {
    const raw = await promptValue('输入视频地址，支持 https:// 或 /uploads/...', '插入视频')
    if (raw === null) {
        return
    }

    const src = normalizeRichEditorUrl(raw)
    if (!isRichEditorMediaUrl(src)) {
        emit('notify', '请输入有效的视频地址', 'warning')
        return
    }

    const title = (await promptValue('视频标题（可选）', '视频标题', richEditorDefaultLabel(src, '视频'))) ?? ''
    insertVideo(src, title.trim())
}

async function promptInsertAttachment() {
    const raw = await promptValue('输入附件地址，支持 https://、mailto:、tel: 或 /uploads/...', '插入附件')
    if (raw === null) {
        return
    }

    const href = normalizeRichEditorUrl(raw)
    if (!isRichEditorLinkUrl(href)) {
        emit('notify', '请输入有效的附件地址', 'warning')
        return
    }

    const label = (await promptValue('附件名称', '附件名称', richEditorDefaultLabel(href, '附件'))) ?? ''
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
    <div ref="editorRootRef" class="rich-text-editor"
        :class="{
            'rich-text-editor--auto-height': autoHeightEnabled,
            'rich-text-editor--toolbar-on-focus': toolbarOnFocusEnabled,
        }" :style="editorStyle" @focusin="handleRootFocusIn" @focusout="handleRootFocusOut">
        <div v-show="!toolbarOnFocusEnabled || toolbarVisible" class="rich-text-editor__toolbar-shell"
            :style="toolbarShellStyle">
            <div ref="toolbarRef" class="rich-text-editor__toolbar" :class="{ 'is-floating': toolbarFloating }"
                :style="toolbarFloatingStyle" aria-label="编辑器工具栏" @mousedown="handleToolbarPointerDown">
                <div class="rich-text-editor__dropdown">
                    <button class="rich-text-editor__dropdown-trigger"
                        :class="{ 'is-open': openDropdown === 'heading' }" type="button" title="标题级别"
                        aria-haspopup="menu" :aria-expanded="openDropdown === 'heading'"
                        @click="toggleToolbarDropdown('heading')" @keydown.down.prevent="openDropdown = 'heading'"
                        @keydown.escape.stop.prevent="closeToolbarDropdown">
                        <span>{{ currentHeadingLabel() }}</span>
                        <TIcon class="rich-text-editor__dropdown-caret" aria-hidden="true">
                            <ArrowDown />
                        </TIcon>
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
                        <TIcon class="rich-text-editor__dropdown-caret" aria-hidden="true">
                            <ArrowDown />
                        </TIcon>
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
                    <TIcon aria-hidden="true">
                        <LinkIcon />
                    </TIcon>
                    <span class="rich-text-editor__tool-text">链接</span>
                </button>

                <div class="rich-text-editor__dropdown">
                    <button class="rich-text-editor__dropdown-trigger" :class="{ 'is-open': openDropdown === 'insert' }"
                        type="button" title="插入内容" aria-haspopup="menu" :aria-expanded="openDropdown === 'insert'"
                        @click="toggleToolbarDropdown('insert')" @keydown.down.prevent="openDropdown = 'insert'"
                        @keydown.escape.stop.prevent="closeToolbarDropdown">
                        <span>插入</span>
                        <TIcon class="rich-text-editor__dropdown-caret" aria-hidden="true">
                            <ArrowDown />
                        </TIcon>
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
                    <TIcon aria-hidden="true">
                        <RefreshLeft />
                    </TIcon>
                </button>
                <button class="rich-text-editor__tool" type="button" title="重做" aria-label="重做"
                    :disabled="!canRunHistoryAction('redo')" @click="runHistoryAction('redo')">
                    <TIcon aria-hidden="true">
                        <RefreshRight />
                    </TIcon>
                </button>

                <button class="rich-text-editor__tool rich-text-editor__tool--clear" type="button" title="清除格式"
                    aria-label="清除格式" @click="clearFormatting">
                    <TIcon aria-hidden="true">
                        <Brush />
                    </TIcon>
                    <span class="rich-text-editor__tool-text">清除</span>
                </button>
            </div>
        </div>

        <div class="rich-text-editor__body">
            <EditorContent v-if="editor" :editor="editor" />
        </div>

        <!-- 单行输入弹窗：接替 ElMessageBox.prompt，做法见脚本里 promptValue 上方的注释 -->
        <TDialog :open="promptOpen" :title="promptTitle" :width="420" @update:open="settlePrompt(null)"
            @close="settlePrompt(null)">
            <label class="rich-text-editor__prompt-field">
                <span class="rich-text-editor__prompt-label">{{ promptMessage }}</span>
                <TInput v-model="promptInput" autofocus @enter="settlePrompt(promptInput)" />
            </label>
            <template #footer>
                <TButton variant="outline" @click="settlePrompt(null)">取消</TButton>
                <TButton variant="solid" tone="accent" @click="settlePrompt(promptInput)">确定</TButton>
            </template>
        </TDialog>
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

/* 按需显示的工具栏：淡入避免突然出现。
   仅使用 opacity，不加 transform，否则会改变 .is-floating 固定定位的包含块。 */
@keyframes rich-text-editor-toolbar-in {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}

.rich-text-editor--toolbar-on-focus .rich-text-editor__toolbar-shell {
    animation: rich-text-editor-toolbar-in 160ms ease;
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

.rich-text-editor__tool :deep(.t73-icon) {
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

.rich-text-editor__prompt-field {
    display: grid;
    gap: 8px;
}

.rich-text-editor__prompt-label {
    color: var(--73-ink-soft);
    font-size: 13px;
    font-weight: 600;
}

.rich-text-editor__body {
    overflow: hidden;
    border: 1px solid rgba(17, 24, 39, 0.08);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.9);
}

.rich-text-editor :deep(.rich-text-editor__surface) {
    min-height: var(--rich-text-editor-min-height);
    max-height: var(--rich-text-editor-max-height, none);
    overflow-y: auto;
    padding: 16px;
    color: #1e293b;
    line-height: 1.75;
    outline: none;
}

/* 自动高度：由内容撑开编辑器，仅在超过 max-height 时才在内部滚动。 */
.rich-text-editor--auto-height :deep(.rich-text-editor__surface) {
    height: auto;
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
    display: inline-block;
    vertical-align: middle;
    height: auto;
    margin: 12px 8px 12px 0;
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
