<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, type Component } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import Link from '@tiptap/extension-link'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import MarkdownIt from 'markdown-it'
import { useRoute, useRouter } from 'vue-router'
import {
  Back,
  Check,
  Document,
  Folder,
  Link as LinkIcon,
  List,
  Picture,
  Reading,
  RefreshLeft,
  Upload,
  View,
} from '@element-plus/icons-vue'

import { apiUrl } from '@dev/api/http'
import {
  getMcResource,
  type McResourcePayload,
  uploadMcResourceCover,
  updateMcResourceHomepage,
} from '@dev/api/mcResources'
import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'
import { buildUnifiedAuthUrl } from '@/config/runtime'
import { getResourceDetailSlug, getTagRouteSlug } from '@/api/resourceTags'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

type ToolbarAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'blockquote'
  | 'code'
type EditorMode = 'rich' | 'markdown'
type HomepageEditorUpdatePayload = {
  editor: {
    getText: () => string
    getHTML: () => string
  }
}

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
const saving = ref(false)
const resource = ref<McResourcePayload | null>(null)
const coverFileInput = ref<HTMLInputElement | null>(null)
const selectedCoverFile = ref<File | null>(null)
const selectedCoverFileName = ref('')
const localCoverPreviewUrl = ref('')
const editorMode = ref<EditorMode>('rich')
const markdownDraft = ref('')

const form = reactive({
  title: '',
  author: '',
  description: '',
  cover_url: '',
  docs_url: '',
  release_note: '',
})

const toolbarActions: Array<{
  label: string
  action: ToolbarAction
  title: string
  icon?: Component
}> = [
    { label: 'B', action: 'bold', title: '加粗' },
    { label: 'I', action: 'italic', title: '斜体' },
    { label: 'U', action: 'underline', title: '下划线' },
    { label: 'H2', action: 'h2', title: '二级标题' },
    { label: 'H3', action: 'h3', title: '三级标题' },
    { label: '', action: 'bullet', title: '无序列表', icon: List },
    { label: '1.', action: 'ordered', title: '有序列表' },
    { label: '引用', action: 'blockquote', title: '引用' },
    { label: '</>', action: 'code', title: '代码块' },
  ]

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

function formatHomepageContent(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (/<\/?[a-z][\s\S]*>/i.test(trimmed)) {
    return sanitizeRichHtml(trimmed)
  }

  return sanitizeRichHtml(markdownRenderer.render(trimmed))
}

const editor = useEditor({
  content: '<p></p>',
  extensions: [
    StarterKit.configure({
      heading: {
        levels: [2, 3],
      },
      link: false,
      underline: false,
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
    }),
  ],
  editorProps: {
    attributes: {
      class: 'dev-resource-homepage-editor__editor-surface',
    },
  },
  onUpdate: (payload: HomepageEditorUpdatePayload) => {
    const currentEditor = payload.editor
    const text = currentEditor.getText().trim()
    form.release_note = text ? sanitizeRichHtml(currentEditor.getHTML()) : ''
  },
})

const coverPreviewUrl = computed(() => {
  if (localCoverPreviewUrl.value) {
    return localCoverPreviewUrl.value
  }

  if (form.cover_url.trim()) {
    return apiUrl(form.cover_url.trim())
  }

  return ''
})

const previewTagNames = computed(
  () => resource.value?.tag_selections.flatMap((item) => item.tag_names) ?? [],
)
const previewTagCount = computed(() => previewTagNames.value.length)
const resourceVisibilityLabel = computed(() => {
  if (resource.value?.visibility === 'published') {
    return '公开展示中'
  }

  if (resource.value?.visibility === 'review') {
    return '审核中'
  }

  return '私有'
})
const resourcePlatformLabel = computed(() => resource.value?.platform || '未知平台')
const heroTitle = computed(() => form.title.trim() || resource.value?.title || '资源主页')
const resourceAuthorLabel = computed(() => form.author.trim() || resource.value?.author || '开发者')
const previewContentHtml = computed(() => formatHomepageContent(currentEditorContent()))
const userClientPreviewUrl = computed(() =>
  resource.value ? userClientResourceUrl(resource.value) : '',
)

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function currentEditorContent(): string {
  return editorMode.value === 'markdown' ? markdownDraft.value : form.release_note
}

function syncEditorContent(value: string) {
  const normalized = formatHomepageContent(value) || '<p></p>'
  editor.value?.commands.setContent(normalized, { emitUpdate: false })
}

function syncMarkdownDraft(value: string) {
  markdownDraft.value = value
  if (editorMode.value === 'markdown') {
    form.release_note = value
  }
}

function switchEditorMode(mode: EditorMode) {
  if (mode === editorMode.value) {
    return
  }

  if (mode === 'markdown') {
    const nextMarkdown = looksLikeHtml(form.release_note)
      ? editor.value?.getText({ blockSeparator: '\n\n' }) || ''
      : form.release_note
    syncMarkdownDraft(nextMarkdown)
    editorMode.value = 'markdown'
    return
  }

  editorMode.value = 'rich'
  form.release_note = sanitizeRichHtml(
    formatHomepageContent(markdownDraft.value || form.release_note),
  )
  syncEditorContent(markdownDraft.value || form.release_note)
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
    case 'h2':
      chain.toggleHeading({ level: 2 }).run()
      return
    case 'h3':
      chain.toggleHeading({ level: 3 }).run()
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
      chain.toggleCodeBlock().run()
      return
  }
}

function isToolbarActive(action: ToolbarAction): boolean {
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
    case 'h2':
      return editor.value.isActive('heading', { level: 2 })
    case 'h3':
      return editor.value.isActive('heading', { level: 3 })
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

function toggleLink() {
  if (!editor.value) {
    return
  }

  const currentHref = editor.value.getAttributes('link').href ?? ''
  const value = window.prompt('输入跳转链接，留空将移除链接', currentHref)?.trim()
  if (value === undefined) {
    return
  }

  if (!value) {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }

  editor.value.chain().focus().extendMarkRange('link').setLink({ href: value }).run()
}

function clearFormatting() {
  editor.value?.chain().focus().unsetAllMarks().clearNodes().run()
}

function triggerCoverPicker() {
  coverFileInput.value?.click()
}

function resetLocalCoverPreview() {
  if (localCoverPreviewUrl.value) {
    URL.revokeObjectURL(localCoverPreviewUrl.value)
    localCoverPreviewUrl.value = ''
  }
}

function handleCoverFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  selectedCoverFile.value = file
  selectedCoverFileName.value = file?.name ?? ''

  resetLocalCoverPreview()
  if (file) {
    localCoverPreviewUrl.value = URL.createObjectURL(file)
  }
}

async function loadResource() {
  const resourceId = Number(route.params.resourceId)
  if (!Number.isInteger(resourceId) || resourceId <= 0) {
    showToast('资源编号无效', 'warning')
    router.replace({ name: 'dev-resource-list' })
    return
  }

  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    router.replace(buildUnifiedAuthUrl('login', route.fullPath))
    return
  }

  loading.value = true
  try {
    const payload = await getMcResource(auth.token, resourceId)
    resource.value = payload
    form.title = payload.title
    form.author = payload.author
    form.description = payload.description
    form.cover_url = payload.cover_url || ''
    form.docs_url = payload.docs_url || ''
    form.release_note = payload.release_note || ''
    markdownDraft.value = looksLikeHtml(payload.release_note || '')
      ? ''
      : payload.release_note || ''
    syncEditorContent(payload.release_note || '')
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载资源详情失败'
    showToast(message, 'error')
    router.replace({ name: 'dev-resource-list' })
  } finally {
    loading.value = false
  }
}

async function saveHomepage() {
  if (!auth.token || !resource.value) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (!form.title.trim() || !form.description.trim()) {
    showToast('请先填写资源标题和资源简介', 'warning')
    return
  }

  saving.value = true
  try {
    let nextCoverUrl = form.cover_url.trim() || null

    if (selectedCoverFile.value) {
      const coverUpdated = await uploadMcResourceCover(
        auth.token,
        resource.value.id,
        selectedCoverFile.value,
      )
      nextCoverUrl = coverUpdated.cover_url
      form.cover_url = coverUpdated.cover_url || ''
    }

    const updated = await updateMcResourceHomepage(auth.token, resource.value.id, {
      title: form.title.trim(),
      author: form.author.trim(),
      description: form.description.trim(),
      cover_url: nextCoverUrl,
      docs_url: form.docs_url.trim() || null,
      release_note: form.release_note.trim() || null,
    })

    resource.value = updated
    form.author = updated.author
    form.cover_url = updated.cover_url || ''
    form.docs_url = updated.docs_url || ''
    form.release_note = updated.release_note || ''
    markdownDraft.value = looksLikeHtml(updated.release_note || '')
      ? markdownDraft.value
      : updated.release_note || ''
    selectedCoverFile.value = null
    selectedCoverFileName.value = ''
    if (coverFileInput.value) {
      coverFileInput.value.value = ''
    }
    resetLocalCoverPreview()
    syncEditorContent(updated.release_note || '')
    showToast('资源主页已更新', 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新资源主页失败'
    showToast(message, 'error')
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push({ name: 'dev-resource-list' })
}

function firstTagPathSegment(index: number): string {
  return (
    resource.value?.tag_selections.find((item) => item.group_path[index])?.group_path[index] ?? ''
  )
}

function userClientResourceUrl(target: McResourcePayload): string {
  const rootSlug = getTagRouteSlug(firstTagPathSegment(0) || 'resources')
  const entrySlug = getTagRouteSlug(firstTagPathSegment(1) || target.platform || 'detail')
  const ownerName = target.creator.trim() || target.author.trim() || target.title
  const routeLocation = router.resolve({
    name: 'resource-detail',
    params: {
      rootSlug,
      entrySlug,
      resourceSlug: getResourceDetailSlug(target.id, ownerName),
    },
  })

  const configuredBase = (import.meta.env.VITE_USER_CLIENT_BASE_URL as string | undefined)?.trim()
  const baseUrl = configuredBase ? configuredBase.replace(/\/$/, '') + '/' : window.location.href
  return new URL(routeLocation.href, baseUrl).toString()
}

onMounted(async () => {
  auth.hydrate()
  await loadResource()
})

onBeforeUnmount(() => {
  editor.value?.destroy()
  resetLocalCoverPreview()
})
</script>

<template>
  <div class="dev-page dev-page--resource-homepage-editor">
    <section class="dev-panel-banner dev-panel-banner--light dev-resource-homepage-editor__hero">
      <div class="dev-resource-homepage-editor__hero-main">
        <div class="dev-resource-homepage-editor__hero-cover">
          <img v-if="coverPreviewUrl" :src="coverPreviewUrl" :alt="heroTitle"
            class="dev-resource-homepage-editor__hero-cover-image" />
          <el-icon v-else>
            <Folder />
          </el-icon>
        </div>
        <div class="dev-resource-homepage-editor__hero-copy">
          <div class="dev-panel-banner__eyebrow">资源主页编辑</div>
          <h2 class="dev-panel-banner__title">{{ heroTitle }}</h2>
          <div class="dev-resource-homepage-editor__hero-meta">
            <span class="dev-resource-homepage-editor__hero-pill">{{
              resourceVisibilityLabel
              }}</span>
            <span class="dev-resource-homepage-editor__hero-pill">{{ resourcePlatformLabel }}</span>
            <span class="dev-resource-homepage-editor__hero-pill">{{ previewTagCount }} 个标签</span>
            <span class="dev-resource-homepage-editor__hero-pill">{{ resourceAuthorLabel }}</span>
          </div>
        </div>
      </div>
      <div class="dev-resource-homepage-editor__banner-actions">
        <el-button plain :icon="Back" @click="goBack">返回列表</el-button>
        <el-button v-if="resource" tag="a" :href="userClientPreviewUrl" target="_blank" rel="noopener noreferrer"
          :icon="View">打开用户端</el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="saveHomepage">保存主页</el-button>
      </div>
    </section>

    <section class="dev-resource-homepage-editor__layout" v-loading="loading">
      <div class="dev-resource-homepage-editor__forms">
        <el-card shadow="never" class="dev-surface-card">
          <div class="dev-resource-homepage-editor__section-head">
            <div>
              <h3 class="dev-section-title">基础信息</h3>
              <p class="dev-section-desc">标题、简介与封面素材</p>
            </div>
            <el-icon class="dev-resource-homepage-editor__section-icon">
              <Picture />
            </el-icon>
          </div>

          <el-form label-position="top" class="dev-resource-homepage-editor__form">
            <el-form-item label="资源标题" required>
              <el-input v-model="form.title" maxlength="120" show-word-limit placeholder="输入资源标题" />
            </el-form-item>
            <el-form-item label="资源简介" required>
              <el-input v-model="form.description" type="textarea" :rows="5" maxlength="500" show-word-limit
                placeholder="用一段简洁说明告诉用户这是什么资源、适合谁、解决什么问题" />
            </el-form-item>
            <el-form-item label="图标文件">
              <div class="dev-resource-homepage-editor__file-picker">
                <input ref="coverFileInput" type="file" accept="image/*"
                  class="dev-resource-homepage-editor__file-input" @change="handleCoverFileChange" />
                <el-button :icon="Upload" @click="triggerCoverPicker">选择封面</el-button>
                <span class="dev-resource-homepage-editor__file-name">
                  {{ selectedCoverFileName || '未选择文件' }}
                </span>
              </div>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="dev-surface-card">
          <div class="dev-resource-homepage-editor__section-head">
            <div>
              <h3 class="dev-section-title">主页补充说明</h3>
              <p class="dev-section-desc">编辑发布页内容</p>
            </div>
            <el-icon class="dev-resource-homepage-editor__section-icon">
              <Document />
            </el-icon>
          </div>

          <div class="dev-resource-homepage-editor__mode-switch" role="tablist" aria-label="编辑模式切换">
            <button class="dev-resource-homepage-editor__mode-button" :class="{ 'is-active': editorMode === 'rich' }"
              type="button" @click="switchEditorMode('rich')">
              富文本
            </button>
            <button class="dev-resource-homepage-editor__mode-button"
              :class="{ 'is-active': editorMode === 'markdown' }" type="button" @click="switchEditorMode('markdown')">
              Markdown
            </button>
          </div>

          <div v-if="editorMode === 'rich'" class="dev-resource-homepage-editor__toolbar">
            <button v-for="item in toolbarActions" :key="`${item.action}:${item.label}`"
              class="dev-resource-homepage-editor__tool" :class="{ 'is-active': isToolbarActive(item.action) }"
              type="button" :title="item.title" :aria-label="item.title" @click="runToolbarAction(item.action)">
              <el-icon v-if="item.icon">
                <component :is="item.icon" />
              </el-icon>
              <span v-else>{{ item.label }}</span>
            </button>
            <button class="dev-resource-homepage-editor__tool" :class="{ 'is-active': editor?.isActive('link') }"
              type="button" title="插入链接" aria-label="插入链接" @click="toggleLink">
              <el-icon>
                <LinkIcon />
              </el-icon>
            </button>
            <button class="dev-resource-homepage-editor__tool" type="button" title="清除格式" aria-label="清除格式"
              @click="clearFormatting">
              <el-icon>
                <RefreshLeft />
              </el-icon>
            </button>
          </div>

          <div v-if="editorMode === 'rich'" class="dev-resource-homepage-editor__editor">
            <EditorContent v-if="editor" :editor="editor" />
          </div>

          <div v-else class="dev-resource-homepage-editor__markdown-panel">
            <textarea v-model="markdownDraft" class="dev-resource-homepage-editor__markdown-input" spellcheck="false"
              placeholder="# dsa

## 小标题

- 列表项
- 列表项

```ts
console.log('hello')
```
" @input="form.release_note = markdownDraft" />
          </div>
        </el-card>
      </div>

      <aside class="dev-resource-homepage-editor__preview-column">
        <el-card shadow="never" class="dev-surface-card dev-resource-homepage-editor__preview-card">
          <div class="dev-resource-homepage-editor__preview-top">
            <div>
              <div class="dev-panel-banner__eyebrow">Preview</div>
              <h3 class="dev-section-title">页面预览</h3>
            </div>
          </div>

          <div class="dev-resource-homepage-editor__preview-shell">
            <div class="dev-resource-homepage-editor__preview-cover">
              <img v-if="coverPreviewUrl" :src="coverPreviewUrl" :alt="form.title"
                class="dev-resource-homepage-editor__preview-cover-image" />
              <div v-else class="dev-resource-homepage-editor__preview-cover-fallback">
                <el-icon>
                  <Folder />
                </el-icon>
              </div>
            </div>

            <div class="dev-resource-homepage-editor__preview-content">
              <div class="dev-resource-homepage-editor__preview-section-head">
                <h4>页面内容</h4>
                <el-icon>
                  <Reading />
                </el-icon>
              </div>
              <div v-if="previewContentHtml" class="dev-resource-homepage-editor__preview-rich-text"
                v-html="previewContentHtml" />
              <p v-else class="dev-resource-homepage-editor__preview-empty">
                主页补充说明会显示在这里。可以用标题、列表、引用和链接组织内容结构。
              </p>
            </div>
          </div>
        </el-card>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.dev-page--resource-homepage-editor {
  gap: 24px;
}

.dev-resource-homepage-editor__hero {
  align-items: center;
  padding: 22px;
}

.dev-resource-homepage-editor__hero-main {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
}

.dev-resource-homepage-editor__hero-cover {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(31, 74, 209, 0.1), rgba(42, 166, 164, 0.14));
  color: var(--dev-blue);
}

.dev-resource-homepage-editor__hero-cover :deep(.el-icon) {
  font-size: 34px;
}

.dev-resource-homepage-editor__hero-cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dev-resource-homepage-editor__hero-copy {
  min-width: 0;
}

.dev-resource-homepage-editor__hero-copy .dev-panel-banner__title,
.dev-resource-homepage-editor__hero-copy .dev-panel-banner__desc {
  overflow-wrap: anywhere;
}

.dev-resource-homepage-editor__hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.dev-resource-homepage-editor__hero-pill {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid rgba(31, 74, 209, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.dev-resource-homepage-editor__banner-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  flex: 0 0 auto;
}

.dev-resource-homepage-editor__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 0.78fr);
  gap: 24px;
  align-items: start;
}

.dev-resource-homepage-editor__forms {
  display: grid;
  gap: 20px;
}

.dev-resource-homepage-editor__section-head,
.dev-resource-homepage-editor__preview-top,
.dev-resource-homepage-editor__preview-section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.dev-resource-homepage-editor__section-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border-radius: 12px;
  background: rgba(31, 74, 209, 0.08);
  color: var(--dev-blue);
  font-size: 18px;
}

.dev-resource-homepage-editor__section-tag,
.dev-resource-homepage-editor__status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(31, 74, 209, 0.08);
  border: 1px solid rgba(31, 74, 209, 0.12);
  font-size: 12px;
  font-weight: 700;
  color: var(--dev-blue);
}

.dev-resource-homepage-editor__form {
  margin-top: 18px;
}

.dev-resource-homepage-editor__file-picker {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
  padding: 12px;
  border: 1px dashed rgba(31, 74, 209, 0.22);
  border-radius: 14px;
  background: rgba(31, 74, 209, 0.04);
}

.dev-resource-homepage-editor__file-input {
  display: none;
}

.dev-resource-homepage-editor__file-name {
  color: var(--dev-muted);
  word-break: break-all;
  font-size: 13px;
}

.dev-resource-homepage-editor__toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding: 10px;
  border: 1px solid rgba(17, 24, 39, 0.06);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.58);
}

.dev-resource-homepage-editor__mode-switch {
  display: inline-flex;
  gap: 8px;
  margin-top: 18px;
  padding: 6px;
  border-radius: 16px;
  background: rgba(17, 24, 39, 0.05);
}

.dev-resource-homepage-editor__mode-button {
  border: 0;
  min-height: 38px;
  padding: 0 16px;
  border-radius: 12px;
  background: transparent;
  color: var(--dev-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.dev-resource-homepage-editor__mode-button.is-active {
  background: rgba(255, 255, 255, 0.92);
  color: var(--dev-ink);
  box-shadow: 0 8px 18px rgba(17, 24, 39, 0.08);
}

.dev-resource-homepage-editor__tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.8);
  color: var(--dev-ink);
  min-width: 40px;
  min-height: 38px;
  padding: 0 10px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.dev-resource-homepage-editor__tool :deep(.el-icon) {
  font-size: 16px;
}

.dev-resource-homepage-editor__tool.is-active {
  background: rgba(31, 74, 209, 0.12);
  border-color: rgba(31, 74, 209, 0.22);
  color: var(--dev-blue);
}

.dev-resource-homepage-editor__editor {
  margin-top: 16px;
  border-radius: 18px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.7);
  overflow: hidden;
}

.dev-resource-homepage-editor__markdown-panel {
  margin-top: 16px;
}

.dev-resource-homepage-editor__markdown-input {
  width: 100%;
  min-height: 320px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.78);
  color: var(--dev-ink);
  font: inherit;
  line-height: 1.8;
  resize: vertical;
  outline: none;
}

.dev-resource-homepage-editor__editor :deep(.dev-resource-homepage-editor__editor-surface) {
  min-height: 320px;
  padding: 18px;
  color: var(--dev-ink);
  line-height: 1.8;
  outline: none;
}

.dev-resource-homepage-editor__editor :deep(.dev-resource-homepage-editor__editor-surface p.is-editor-empty:first-child::before) {
  content: '在这里输入主页补充说明，可插入标题、列表、引用、代码块与链接';
  color: #94a3b8;
  float: left;
  height: 0;
  pointer-events: none;
}

.dev-resource-homepage-editor__editor :deep(h2),
.dev-resource-homepage-editor__preview-rich-text :deep(h2) {
  margin: 0 0 12px;
  font-size: 22px;
  line-height: 1.3;
}

.dev-resource-homepage-editor__editor :deep(h1),
.dev-resource-homepage-editor__preview-rich-text :deep(h1) {
  margin: 0 0 14px;
  font-size: 28px;
  line-height: 1.2;
}

.dev-resource-homepage-editor__editor :deep(h3),
.dev-resource-homepage-editor__preview-rich-text :deep(h3) {
  margin: 0 0 12px;
  font-size: 18px;
  line-height: 1.4;
}

.dev-resource-homepage-editor__editor :deep(p),
.dev-resource-homepage-editor__preview-rich-text :deep(p) {
  margin: 0 0 12px;
  color: #334155;
}

.dev-resource-homepage-editor__editor :deep(li),
.dev-resource-homepage-editor__preview-rich-text :deep(li) {
  color: #334155;
}

.dev-resource-homepage-editor__editor :deep(blockquote),
.dev-resource-homepage-editor__preview-rich-text :deep(blockquote) {
  margin: 0 0 12px;
  padding-left: 16px;
  border-left: 3px solid rgba(31, 74, 209, 0.22);
  color: #475569;
}

.dev-resource-homepage-editor__editor :deep(ul),
.dev-resource-homepage-editor__editor :deep(ol),
.dev-resource-homepage-editor__preview-rich-text :deep(ul),
.dev-resource-homepage-editor__preview-rich-text :deep(ol) {
  margin: 0 0 12px;
  padding-left: 20px;
}

.dev-resource-homepage-editor__editor :deep(pre),
.dev-resource-homepage-editor__preview-rich-text :deep(pre) {
  margin: 0 0 12px;
  padding: 14px 16px;
  border-radius: 16px;
  background: #0f172a;
  color: #e2e8f0;
  overflow-x: auto;
}

.dev-resource-homepage-editor__editor :deep(code),
.dev-resource-homepage-editor__preview-rich-text :deep(code) {
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
}

.dev-resource-homepage-editor__editor :deep(a),
.dev-resource-homepage-editor__preview-rich-text :deep(a) {
  color: var(--dev-blue);
}

.dev-resource-homepage-editor__editor :deep(hr),
.dev-resource-homepage-editor__preview-rich-text :deep(hr) {
  margin: 18px 0;
  border: 0;
  border-top: 1px solid rgba(17, 24, 39, 0.1);
}

.dev-resource-homepage-editor__editor :deep(table),
.dev-resource-homepage-editor__preview-rich-text :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 14px;
}

.dev-resource-homepage-editor__editor :deep(th),
.dev-resource-homepage-editor__editor :deep(td),
.dev-resource-homepage-editor__preview-rich-text :deep(th),
.dev-resource-homepage-editor__preview-rich-text :deep(td) {
  padding: 10px 12px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  text-align: left;
}

.dev-resource-homepage-editor__editor :deep(th),
.dev-resource-homepage-editor__preview-rich-text :deep(th) {
  background: rgba(17, 24, 39, 0.04);
}

.dev-resource-homepage-editor__preview-column {
  position: sticky;
  top: 12px;
}

.dev-resource-homepage-editor__preview-card .el-card__body {
  display: grid;
  gap: 16px;
}

.dev-resource-homepage-editor__preview-shell {
  display: grid;
  gap: 18px;
}

.dev-resource-homepage-editor__preview-cover {
  aspect-ratio: 16 / 9;
  min-height: 0;
  overflow: hidden;
  border-radius: 18px;
  background: linear-gradient(145deg, rgba(17, 24, 39, 0.92), rgba(31, 74, 209, 0.76));
}

.dev-resource-homepage-editor__preview-cover-image,
.dev-resource-homepage-editor__preview-cover-fallback {
  display: block;
  width: 100%;
  height: 100%;
}

.dev-resource-homepage-editor__preview-cover-image {
  object-fit: cover;
}

.dev-resource-homepage-editor__preview-cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.92);
}

.dev-resource-homepage-editor__preview-cover-fallback :deep(.el-icon) {
  font-size: 58px;
}

.dev-resource-homepage-editor__preview-content {
  padding: 20px;
  border-radius: 18px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  background: rgba(255, 255, 255, 0.72);
}

.dev-resource-homepage-editor__preview-empty,
.dev-resource-homepage-editor__preview-section-head span,
.dev-resource-homepage-editor__preview-rich-text {
  margin: 12px 0 0;
  color: var(--dev-muted);
  line-height: 1.8;
}

.dev-resource-homepage-editor__preview-section-head h4 {
  margin: 0;
  font-size: 18px;
  color: var(--dev-ink);
}

.dev-resource-homepage-editor__preview-section-head :deep(.el-icon) {
  color: var(--dev-blue);
  font-size: 18px;
}

@media (max-width: 960px) {
  .dev-resource-homepage-editor__layout {
    grid-template-columns: 1fr;
  }

  .dev-resource-homepage-editor__preview-column {
    position: static;
  }

  .dev-resource-homepage-editor__section-head,
  .dev-resource-homepage-editor__preview-top,
  .dev-resource-homepage-editor__preview-section-head {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (max-width: 720px) {
  .dev-resource-homepage-editor__hero {
    align-items: stretch;
  }

  .dev-resource-homepage-editor__hero-main {
    align-items: flex-start;
  }

  .dev-resource-homepage-editor__hero-cover {
    width: 72px;
    height: 72px;
    border-radius: 16px;
  }

  .dev-resource-homepage-editor__banner-actions {
    width: 100%;
  }

  .dev-resource-homepage-editor__banner-actions :deep(.el-button) {
    flex: 1 1 0;
  }
}
</style>
