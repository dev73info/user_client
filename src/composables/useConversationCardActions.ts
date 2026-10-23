import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import { fetchAsignRequirementPreviewUrl } from '@/api/contracts'
import { apiUrl } from '@/api/http'
import { listRequirements } from '@/api/requirements'
import { listPublicMcResourceVersions } from '@/api/resources'
import type { ConversationCardMeta } from '@/shared/conversationCards'
import type { RequirementConversationMessage } from '@/shared/conversations'

/** 底部工具条（`RequirementConversationActions`）对外的能力与动作。 */
export type ConversationActionsHandle = {
  loadActions?: () => Promise<void> | void
  openPayDialog?: () => void
  openDeliveryDialog?: () => void
  openAcceptanceDialog?: () => void
  applyPublishedVersionCount?: (count: number) => void
}

type CardActionSources = {
  token: string
  requirementId: string
  /** 工具条裁定「现在能不能付」，卡片上的支付按钮据此决定是开弹窗还是给提示。 */
  canPay: boolean
  requirementStatus?: string | null
  /** 工具条实例：卡片按钮借它打开支付 / 交付 / 验收弹窗。 */
  actions: () => ConversationActionsHandle | null
}

/**
 * 时间线卡片上的按钮：支付定金 / 尾款、下载交付产物、跳站内路由。
 *
 * 从 `RequirementConversationModal.vue` 抽出。判断口径原样保留：支付优先交给工具条弹窗，
 * 爱签合同预览取不到链接时静默回退站内签约页，交付产物按卡片上的版本号取、对不上就退回最新版本。
 */
export function useConversationCardActions(readSources: () => CardActionSources) {
  const router = useRouter()
  const downloadLoading = ref(false)

  /**
   * 卡片上的「支付定金 / 支付尾款」：能付就打开工具条弹窗；
   * 验收打回后退回「开发中」时入口仍留在「验收已通过」卡片上，点下去说明要先重新验收通过。
   */
  function runPaymentCardAction() {
    if (readSources().canPay) {
      readSources().actions()?.openPayDialog?.()
      return
    }
    const status = readSources().requirementStatus
    if (status === 'in_development') {
      TMessage.warning('验收已打回开发中，请重新验收通过后再支付尾款')
      return
    }
    TMessage.warning('当前还不能支付，请确认合同已签署且需求处于待缴定金或待付尾款')
  }

  /**
   * 执行卡片按钮：爱签合同预览优先（点进去即可查看/签署），取不到链接再回退站内路由。
   *
   * 与需求列表页「查看合同」同一口径：合同还没在爱签侧发起签署、或爱签接口异常时，
   * 接口会报错，这里静默回退到本地签约页。
   */
  async function runCardAction(
    card: ConversationCardMeta,
    message?: RequirementConversationMessage,
  ) {
    if (card.downloadDelivery) {
      await downloadDeliveryArtifact(message?.action_ref ?? '')
      return
    }
    if (card.asignPreview) {
      const { token, requirementId } = readSources()
      try {
        const previewUrl = await fetchAsignRequirementPreviewUrl(token, requirementId)
        if (previewUrl) {
          window.location.href = previewUrl
          return
        }
      } catch {
        // 忽略：回退站内合同页
      }
    }
    if (card.to) {
      await router.push(card.to)
    }
  }

  /**
   * 下载交付产物：交付即「绑定资源项目的一次版本发布」，卡片上的 ref 是那次交付的版本号。
   * 版本号对不上（例如卡片之后又发过新版本）时退回最新版本；没有绑定资源或还没发版本就只提示。
   */
  async function downloadDeliveryArtifact(versionRef: string) {
    const { token, requirementId } = readSources()
    if (downloadLoading.value || !token || !requirementId) {
      return
    }

    downloadLoading.value = true
    try {
      const requirements = await listRequirements(token)
      const boundResourceId = requirements.find(
        (row) => row.requirement_id === requirementId,
      )?.bound_resource_id
      if (boundResourceId == null) {
        TMessage.warning('该需求还没有绑定的交付资源，暂时没有可下载的产物')
        return
      }

      const versions = await listPublicMcResourceVersions(boundResourceId, token)
      const target = versions.find((item) => item.version === versionRef) ?? versions[0]
      if (!target) {
        TMessage.warning('开发者还没有提交交付版本')
        return
      }

      window.open(apiUrl(target.resource), '_blank', 'noopener')
      // 下载已证明有交付版本：刷一遍工具条，并用刚查到的版本数兜底，让同卡「验收」立刻可点。
      const actions = readSources().actions()
      await actions?.loadActions?.()
      actions?.applyPublishedVersionCount?.(versions.length)
    } catch (error) {
      TMessage.warning(error instanceof Error ? error.message : '下载交付产物失败')
    } finally {
      downloadLoading.value = false
    }
  }

  return { downloadLoading, runPaymentCardAction, runCardAction, downloadDeliveryArtifact }
}
