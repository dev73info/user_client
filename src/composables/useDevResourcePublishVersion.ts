import { ref } from 'vue'

import { TMessage } from 'ui_73info'

import { createMcResourceVersion, type McResourcePayload } from '@/api/mcResources'
import { submitRequirementDelivery } from '@/api/requirements'
import {
  isResourceArchiveLocked,
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
} from '@/shared/resourcePresentation'
import { parseYuanPriceInput } from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'

/** 「发布版本」弹窗提交上来的表单原值；校验与请求都在这里做，弹窗只负责收集。 */
export type ResourceVersionDraftPayload = {
  version: string
  note: string
  file: File | null
  priceYuan?: string
}

/** 资源列表快捷发布弹窗的开关、金额校验、提交与发布后刷新。 */
export function useDevResourcePublishVersion(options: { onPublished?: () => Promise<void> } = {}) {
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

  async function submitVersion({
    version,
    note,
    file,
    priceYuan = '0',
  }: ResourceVersionDraftPayload) {
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

    const price = parseYuanPriceInput(priceYuan)
    if (!price.ok) {
      TMessage.warning(price.message)
      return
    }
    const buyoutFen = Number(selectedResource.value.buyout_price_fen ?? 0)
    if (buyoutFen > 0 && price.fen >= buyoutFen) {
      TMessage.warning('单版本售价必须低于买断价')
      return
    }

    publishingResourceId.value = selectedResource.value.id
    const requirementId = selectedResource.value.requirement_id
    try {
      await createMcResourceVersion(auth.token, selectedResource.value.id, {
        version: version.trim(),
        file,
        note: note.trim() || null,
        price_fen: price.fen,
      })
      if (requirementId) {
        await submitRequirementDelivery(auth.token, requirementId)
      }
      publishDialogVisible.value = false
      try {
        await options.onPublished?.()
      } catch {
        TMessage.warning('新版本已发布，但列表刷新失败，请手动刷新')
      }
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
