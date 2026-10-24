import { reactive, ref, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  createCommunityPost,
  getCommunityPost,
  updateCommunityPost,
  type CommunityPost,
} from '@/api/community'
import { HttpError } from '@/api/http'
import { getMyRealnameVerification } from '@/api/realname'
import { useComposerFloatingActions } from '@/composables/useComposerFloatingActions'
import { useAuthStore } from '@/stores/auth'
import { sanitizeRichHtml, sanitizeRichHtmlForEditing } from '@/utils/sanitizeHtml'

import { TMessage } from 'ui_73info'

type UseCommunityComposerOptions = {
  /** 当前选中的标签：新帖子默认带上它（改造前就是这么填的）。 */
  selectedTag: Ref<string>
  /** 登录守卫：未登录时会提示并跳登录弹窗，属于视图的路由动作，注入。 */
  ensureAuthed: () => boolean
  /**
   * 保存成功后的收尾：新帖回第 1 页、重取列表、选中刚保存的那篇（都要动视图的列表状态，注入）。
   * 第二个参数说明「这次是新建还是编辑」——面板关掉会清 `editingPost`，视图不能事后自己再判断。
   */
  onSaved: (post: CommunityPost, isEditing: boolean) => Promise<void> | void
}

/**
 * 社区右栏的发帖 / 编辑面板：表单状态、实名门禁、提交、以及**浮动提交条**。
 *
 * 从 `views/CommunityView.vue` 抽出来（同 `useRequirementHallPublish` 的口径：实名门禁、路由跳转、
 * `TMessage` 都在 composable 里，面板组件是纯展示）。
 *
 * 浮动提交条（`ResizeObserver` + window 的 `scroll`/`resize` + 滞回判定 + 两个 `:style` 结果）整块交给
 * `useComposerFloatingActions`：那是同一 scope 里调用的子 composable，监听注册与 `onScopeDispose` 的收尾
 * 在它内部成对出现，本文件只管把「面板开没开」这个 ref 交给它。
 */
export function useCommunityComposer(options: UseCommunityComposerOptions) {
  const router = useRouter()
  const route = useRoute()
  const auth = useAuthStore()

  const composerVisible = ref(false)
  const editingPost = ref<CommunityPost | null>(null)
  const savingPost = ref(false)

  const postForm = reactive({
    title: '',
    tag_names: [] as string[],
    content_html: '',
    origin_type: 'original' as 'original' | 'repost',
    origin_author: '',
    origin_url: '',
    origin_org: '',
    origin_note: '',
    bounty_points: 0,
  })

  // 浮动提交条：监听、量算与收尾都在子 composable 里（同一 scope，宿主卸载即释放）
  const {
    composerActionsShellStyle,
    composerActionsFloating,
    composerActionsFloatingStyle,
    setComposerRef,
  } = useComposerFloatingActions(composerVisible)

  function resetComposer() {
    editingPost.value = null
    postForm.title = ''
    postForm.tag_names = options.selectedTag.value ? [options.selectedTag.value] : []
    postForm.content_html = ''
    postForm.origin_type = 'original'
    postForm.origin_author = ''
    postForm.origin_url = ''
    postForm.origin_org = ''
    postForm.origin_note = ''
    postForm.bounty_points = 0
  }

  /** 发帖门禁：登录 + 实名审核通过。未通过时给出对应去向（登录弹窗 / 实名页）。 */
  async function ensurePostRealnameApproved(): Promise<boolean> {
    auth.hydrate()
    if (!auth.isAuthed) {
      TMessage.warning('发布帖子前请先登录')
      void router.push({ name: 'home', query: { modal: 'auth', redirect_to: '/community' } })
      return false
    }

    try {
      const record = await getMyRealnameVerification(auth.token)
      if (record.status === 'approved') {
        return true
      }

      if (record.status === 'pending') {
        TMessage.warning('实名认证审核中，通过后可发布帖子')
        return false
      }

      TMessage.warning('实名认证未通过，请重新提交后再发布帖子')
      void router.push({
        name: 'workbench-realname',
        query: { redirect_to: route.fullPath || '/community' },
      })
      return false
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        TMessage.warning('发布帖子前请先完成实名认证')
        void router.push({
          name: 'workbench-realname',
          query: { redirect_to: route.fullPath || '/community' },
        })
        return false
      }

      TMessage.error(error instanceof Error ? error.message : '实名认证状态校验失败')
      return false
    }
  }

  async function openCreateComposer() {
    if (!options.ensureAuthed()) {
      return
    }
    const approved = await ensurePostRealnameApproved()
    if (!approved) {
      return
    }
    resetComposer()
    composerVisible.value = true
  }

  async function openEditComposer(post: CommunityPost) {
    if (!options.ensureAuthed()) {
      return
    }
    try {
      const detail = post.content_html ? post : await getCommunityPost(post.id, auth.token)
      editingPost.value = detail
      postForm.title = detail.title
      postForm.tag_names = detail.tags.map((tag) => tag.name)
      postForm.content_html = sanitizeRichHtmlForEditing(detail.content_html)
      postForm.origin_type = detail.origin_type
      postForm.origin_author = detail.origin_author ?? ''
      postForm.origin_url = detail.origin_url ?? ''
      postForm.origin_org = detail.origin_org ?? ''
      postForm.origin_note = detail.origin_note ?? ''
      composerVisible.value = true
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载帖子详情失败')
    }
  }

  function closeComposer() {
    composerVisible.value = false
    resetComposer()
  }

  async function submitPost() {
    if (!options.ensureAuthed() || savingPost.value) {
      return
    }

    const isEditing = Boolean(editingPost.value)
    if (!isEditing) {
      const approved = await ensurePostRealnameApproved()
      if (!approved) {
        return
      }
    }

    if (postForm.origin_type === 'repost' && !postForm.origin_url.trim()) {
      TMessage.warning('转载帖子必须填写原始出处链接')
      return
    }

    savingPost.value = true
    try {
      const editingId = editingPost.value?.id
      const baseline = {
        title: postForm.title.trim(),
        tag_names: postForm.tag_names.map((tag) => tag.trim()).filter(Boolean),
        content_html: sanitizeRichHtml(postForm.content_html),
        origin_type: postForm.origin_type,
        origin_author: postForm.origin_author.trim() || null,
        origin_url: postForm.origin_url.trim() || null,
        origin_org: postForm.origin_org.trim() || null,
        origin_note: postForm.origin_note.trim() || null,
      }
      // 悬赏积分仅在发帖时提交（编辑不改变悬赏）。
      const payload = isEditing
        ? baseline
        : { ...baseline, bounty_points: Math.max(0, Math.trunc(postForm.bounty_points || 0)) }
      const saved =
        isEditing && editingId
          ? await updateCommunityPost(auth.token, editingId, payload)
          : await createCommunityPost(auth.token, payload)

      // 顺序与改造前一致：先重取列表并选中，再收起面板（收起会清空表单）。
      await options.onSaved(saved, isEditing)
      closeComposer()
      TMessage.success(isEditing ? '帖子已更新，等待审核' : '帖子已提交审核')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '保存帖子失败')
    } finally {
      savingPost.value = false
    }
  }

  return {
    composerVisible,
    editingPost,
    savingPost,
    postForm,
    composerActionsShellStyle,
    composerActionsFloating,
    composerActionsFloatingStyle,
    setComposerRef,
    openCreateComposer,
    openEditComposer,
    closeComposer,
    submitPost,
  }
}
