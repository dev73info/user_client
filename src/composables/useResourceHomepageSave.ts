import { ref, type Ref } from 'vue'
import { TMessage } from 'ui_73info'
import {
  updateMcResourceHomepage,
  uploadMcResourceCover,
  type CreateMcResourceTagSelection,
  type McResourcePayload,
} from '@/api/mcResources'
import { useAuthStore } from '@/stores/auth'
import {
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
  isResourceArchiveLocked,
} from '@/shared/resourcePresentation'
import {
  buildHomepagePayload,
  checkHomepageSave,
  type HomepageSaveGuard,
} from '@/shared/resourceHomepageSave'
import type { ResourceHomepageFormState } from '@/shared/resourceHomepageForm'
import type { useResourceTagCatalog } from '@/composables/useResourceTagCatalog'
import type { useResourceApiChannel } from '@/composables/useResourceApiChannel'

/**
 * 本页唯一的写入口：校验 → 上传图标 → PATCH 主页 → 渠道配置。
 *
 * 顺序不能改：主页没存住就谈不上渠道；渠道失败也要留在表单上（它只重发渠道这一半）。
 * 逐条校验与载荷拼装是纯函数（`shared/resourceHomepageSave`），这里只负责上下文相关的拦截
 * （登录态、到期锁定、协议未签、渠道格式）与三类请求的先后。
 */
export function useResourceHomepageSave(options: {
  resource: Ref<McResourcePayload | null>
  form: ResourceHomepageFormState
  isApiKind: Ref<boolean>
  effectiveOriginType: Ref<'original' | 'repost'>
  boundToRequirement: Ref<boolean>
  pointsLockedBySavedCash: Ref<boolean>
  selectedCoverFile: Ref<File | null>
  tagCatalog: Pick<
    ReturnType<typeof useResourceTagCatalog>,
    'platformTagGroups' | 'selectedTagCount' | 'keepSavedTags'
  >
  /** 归类的提交口径（接口资源为空、回落态下回传资源原有归类），由视图统一给。 */
  buildTagSelections: () => CreateMcResourceTagSelection[]
  channel: Pick<
    ReturnType<typeof useResourceApiChannel>,
    | 'needsApiAgreement'
    | 'validateApiChannel'
    | 'saveApiChannelOnly'
    | 'channelRetryOnly'
    | 'revealedSecretPlain'
  >
  /** 保存成功后把服务端返回值回填进表单。 */
  applySavedHomepage: (updated: McResourcePayload) => void
}) {
  const auth = useAuthStore()
  const { resource, form, isApiKind, tagCatalog, channel } = options
  const saving = ref(false)

  async function saveHomepage() {
    if (!auth.token || !resource.value) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }

    // 锁定态只是前置拦截；后端 PATCH 主页接口仍会以 409 + 中文提示兜底。
    if (isResourceArchiveLocked(resource.value)) {
      TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
      return
    }

    if (channel.needsApiAgreement.value) {
      TMessage.warning('请先签署《接口使用协议》后再编辑接口资源')
      return
    }

    const guard: HomepageSaveGuard = {
      title: form.title,
      description: form.description,
      isApiKind: isApiKind.value,
      keepSavedTags: tagCatalog.keepSavedTags.value,
      platformGroupCount: tagCatalog.platformTagGroups.value.length,
      selectedTagCount: tagCatalog.selectedTagCount.value,
      ownershipType: form.ownershipType,
      teamId: form.teamId,
      effectiveOriginType: options.effectiveOriginType.value,
      originUrl: form.originUrl,
      priceYuan: form.priceYuan,
      pricePoints: form.pricePoints,
      promoSharePercent: form.promoSharePercent,
      pointsLockedBySavedCash: options.pointsLockedBySavedCash.value,
      boundToRequirement: options.boundToRequirement.value,
      copyrightDeclared: form.copyrightDeclared,
      visibility: resource.value.visibility,
    }
    const checked = checkHomepageSave(guard)
    if (checked.message) {
      TMessage.warning(checked.message)
      return
    }

    if (!channel.validateApiChannel()) {
      return
    }

    saving.value = true
    try {
      // 资源主页上一轮已保存、只有渠道配置没成功：这一次只重发渠道配置这一半
      if (channel.channelRetryOnly.value && isApiKind.value && resource.value) {
        if (await channel.saveApiChannelOnly(resource.value.id)) {
          TMessage.success('接口资源渠道配置已保存')
        }
        return
      }

      // 后端把 JSON null 视为「未传」，清空封面必须传空串（空串会被规整为 NULL）
      let nextCoverUrl: string | null = form.cover_url.trim()

      if (options.selectedCoverFile.value) {
        const coverUpdated = await uploadMcResourceCover(
          auth.token,
          resource.value.id,
          options.selectedCoverFile.value,
        )
        nextCoverUrl = coverUpdated.cover_url
        form.cover_url = coverUpdated.cover_url || ''
      }

      const updated = await updateMcResourceHomepage(
        auth.token,
        resource.value.id,
        buildHomepagePayload({
          form,
          isApiKind: isApiKind.value,
          effectiveOriginType: options.effectiveOriginType.value,
          tagSelections: options.buildTagSelections(),
          coverUrl: nextCoverUrl,
          priceFen: checked.priceFen,
          pricePoints: checked.pricePoints,
          promoShareBps: checked.promoShareBps,
        }),
      )

      resource.value = updated
      options.applySavedHomepage(updated)

      // R028：资源本身存好了，再 PUT 渠道配置；失败要明确报错并留在表单上（重试只重发这一半）
      if (isApiKind.value && !(await channel.saveApiChannelOnly(updated.id))) {
        return
      }

      TMessage.success(
        updated.visibility === 'review'
          ? '资源主页已保存，已提交重新审核，审核期间前台暂不展示'
          : '资源主页已更新',
      )

      if (channel.revealedSecretPlain.value) {
        TMessage.warning('回调密钥已生成，且只显示这一次，请立即复制保存')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新资源主页失败'
      TMessage.error(message)
    } finally {
      saving.value = false
    }
  }

  return { saving, saveHomepage }
}
