import { computed, ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'
import {
  createMcResource,
  getMcResource,
  submitMcResourceReview,
  updateResourceApiChannel,
  uploadMcResourceCover,
  type McResourcePayload,
} from '@/api/mcResources'
import { useAuthStore } from '@/stores/auth'
import type { useResourceInitForm } from '@/composables/useResourceInitForm'
import type { useResourceTagCatalog } from '@/composables/useResourceTagCatalog'
import type { useResourceApiChannel } from '@/composables/useResourceApiChannel'

/**
 * 「发布资源」创建页的提交链路：必填读数（提交按钮的状态文案）、保存顺序、失败重试锚点。
 *
 * 先创建资源并取得 resource_id，再补图标与接口渠道。普通公开申请直接送审；
 * 单版本先进入首版发布，首版成功后再送审。已建资源是失败重试锚点，不会重复创建。
 */
export function useResourceInitSubmit(options: {
  formState: ReturnType<typeof useResourceInitForm>
  tagCatalog: ReturnType<typeof useResourceTagCatalog>
  channel: ReturnType<typeof useResourceApiChannel>
  /** 建好的资源：既是「别重复创建」的锚点，也是接入提示词里资源编号的来源。 */
  createdResource: Ref<McResourcePayload | null>
}) {
  const { formState, tagCatalog, channel, createdResource } = options
  const auth = useAuthStore()
  const router = useRouter()

  const { form, isApiKind, effectiveOriginType, resourceSummary, parsedPromoShare } = formState
  const submitting = ref(false)

  /** 提交按钮为什么还不可点；空串 = 可以提交。 */
  const submitBlockReason = computed(() => {
    if (channel.needsApiAgreement.value) {
      return '请先签署《接口使用协议》'
    }

    if (!form.title.trim()) {
      return '请填写资源标题'
    }

    if (!form.author.trim()) {
      return '请填写作者名称'
    }

    if (form.ownershipType === 'team' && !form.teamId) {
      return '请选择所属团队'
    }

    // 接口资源不选标签归类，标签相关的必填项对它不成立
    if (!isApiKind.value) {
      if (tagCatalog.platformTagGroups.value.length === 0) {
        return '当前二级节点尚未配置完整标签组'
      }

      if (tagCatalog.selectedTagCount.value === 0) {
        return '请至少选择一个标签'
      }
    }

    if (
      formState.creationType.value === 'paid' &&
      !formState.isVersionSale.value &&
      !formState.hasCashPrice.value &&
      !formState.hasPointsPrice.value
    ) {
      return '请设置现金售价或积分售价'
    }

    return ''
  })
  const canSubmit = computed(() => !submitBlockReason.value)

  /** 复位整页：表单、标签勾选、一次性密钥与创建锚点（创建成功 / 确认密钥后走这里）。 */
  function resetAll() {
    formState.resetForm()
    tagCatalog.resetTagSelections()
    channel.resetChannelState()
    createdResource.value = null
  }

  async function submitResource(mode: 'private' | 'public') {
    if (!auth.token) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }
    if (!canSubmit.value) {
      TMessage.warning('请先补全必填字段')
      return
    }
    if (effectiveOriginType.value === 'repost' && !form.originUrl.trim()) {
      TMessage.warning('转载资源必须填写原始出处链接')
      return
    }
    if (!channel.validateApiChannel()) {
      return
    }

    const creationType = formState.creationType.value
    const versionSale = formState.isVersionSale.value
    const priceParsed = formState.parsedPriceFen.value
    const pointsParsed = formState.parsedPricePoints.value
    if (!priceParsed.ok) {
      TMessage.warning(priceParsed.message)
      return
    }
    if (!pointsParsed.ok) {
      TMessage.warning(pointsParsed.message)
      return
    }
    if (priceParsed.fen > 0 && pointsParsed.points > 0) {
      TMessage.warning('现金售价与积分售价不能同时设置')
      return
    }
    if (creationType === 'free' && (priceParsed.fen > 0 || pointsParsed.points > 0)) {
      TMessage.warning('免费资源不能设置售价')
      return
    }
    if (
      creationType === 'paid' &&
      !versionSale &&
      priceParsed.fen <= 0 &&
      pointsParsed.points <= 0
    ) {
      TMessage.warning('付费买断资源请设置现金售价或积分售价')
      return
    }
    if (versionSale && (priceParsed.fen > 0 || pointsParsed.points > 0)) {
      TMessage.warning('单版本售价请在发布版本时设置')
      return
    }
    if (isApiKind.value && pointsParsed.points > 0) {
      TMessage.warning('接口资源只能设置现金售价，不能设置积分售价')
      return
    }
    const promoParsed = parsedPromoShare.value
    if (!promoParsed.ok) {
      TMessage.warning(promoParsed.message)
      return
    }
    const paidPublic =
      mode === 'public' &&
      (creationType === 'paid' || priceParsed.fen > 0 || pointsParsed.points > 0)
    if (paidPublic && !form.copyrightDeclared) {
      TMessage.warning('付费资源公开申请前必须勾选版权声明')
      return
    }

    submitting.value = true
    try {
      let resource: McResourcePayload
      if (createdResource.value === null) {
        resource = await createMcResource(auth.token, {
          platform: isApiKind.value ? '接口资源' : formState.currentPlatform.value,
          title: form.title.trim(),
          author: form.author.trim(),
          description: resourceSummary.value,
          tag_selections: tagCatalog.buildTagSelections(isApiKind.value),
          file_name: formState.derivedFileName.value,
          source_url: formState.derivedSourceUrl.value,
          cover_url: null,
          docs_url: null,
          visibility: 'draft',
          release_note: null,
          ownership_type: form.ownershipType,
          team_id: form.ownershipType === 'team' && form.teamId ? Number(form.teamId) : null,
          origin_type: effectiveOriginType.value,
          origin_author: form.originAuthor.trim() || null,
          origin_url: form.originUrl.trim() || null,
          origin_org: form.originOrg.trim() || null,
          origin_note: form.originNote.trim() || null,
          buyout_price_fen: creationType === 'free' || versionSale ? 0 : priceParsed.fen,
          price_points: creationType === 'paid' && !versionSale ? pointsParsed.points : 0,
          copyright_declared: form.copyrightDeclared,
          resource_kind: formState.resourceKind.value,
          promo_share_bps: promoParsed.bps,
        })
        createdResource.value = resource
      } else {
        resource = await getMcResource(auth.token, createdResource.value.id)
      }

      if (formState.selectedIconFile.value) {
        try {
          resource = await uploadMcResourceCover(
            auth.token,
            resource.id,
            formState.selectedIconFile.value,
          )
        } catch (error) {
          TMessage.warning(
            error instanceof Error
              ? `资源已初始化，但图标上传失败：${error.message}`
              : '资源已初始化，但图标上传失败',
          )
        }
      }

      if (isApiKind.value) {
        try {
          const saved = await updateResourceApiChannel(auth.token, resource.id, {
            callback_url: form.apiCallbackUrl.trim() || null,
            callback_secret: form.apiCallbackSecret.trim() || null,
            allowed_origins: channel.apiOrigins.value,
            repeat_purchasable: form.apiRepeatPurchasable,
          })
          channel.applySavedApiChannel(saved)
        } catch (error) {
          const message = error instanceof Error ? error.message : '保存接口资源渠道配置失败'
          TMessage.error(
            `资源已保存（编号 #${resource.id}），但接口资源渠道配置未保存成功：${message}。请修正后重试，重试只会重发渠道配置。`,
          )
          return
        }
      }

      if (mode === 'public' && !versionSale) {
        resource = await submitMcResourceReview(auth.token, resource.id)
      }

      TMessage.success(
        versionSale
          ? `单版本资源已创建，请发布首个版本，项目编号 #${resource.id}`
          : mode === 'public'
            ? `公开申请已提交，项目编号 #${resource.id}`
            : isApiKind.value
              ? `接口已创建，编号 #${resource.id}`
              : `资源已初始化为私有项目，编号 #${resource.id}`,
      )

      if (channel.revealedSecretPlain.value) {
        TMessage.warning('回调密钥已生成，且只显示这一次，请立即复制保存')
        return
      }

      resetAll()
      if (versionSale) {
        await router.push({
          name: 'dev-resource-versions',
          params: { resourceId: resource.id },
          query: {
            create: '1',
            sale: 'version',
            ...(mode === 'public' ? { review: '1' } : {}),
          },
        })
      } else {
        await router.push({ name: 'dev-resource-list' })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '发布资源失败'
      TMessage.error(message)
    } finally {
      submitting.value = false
    }
  }

  /** 开发者在弹窗里确认已保存密钥后，收尾并回资源列表。 */
  async function confirmSecretSaved() {
    channel.secretPlainDialogVisible.value = false
    TMessage.info('回调密钥不会再显示，如需更换请在配置里重新填写并保存')
    resetAll()
    await router.push({ name: 'dev-resource-list' })
  }

  return {
    submitting,
    submitBlockReason,
    canSubmit,
    submitResource,
    confirmSecretSaved,
    resetAll,
  }
}
