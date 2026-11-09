import { ref } from 'vue'

import { HttpError } from '@/api/http'
import {
  updateRequirementResourceVisibility as updateRequirementResourceVisibilityApi,
  type RequirementItem,
} from '@/api/requirements'
import {
  canToggleRequirementResourceVisibility,
  isResourceVisibilityToggleLocked,
  isSelfManagedRequirement,
  nextResourceVisibility,
  RESOURCE_VISIBILITY_CLAIM_HINT,
} from '@/shared/requirementRowRules'

import { TMessage } from 'ui_73info'

/**
 * 需求行上「关联资源公开 / 私有」的切换（从 `useRequirementRowOperations` 拆出的独立动作）。
 *
 * 未转为我的资源前后端拒绝对交付资源设公开（409），前端按同一判据禁用并给状态提示；
 * 「设为私有」任何时候都放行。
 */
export function useRequirementResourceVisibilityToggle(options: {
  token: () => string
  isAuthed: () => boolean
  reload: () => Promise<void>
}) {
  const resourceVisibilityLoadingId = ref<string | null>(null)

  async function toggleRequirementResourceVisibility(item: RequirementItem) {
    if (!options.isAuthed() || item.bound_resource_id == null) {
      return
    }

    if (!canToggleRequirementResourceVisibility(item)) {
      TMessage.warning(
        isSelfManagedRequirement(item)
          ? '需求完成后才能设置资源为公开或私有'
          : '需求必须在已付尾款后，才能设置资源为公开或私有',
      )
      return
    }

    // 未 claim 时后端拒绝把交付资源设为公开（409）；私有仍然放行。
    if (isResourceVisibilityToggleLocked(item)) {
      TMessage.warning(RESOURCE_VISIBILITY_CLAIM_HINT)
      return
    }

    const visibility = nextResourceVisibility(item)
    resourceVisibilityLoadingId.value = item.requirement_id
    try {
      await updateRequirementResourceVisibilityApi(options.token(), item.requirement_id, {
        visibility,
      })
      TMessage.success(visibility === 'public' ? '关联资源已提交公开审核' : '关联资源已设为私有')
      await options.reload()
    } catch (err) {
      // 状态冲突（未 claim 却要公开）是状态型提示，后端中文原文优先，不吞错也不当系统错误。
      if (err instanceof HttpError && err.status === 409) {
        TMessage.warning(err.message || RESOURCE_VISIBILITY_CLAIM_HINT)
      } else {
        TMessage.error(err instanceof Error ? err.message : '更新资源可见性失败')
      }
    } finally {
      resourceVisibilityLoadingId.value = null
    }
  }

  return { resourceVisibilityLoadingId, toggleRequirementResourceVisibility }
}
