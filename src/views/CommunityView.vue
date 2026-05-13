<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import Link from '@tiptap/extension-link'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import {
  ChatDotRound,
  Close,
  EditPen,
  Plus,
  Refresh,
  Star,
  StarFilled,
} from '@element-plus/icons-vue'

import { apiUrl } from '@/api/http'
import {
  createCommunityComment,
  createCommunityPost,
  likeCommunityPost,
  listCommunityComments,
  listCommunityPosts,
  listCommunityTags,
  unlikeCommunityPost,
  updateCommunityPost,
  type CommunityComment,
  type CommunityPost,
  type CommunityTag,
} from '@/api/community'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
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

const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const posts = ref<CommunityPost[]>([])
const tags = ref<CommunityTag[]>([])
const selectedPost = ref<CommunityPost | null>(null)
const comments = ref<CommunityComment[]>([])
const selectedTag = ref('')
const loading = ref(false)
const commentsLoading = ref(false)
const savingPost = ref(false)
const sendingComment = ref(false)
const composerVisible = ref(false)
const editingPost = ref<CommunityPost | null>(null)
const commentDraft = ref('')

const postForm = reactive({
  title: '',
  tag_names: [] as string[],
  content_html: '',
})

const toolbarActions: Array<{ label: string; action: ToolbarAction; title: string }> = [
  { label: 'B', action: 'bold', title: '加粗' },
  { label: 'I', action: 'italic', title: '斜体' },
  { label: 'U', action: 'underline', title: '下划线' },
  { label: 'H2', action: 'h2', title: '二级标题' },
  { label: 'H3', action: 'h3', title: '三级标题' },
  { label: '列表', action: 'bullet', title: '无序列表' },
  { label: '编号', action: 'ordered', title: '有序列表' },
  { label: '引用', action: 'blockquote', title: '引用' },
  { label: '</>', action: 'code', title: '代码块' },
]

const editor = useEditor({
  content: '<p></p>',
  extensions: [
    StarterKit.configure({
      heading: {
        levels: [2, 3],
      },
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
      class: 'community-editor__surface',
    },
  },
  onUpdate: (payload: any) => {
    const currentEditor = payload.editor as { getText: () => string; getHTML: () => string }
    postForm.content_html = currentEditor.getText().trim()
      ? sanitizeRichHtml(currentEditor.getHTML())
      : ''
  },
})

const currentPostContent = computed(() =>
  selectedPost.value?.content_html ? sanitizeRichHtml(selectedPost.value.content_html) : '',
)

const tagOptions = computed(() => tags.value.map((tag) => tag.name))
const canEditSelectedPost = computed(() =>
  Boolean(auth.isAuthed && selectedPost.value && selectedPost.value.author === auth.username),
)

function avatarInitial(name?: string | null): string {
  return Array.from(name?.trim() || '用')[0] ?? '用'
}

function commentAvatarSrc(comment: CommunityComment): string {
  const avatarUrl = comment.commenter_avatar_url?.trim()
  return avatarUrl ? apiUrl(avatarUrl) : ''
}

function handleCommentAvatarError(comment: CommunityComment) {
  comment.commenter_avatar_url = null
}

onMounted(() => {
  auth.hydrate()
  void loadCommunityData()
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

async function loadCommunityData() {
  loading.value = true
  try {
    const [nextTags, nextPosts] = await Promise.all([
      listCommunityTags(),
      listCommunityPosts({ token: auth.token, tag: selectedTag.value, limit: 30 }),
    ])
    tags.value = nextTags
    posts.value = nextPosts
    selectPost(nextPosts[0] ?? null)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载社区内容失败', 'error')
  } finally {
    loading.value = false
  }
}

async function loadPostsForTag(tagName = selectedTag.value) {
  loading.value = true
  try {
    const nextPosts = await listCommunityPosts({ token: auth.token, tag: tagName, limit: 30 })
    posts.value = nextPosts
    selectPost(nextPosts[0] ?? null)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载社区帖子失败', 'error')
  } finally {
    loading.value = false
  }
}

function selectTag(tagName: string) {
  selectedTag.value = selectedTag.value === tagName ? '' : tagName
  void loadPostsForTag(selectedTag.value)
}

function selectPost(post: CommunityPost | null) {
  selectedPost.value = post
  commentDraft.value = ''
  if (post) {
    void loadComments(post.id)
  } else {
    comments.value = []
  }
}

async function loadComments(postId: number) {
  commentsLoading.value = true
  try {
    comments.value = await listCommunityComments(postId)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载评论失败', 'error')
  } finally {
    commentsLoading.value = false
  }
}

function ensureAuthed(): boolean {
  auth.hydrate()
  if (auth.isAuthed) {
    return true
  }
  showToast('请先登录后再操作社区内容', 'warning')
  void router.push({ name: 'home', query: { modal: 'auth', redirect_to: '/community' } })
  return false
}

function resetComposer() {
  editingPost.value = null
  postForm.title = ''
  postForm.tag_names = selectedTag.value ? [selectedTag.value] : []
  postForm.content_html = ''
  editor.value?.commands.setContent('<p></p>', { emitUpdate: false })
}

function openCreateComposer() {
  if (!ensureAuthed()) {
    return
  }
  resetComposer()
  composerVisible.value = true
}

function openEditComposer(post: CommunityPost) {
  if (!ensureAuthed()) {
    return
  }
  editingPost.value = post
  postForm.title = post.title
  postForm.tag_names = post.tags.map((tag) => tag.name)
  postForm.content_html = sanitizeRichHtml(post.content_html)
  editor.value?.commands.setContent(postForm.content_html || '<p></p>', { emitUpdate: false })
  composerVisible.value = true
}

function closeComposer() {
  composerVisible.value = false
  resetComposer()
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

async function submitPost() {
  if (!ensureAuthed() || savingPost.value) {
    return
  }

  savingPost.value = true
  try {
    const isEditing = Boolean(editingPost.value)
    const editingId = editingPost.value?.id
    const payload = {
      title: postForm.title.trim(),
      tag_names: postForm.tag_names.map((tag) => tag.trim()).filter(Boolean),
      content_html: sanitizeRichHtml(postForm.content_html),
    }
    const saved =
      isEditing && editingId
        ? await updateCommunityPost(auth.token, editingId, payload)
        : await createCommunityPost(auth.token, payload)

    await Promise.all([loadCommunityData(), loadComments(saved.id)])
    selectPost(saved)
    closeComposer()
    showToast(isEditing ? '帖子已更新' : '帖子已发布', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '保存帖子失败', 'error')
  } finally {
    savingPost.value = false
  }
}

function updateSelectedPost(patch: Partial<CommunityPost>) {
  if (!selectedPost.value) {
    return
  }
  const postId = selectedPost.value.id
  posts.value = posts.value.map((post) => (post.id === postId ? { ...post, ...patch } : post))
  selectedPost.value = { ...selectedPost.value, ...patch }
}

async function toggleLike(post: CommunityPost) {
  if (!ensureAuthed()) {
    return
  }

  try {
    const state = post.liked_by_me
      ? await unlikeCommunityPost(auth.token, post.id)
      : await likeCommunityPost(auth.token, post.id)
    posts.value = posts.value.map((item) =>
      item.id === post.id
        ? { ...item, liked_by_me: state.liked_by_me, like_count: state.like_count }
        : item,
    )
    if (selectedPost.value?.id === post.id) {
      updateSelectedPost({ liked_by_me: state.liked_by_me, like_count: state.like_count })
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '点赞失败', 'error')
  }
}

async function submitComment() {
  if (!selectedPost.value || !ensureAuthed() || sendingComment.value) {
    return
  }

  sendingComment.value = true
  try {
    const created = await createCommunityComment(
      auth.token,
      selectedPost.value.id,
      commentDraft.value,
    )
    comments.value = [...comments.value, created]
    updateSelectedPost({ comment_count: (selectedPost.value.comment_count ?? 0) + 1 })
    commentDraft.value = ''
    showToast('评论已发布', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '发表评论失败', 'error')
  } finally {
    sendingComment.value = false
  }
}
</script>

<template>
  <main class="portal-page portal-page--nav community-page">
    <section class="community-board">
      <section class="community-stream">
        <div class="community-hero">
          <div>
            <p class="portal-page__eyebrow">社区内容</p>
            <h2>开发者与用户帖子</h2>
            <p>沉淀公告、经验、资源维护与需求协作记录。</p>
          </div>
          <div class="community-hero__actions">
            <button class="community-hero__button community-hero__button--ghost" type="button" :disabled="loading"
              @click="loadCommunityData">
              <el-icon :class="{ 'is-spinning': loading }">
                <Refresh />
              </el-icon>
              <span>{{ loading ? '刷新中' : '刷新' }}</span>
            </button>
            <button class="community-hero__button community-hero__button--primary" type="button"
              @click="openCreateComposer">
              <el-icon>
                <Plus />
              </el-icon>
              <span>发布帖子</span>
            </button>
          </div>
        </div>

        <div class="community-tag-row">
          <button class="community-tag" :class="{ 'is-active': !selectedTag }" type="button" @click="selectTag('')">
            全部
          </button>
          <button v-for="tag in tags" :key="tag.id" class="community-tag"
            :class="{ 'is-active': selectedTag === tag.name }" type="button" @click="selectTag(tag.name)">
            {{ tag.name }}
          </button>
        </div>

        <div v-if="loading" class="community-empty">社区内容加载中</div>
        <div v-else-if="posts.length === 0" class="community-empty">
          <strong>暂无帖子</strong>
          <span>成为第一位发布内容的人。</span>
        </div>
        <div v-else class="community-post-list">
          <article v-for="post in posts" :key="post.id" class="community-post-card"
            :class="{ 'is-active': selectedPost?.id === post.id }" @click="selectPost(post)">
            <div class="community-post-card__head">
              <div>
                <h3>{{ post.title }}</h3>
                <p>{{ post.author }} · {{ post.published_at }}</p>
              </div>
              <span>{{ post.like_count }} 赞</span>
            </div>
            <div class="community-post-card__tags">
              <span v-for="tag in post.tags" :key="tag.id">{{ tag.name }}</span>
            </div>
            <div class="community-post-card__meta">
              <span>{{ post.comment_count }} 条评论</span>
              <span>更新 {{ post.updated_at }}</span>
            </div>
          </article>
        </div>
      </section>

      <aside class="community-detail">
        <section v-if="composerVisible" class="community-panel community-composer">
          <div class="community-panel__head">
            <div>
              <p class="portal-page__eyebrow">{{ editingPost ? '编辑帖子' : '发布帖子' }}</p>
              <h3>{{ editingPost ? '更新社区内容' : '写一篇新帖子' }}</h3>
            </div>
            <el-button class="community-panel-action" plain @click="closeComposer">
              <el-icon>
                <Close />
              </el-icon>
              <span>取消</span>
            </el-button>
          </div>

          <el-form label-position="top" class="community-form">
            <el-form-item label="标题">
              <el-input v-model="postForm.title" maxlength="80" show-word-limit placeholder="写一个清楚的标题" />
            </el-form-item>
            <el-form-item label="标签">
              <el-select v-model="postForm.tag_names" multiple filterable allow-create default-first-option
                placeholder="选择或输入标签">
                <el-option v-for="tag in tagOptions" :key="tag" :label="tag" :value="tag" />
              </el-select>
            </el-form-item>
          </el-form>

          <div class="community-editor">
            <div class="community-editor__toolbar">
              <button v-for="item in toolbarActions" :key="item.action" class="community-editor__tool"
                :class="{ 'is-active': isToolbarActive(item.action) }" type="button" :title="item.title"
                @click="runToolbarAction(item.action)">
                {{ item.label }}
              </button>
              <button class="community-editor__tool" type="button" title="插入链接" @click="toggleLink">
                链接
              </button>
              <button class="community-editor__tool" type="button" title="清除格式" @click="clearFormatting">
                清除
              </button>
            </div>
            <EditorContent v-if="editor" :editor="editor" />
          </div>

          <div class="community-composer__actions">
            <el-button class="community-submit-button" type="primary" :loading="savingPost" @click="submitPost">
              {{ editingPost ? '保存修改' : '发布帖子' }}
            </el-button>
          </div>
        </section>

        <section v-else-if="selectedPost" class="community-panel community-post-detail">
          <div class="community-detail__header">
            <div>
              <div class="community-post-card__tags">
                <span v-for="tag in selectedPost.tags" :key="tag.id">{{ tag.name }}</span>
              </div>
              <h2>{{ selectedPost.title }}</h2>
              <p>
                {{ selectedPost.author }} 发布于 {{ selectedPost.published_at }} · 更新
                {{ selectedPost.updated_at }}
              </p>
            </div>
            <el-button v-if="canEditSelectedPost" class="community-panel-action" plain
              @click="openEditComposer(selectedPost)">
              <el-icon>
                <EditPen />
              </el-icon>
              <span>编辑</span>
            </el-button>
          </div>

          <article class="community-rich-text" v-html="currentPostContent"></article>

          <div class="community-actions">
            <el-button class="community-like-button" :class="{ 'is-liked': selectedPost.liked_by_me }"
              :type="selectedPost.liked_by_me ? 'primary' : 'default'" @click="toggleLike(selectedPost)">
              <el-icon>
                <component :is="selectedPost.liked_by_me ? StarFilled : Star" />
              </el-icon>
              <span>{{ selectedPost.liked_by_me ? '已点赞' : '点赞' }}</span>
              <strong>{{ selectedPost.like_count }}</strong>
            </el-button>
            <span class="community-action-stat">
              <el-icon>
                <ChatDotRound />
              </el-icon>
              {{ selectedPost.comment_count }} 条评论
            </span>
          </div>

          <section class="community-comments">
            <div class="community-comments__head">
              <h3>评论</h3>
              <span v-if="commentsLoading">加载中</span>
            </div>

            <div class="community-comment-box">
              <el-input v-model="commentDraft" type="textarea" :rows="3" maxlength="800" show-word-limit
                placeholder="说点具体的想法或补充" />
              <el-button class="community-submit-button community-comment-submit" type="primary"
                :loading="sendingComment" @click="submitComment">
                发表评论
              </el-button>
            </div>

            <div v-if="comments.length === 0" class="community-empty community-empty--compact">
              暂无评论
            </div>
            <ul v-else class="community-comment-list">
              <li v-for="comment in comments" :key="comment.id" class="community-comment-item">
                <div class="community-comment-item__avatar">
                  <img v-if="commentAvatarSrc(comment)" :src="commentAvatarSrc(comment)"
                    :alt="`${comment.commenter} 的头像`" @error="handleCommentAvatarError(comment)" />
                  <span v-else>{{ avatarInitial(comment.commenter) }}</span>
                </div>
                <div>
                  <strong>{{ comment.commenter }}</strong>
                  <p>{{ comment.comment_text }}</p>
                  <time>{{ comment.created_at }}</time>
                </div>
              </li>
            </ul>
          </section>
        </section>

        <section v-else class="community-panel community-empty">
          <strong>选择一篇帖子查看详情</strong>
          <span>也可以直接发布新的社区内容。</span>
        </section>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.community-board {
  display: grid;
  grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.community-stream,
.community-panel {
  min-width: 0;
  border: 1px solid rgba(198, 210, 236, 0.72);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 10px 24px rgba(90, 120, 180, 0.08);
}

.community-stream,
.community-panel {
  padding: 14px;
}

.community-detail {
  position: sticky;
  top: 76px;
  min-width: 0;
}

.community-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 0 0 14px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.86);
}

.community-hero h2,
.community-panel h2,
.community-panel h3,
.community-post-card h3 {
  margin: 0;
  color: #0f172a;
}

.community-hero h2 {
  margin-top: 4px;
  font-size: 22px;
  line-height: 1.25;
}

.community-hero p,
.community-detail__header p,
.community-post-card p,
.community-post-card__meta,
.community-actions,
.community-empty,
.community-comment-item time {
  color: #64748b;
  line-height: 1.7;
}

.community-hero p {
  max-width: 320px;
  margin: 6px 0 0;
  font-size: 14px;
}

.community-hero__actions,
.community-panel__head,
.community-detail__header,
.community-comments__head,
.community-actions,
.community-composer__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.community-hero__actions {
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.community-hero__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 9px;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    opacity 160ms ease,
    transform 160ms ease;
}

.community-hero__button--ghost {
  border-color: rgba(191, 219, 254, 0.96);
  background: rgba(239, 246, 255, 0.82);
  color: #2563eb;
}

.community-hero__button--ghost:hover:not(:disabled) {
  border-color: rgba(37, 99, 235, 0.34);
  background: rgba(219, 234, 254, 0.92);
}

.community-hero__button--primary {
  background: #2563eb;
  color: #fff;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18);
}

.community-hero__button--primary:hover:not(:disabled) {
  background: #1d4ed8;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.22);
  transform: translateY(-1px);
}

.community-hero__button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.community-hero__button .el-icon {
  font-size: 15px;
}

.community-hero__button .el-icon.is-spinning {
  animation: community-spin 900ms linear infinite;
}

@keyframes community-spin {
  to {
    transform: rotate(360deg);
  }
}

.community-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.78);
}

.community-tag {
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid rgba(219, 234, 254, 0.92);
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.76);
  color: #1d4ed8;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
}

.community-tag.is-active {
  background: #2563eb;
  color: #fff;
}

.community-post-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.community-post-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    transform 140ms ease;
}

.community-post-card:hover,
.community-post-card.is-active {
  border-color: rgba(37, 99, 235, 0.48);
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.09);
  transform: translateY(-1px);
}

.community-post-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.community-post-card__head h3 {
  margin-bottom: 6px;
  font-size: 16px;
  line-height: 1.35;
}

.community-post-card__head span {
  flex-shrink: 0;
  color: #2563eb;
  font-size: 13px;
  font-weight: 800;
}

.community-post-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.community-post-card__tags span {
  display: inline-flex;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.9);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
}

.community-post-card__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 12px;
  font-size: 13px;
}

.community-panel__head,
.community-detail__header {
  margin-bottom: 14px;
}

.community-detail__header {
  align-items: flex-start;
}

.community-panel-action.el-button,
.community-submit-button.el-button {
  min-height: 34px;
  height: 34px;
  padding: 0 13px;
  border-radius: 9px;
  font-weight: 800;
  line-height: 1;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.community-panel-action.el-button {
  border-color: rgba(191, 219, 254, 0.96);
  background: rgba(248, 250, 252, 0.96);
  color: #2563eb;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.06);
}

.community-panel-action.el-button:hover,
.community-panel-action.el-button:focus-visible {
  border-color: rgba(37, 99, 235, 0.4);
  background: rgba(239, 246, 255, 0.98);
  color: #1d4ed8;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.1);
  transform: translateY(-1px);
}

.community-submit-button.el-button {
  min-height: 36px;
  height: 36px;
  padding: 0 16px;
  border-color: rgba(37, 99, 235, 0.88);
  background: #2563eb;
  color: #fff;
  box-shadow: 0 9px 20px rgba(37, 99, 235, 0.18);
}

.community-submit-button.el-button:hover,
.community-submit-button.el-button:focus-visible {
  border-color: #1d4ed8;
  background: #1d4ed8;
  color: #fff;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.22);
  transform: translateY(-1px);
}

.community-submit-button.el-button.is-loading {
  transform: none;
}

.community-panel-action.el-button :deep(span),
.community-submit-button.el-button :deep(span) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.community-panel-action.el-button :deep(.el-icon) {
  font-size: 14px;
}

.community-detail__header h2 {
  margin: 12px 0 8px;
  font-size: clamp(22px, 2vw, 28px);
  line-height: 1.2;
}

.community-form {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.8fr);
  gap: 0 14px;
}

.community-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.community-form :deep(.el-select) {
  width: 100%;
}

.community-editor {
  overflow: hidden;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 12px;
  background: #fff;
}

.community-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 9px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.86);
  background: rgba(248, 250, 252, 0.92);
}

.community-editor__tool {
  min-height: 28px;
  padding: 4px 9px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 8px;
  background: #fff;
  color: #334155;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
}

.community-editor__tool.is-active {
  border-color: #2563eb;
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
}

.community-editor :deep(.community-editor__surface) {
  min-height: clamp(240px, 36vh, 420px);
  padding: 14px;
  color: #1e293b;
  line-height: 1.75;
  outline: none;
}

.community-editor :deep(.community-editor__surface p),
.community-editor :deep(.community-editor__surface ul),
.community-editor :deep(.community-editor__surface ol) {
  margin: 0 0 12px;
  color: #334155;
}

.community-editor :deep(.community-editor__surface p:last-child),
.community-editor :deep(.community-editor__surface ul:last-child),
.community-editor :deep(.community-editor__surface ol:last-child) {
  margin-bottom: 0;
}

.community-editor :deep(.community-editor__surface a) {
  color: #2563eb;
}

.community-composer__actions {
  justify-content: flex-end;
  margin-top: 14px;
}

.community-rich-text {
  padding: 6px 0 18px;
  color: #1e293b;
  line-height: 1.75;
}

.community-rich-text :deep(h2),
.community-rich-text :deep(h3) {
  margin: 18px 0 10px;
  color: #0f172a;
}

.community-rich-text :deep(p),
.community-rich-text :deep(ul),
.community-rich-text :deep(ol),
.community-rich-text :deep(blockquote) {
  margin: 0 0 12px;
  color: #334155;
}

.community-rich-text :deep(a) {
  color: #2563eb;
}

.community-rich-text :deep(pre) {
  overflow: auto;
  padding: 14px;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
}

.community-rich-text :deep(blockquote) {
  padding-left: 14px;
  border-left: 3px solid #bfdbfe;
  color: #475569;
}

.community-actions {
  justify-content: flex-start;
  padding: 12px;
  border: 1px solid rgba(219, 234, 254, 0.86);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.72);
}

.community-like-button.el-button {
  min-width: 108px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(37, 99, 235, 0.28);
  border-radius: 999px;
  background: #fff;
  color: #1d4ed8;
  font-weight: 800;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
}

.community-like-button.el-button:hover,
.community-like-button.el-button:focus-visible {
  border-color: rgba(37, 99, 235, 0.5);
  background: rgba(239, 246, 255, 0.96);
  color: #1d4ed8;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.14);
}

.community-like-button.el-button.is-liked {
  border-color: transparent;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.22);
}

.community-like-button.el-button :deep(span) {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.community-like-button :deep(.el-icon) {
  font-size: 15px;
}

.community-like-button strong {
  display: inline-grid;
  min-width: 20px;
  height: 20px;
  place-items: center;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 12px;
  line-height: 1;
}

.community-like-button.is-liked strong {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.community-action-stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  background: #fff;
  color: #475569;
  font-size: 13px;
  font-weight: 800;
}

.community-action-stat .el-icon {
  color: #2563eb;
  font-size: 15px;
}

.community-comments {
  padding-top: 16px;
}

.community-comments__head {
  margin-bottom: 12px;
}

.community-comment-box {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}

.community-comment-box .el-button {
  justify-self: flex-end;
}

.community-comment-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.community-comment-item {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 12px;
}

.community-comment-item__avatar {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
  font-weight: 900;
}

.community-comment-item__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.community-comment-item strong {
  color: #0f172a;
}

.community-comment-item p {
  margin: 6px 0;
  color: #334155;
  line-height: 1.65;
}

.community-empty {
  display: flex;
  min-height: 112px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  padding: 18px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.92);
}

.community-empty--compact {
  min-height: 72px;
}

.community-empty strong {
  color: #0f172a;
}

@media (max-width: 920px) {
  .community-board {
    grid-template-columns: 1fr;
  }

  .community-detail {
    position: static;
  }

  .community-form {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {

  .community-hero,
  .community-post-card__head,
  .community-detail__header,
  .community-panel__head,
  .community-post-card__meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .community-hero__actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .community-hero__button {
    flex: 1 1 132px;
  }

  .community-hero p {
    max-width: none;
  }
}
</style>
