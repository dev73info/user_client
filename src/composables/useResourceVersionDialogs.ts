import { ref, type Ref } from 'vue'

import {
  createMcResourceVersion,
  deleteMcResourceVersion,
  updateMcResourceVersion,
  type McResourcePayload,
  type McResourceVersionPayload,
} from '@/api/mcResources'
import { submitRequirementDelivery } from '@/api/requirements'
import {
  isResourceArchiveLocked,
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
} from '@/shared/resourcePresentation'
import { useAuthStore } from '@/stores/auth'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

import { TMessage } from 'ui_73info'

/** 发布 / 编辑版本弹窗提交上来的表单原值；校验、富文本清洗与请求都在这里做。 */
export type ResourceVersionSubmitPayload = {
  version: string
  note: string
  file: File | null
}

/**
 * 「版本管理」页三个弹窗的编排：发布版本、编辑版本、删除版本（删除在有关联需求时走审核）。
 *
 * 表单草稿（版本号 / 备注 / 文件选择 / 富文本编辑器）留在各自的弹窗组件里——它们只碰 DOM；
 * 这里只管开关、校验顺序、请求实参与提示文案，成功后再回刷整页。
 */
export function useResourceVersionDialogs(deps: {
  resource: Ref<McResourcePayload | null>
  versionRows: Ref<McResourceVersionPayload[]>
  loadPage: () => Promise<void>
}) {
  const auth = useAuthStore()

  /* === 发布版本 === */
  const createVersionDialogVisible = ref(false)
  const publishing = ref(false)

  function openCreateVersionDialog() {
    if (deps.resource.value && isResourceArchiveLocked(deps.resource.value)) {
      TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
      return
    }

    createVersionDialogVisible.value = true
  }

  async function submitVersion({ version, note, file }: ResourceVersionSubmitPayload) {
    if (!auth.token || !deps.resource.value) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }

    if (isResourceArchiveLocked(deps.resource.value)) {
      TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
      return
    }

    if (!version.trim()) {
      TMessage.warning('请填写版本号')
      return
    }

    if (!file) {
      TMessage.warning('请选择资源文件')
      return
    }

    publishing.value = true
    const requirementId = deps.resource.value.requirement_id
    try {
      await createMcResourceVersion(auth.token, deps.resource.value.id, {
        version: version.trim(),
        file,
        note: sanitizeRichHtml(note.trim()) || null,
      })
      if (requirementId) {
        await submitRequirementDelivery(auth.token, requirementId)
      }
      createVersionDialogVisible.value = false
      await deps.loadPage()
      TMessage.success(requirementId ? '交付版本已提交，等待客户验收' : '新版本已发布')
    } catch (error) {
      const message = error instanceof Error ? error.message : '发布新版本失败'
      TMessage.error(message)
    } finally {
      publishing.value = false
    }
  }

  /* === 编辑版本 === */
  const editingVersion = ref<McResourceVersionPayload | null>(null)
  const editVersionDialogVisible = ref(false)
  const savingVersionId = ref<number | null>(null)

  function openEditVersionDialog(version: McResourceVersionPayload) {
    if (deps.resource.value && isResourceArchiveLocked(deps.resource.value)) {
      TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
      return
    }

    editingVersion.value = version
    editVersionDialogVisible.value = true
  }

  async function submitVersionEdit({ version, note, file }: ResourceVersionSubmitPayload) {
    if (!auth.token || !deps.resource.value || !editingVersion.value) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }

    if (isResourceArchiveLocked(deps.resource.value)) {
      TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
      return
    }

    if (!version.trim()) {
      TMessage.warning('请填写版本号')
      return
    }

    savingVersionId.value = editingVersion.value.id
    try {
      const updated = await updateMcResourceVersion(
        auth.token,
        deps.resource.value.id,
        editingVersion.value.id,
        {
          version: version.trim(),
          note: sanitizeRichHtml(note.trim()) || null,
          file: file ?? undefined,
        },
      )

      deps.versionRows.value = deps.versionRows.value.map((item) =>
        item.id === updated.id ? updated : item,
      )
      editingVersion.value = null
      editVersionDialogVisible.value = false
      await deps.loadPage()
      TMessage.success('版本信息已更新')
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新版本失败'
      TMessage.error(message)
    } finally {
      savingVersionId.value = null
    }
  }

  /* === 删除版本 === */
  const deleteVersionTarget = ref<McResourceVersionPayload | null>(null)
  const deleteVersionDialogVisible = ref(false)
  const deletingVersionId = ref<number | null>(null)

  function openDeleteVersionDialog(version: McResourceVersionPayload) {
    if (!auth.token || !deps.resource.value) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }

    if (isResourceArchiveLocked(deps.resource.value)) {
      TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
      return
    }

    if (version.delete_request_status === 'pending') {
      TMessage.warning('该版本删除审核已提交，等待用户处理')
      return
    }

    deleteVersionTarget.value = version
    deleteVersionDialogVisible.value = true
  }

  function closeDeleteVersionDialog() {
    if (deletingVersionId.value != null) {
      return
    }

    deleteVersionDialogVisible.value = false
    deleteVersionTarget.value = null
  }

  async function removeVersion() {
    if (!auth.token || !deps.resource.value || !deleteVersionTarget.value) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }

    if (isResourceArchiveLocked(deps.resource.value)) {
      TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
      return
    }

    const version = deleteVersionTarget.value

    deletingVersionId.value = version.id
    try {
      await deleteMcResourceVersion(auth.token, deps.resource.value.id, version.id)
      await deps.loadPage()
      if (deps.resource.value.requirement_id) {
        TMessage.success('版本删除申请已提交，等待用户审核')
      } else {
        deps.versionRows.value = deps.versionRows.value.filter((item) => item.id !== version.id)
        if (editingVersion.value?.id === version.id) {
          editingVersion.value = null
          editVersionDialogVisible.value = false
        }
        TMessage.success('版本已删除')
      }
      deleteVersionDialogVisible.value = false
      deleteVersionTarget.value = null
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : deps.resource.value.requirement_id
            ? '提交版本删除审核失败'
            : '删除版本失败'
      TMessage.error(message)
    } finally {
      deletingVersionId.value = null
    }
  }

  return {
    createVersionDialogVisible,
    publishing,
    openCreateVersionDialog,
    submitVersion,
    editingVersion,
    editVersionDialogVisible,
    savingVersionId,
    openEditVersionDialog,
    submitVersionEdit,
    deleteVersionTarget,
    deleteVersionDialogVisible,
    deletingVersionId,
    openDeleteVersionDialog,
    closeDeleteVersionDialog,
    removeVersion,
  }
}
