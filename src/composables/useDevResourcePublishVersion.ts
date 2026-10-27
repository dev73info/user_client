import { ref } from 'vue'

import { TMessage } from 'ui_73info'

import { createMcResourceVersion, type McResourcePayload } from '@/api/mcResources'
import { submitRequirementDelivery } from '@/api/requirements'
import {
  isResourceArchiveLocked,
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
} from '@/shared/resourcePresentation'
import { useAuthStore } from '@/stores/auth'

/** 「发布版本」弹窗提交上来的表单原值；校验与请求都在这里做，弹窗只负责收集。 */
export type ResourceVersionDraftPayload = {
  version: string
  note: string
  file: File | null
}

/**
 * 资源列表里的「发布版本」弹窗：开关、目标资源与提交。
 *
 * 从 `views/DevResourceListView.vue` 抽出，校验顺序、提示文案与请求实参逐段照搬。
 * 表单草稿（版本号 / 备注 / 文件选择）留在弹窗组件里——它只碰 DOM，不碰接口，
 * 所以组件里能直接用 `useResourceVersionDraft`，这里只管开关与请求。
 */
export function useDevResourcePublishVersion() {
  const auth = useAuthStore()

  const publishDialogVisible = ref(false)
  const selectedResource = ref<McResourcePayload | null>(null)
  const publishingResourceId = ref<number | null>(null)

  function openPublishVersionDialog(resource: McResourcePayload) {
    if (isResourceArchiveLocked(resource)) {
      TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
      return
    }

    selectedResource.value = resource
    publishDialogVisible.value = true
  }

  async function submitVersion({ version, note, file }: ResourceVersionDraftPayload) {
    if (!auth.token || !selectedResource.value) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }

    if (isResourceArchiveLocked(selectedResource.value)) {
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

    publishingResourceId.value = selectedResource.value.id
    const requirementId = selectedResource.value.requirement_id
    try {
      await createMcResourceVersion(auth.token, selectedResource.value.id, {
        version: version.trim(),
        file,
        note: note.trim() || null,
      })
      if (requirementId) {
        await submitRequirementDelivery(auth.token, requirementId)
      }
      publishDialogVisible.value = false
      TMessage.success(requirementId ? '交付版本已提交，等待客户验收' : '新版本已发布')
    } catch (error) {
      const message = error instanceof Error ? error.message : '发布新版本失败'
      TMessage.error(message)
    } finally {
      publishingResourceId.value = null
    }
  }

  return {
    publishDialogVisible,
    selectedResource,
    publishingResourceId,
    openPublishVersionDialog,
    submitVersion,
  }
}
