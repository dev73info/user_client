import { ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  createRequirementContract,
  fetchAsignRequirementPreviewUrl,
  fetchDevContractSigningStatus,
  type ContractSigningStatus,
} from '@/api/contracts'
import type { RequirementItem } from '@/api/devRequirements'
import { contractButtonLabel } from '@/shared/devMyRequirementCard'

import { TMessage } from 'ui_73info'

type UseDevContractActionsOptions = {
  /** 当前登录 token：页面注入，这里不去 store 里取第二遍。 */
  token: () => string
  /** 本页一次取回的签约状态（`useDevMyRequirementsLoad.contractStatusOf`）。 */
  contractStatusOf: (item: RequirementItem) => ContractSigningStatus | null
  /** 发起合同后回写单条签约状态（同上，由取数层唯一持有）。 */
  applySigningStatus: (requirementId: string, status: ContractSigningStatus | null) => void
}

/**
 * 「接单页」上的三件合同动作：发起合同、签署跳转与爱签预览回退。
 *
 * 页面原先各写一遍，三处都要读同一份签约状态（`contractButtonLabel` 决定按钮是「签署合同」
 * 还是「查看合同」），也都要往 `contract-sign` 页跳；收进这里后页面只接事件，
 * 跳转与提示不再散在模板旁边。
 */
export function useDevContractActions(options: UseDevContractActionsOptions) {
  const router = useRouter()
  /** 正在发起合同的那一条（按钮转圈）：按需求号存，同屏多张卡互不影响。 */
  const contractCreatingId = ref('')

  /** 签署 / 查看合同页：合同页自己按 `requirement_id` 取合同与附件。 */
  function openContractSign(item: RequirementItem) {
    router.push({
      name: 'contract-sign',
      query: { requirement_id: item.requirement_id, from: 'dev' },
    })
  }

  /**
   * 「查看合同」跳转到爱签的合同预览页（previewContract）。
   *
   * 合同已在爱签侧发起签署时可获取预览链接；若合同尚未发起爱签签署或爱签接口异常，
   * 则回退到本地合同签署页展示。
   */
  async function viewContractPreview(item: RequirementItem) {
    const token = options.token()
    if (token) {
      try {
        const previewUrl = await fetchAsignRequirementPreviewUrl(token, item.requirement_id)
        if (previewUrl) {
          window.location.href = previewUrl
          return
        }
      } catch {
        // 爱签预览不可用：回退本地合同展示。
      }
    }
    openContractSign(item)
  }

  /** 操作栏那一枚合同按钮：已发起过就走预览，否则去签署页。 */
  function handleContractButtonClick(item: RequirementItem) {
    if (contractButtonLabel(options.contractStatusOf(item)) === '查看合同') {
      void viewContractPreview(item)
      return
    }
    openContractSign(item)
  }

  /** 发起合同：成功后回写签约状态再跳合同页（跳转前状态必须已落，否则卡片回来还是旧档）。 */
  async function createRequirementContractAction(item: RequirementItem) {
    const token = options.token()
    if (!token) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }
    contractCreatingId.value = item.requirement_id
    try {
      await createRequirementContract(token, item.requirement_id)
      // R012：发起后引导到合同页的「自定义合同附件」区；附件经平台审核放行后才能发起签署。
      TMessage.success('合同已发起；如需补充条款，可在合同页准备自定义附件，平台放行后即可签署')
      const status = await fetchDevContractSigningStatus(token, item.requirement_id)
      options.applySigningStatus(item.requirement_id, status)
      openContractSign(item)
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '发起合同失败')
    } finally {
      contractCreatingId.value = ''
    }
  }

  return {
    contractCreatingId,
    openContractSign,
    handleContractButtonClick,
    createRequirementContractAction,
  }
}
