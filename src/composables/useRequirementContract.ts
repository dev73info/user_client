import { ref } from 'vue'

import { createRequirementContract, fetchAsignRequirementPreviewUrl } from '@/api/contracts'
import type { RequirementItem } from '@/api/requirements'

import { TMessage } from 'ui_73info'

type UseRequirementContractOptions = {
  /** 当前登录 token：视图持有 `auth`，这里只按需取值，不把 pinia 拖进来。 */
  token: () => string
  /** 登录态：发起合同前要判（这里是唯一一处只靠登录态就能拦下的动作）。 */
  isAuthed: () => boolean
  /**
   * 进合同签署页。**跳转留在视图**：这一域有两种导航（站内路由 / 爱签预览整页跳），
   * 一律由视图实现并注入，composable 只管请求与状态。
   */
  onOpenContractSign: (item: RequirementItem) => void
  /** 爱签预览链接拿到后的整页跳转（`window.location`），同样由视图执行。 */
  onOpenPreviewUrl: (url: string) => void
  /** 发起成功后的列表刷新：写入口只有 `useMyRequirementsData` 的 `reload()`。 */
  onCreated: () => void | Promise<void>
}

/**
 * 「我的需求」页的合同签署域：发起合同、进合同签署页、「只看合同」的爱签预览回退。
 *
 * 三个入口对应需求行上的 `contract-create` / `contract-sign` / `contract-view` 三个动作，
 * 点击后能不能点由 `shared/requirementRowActions` 按行事实判定，这里不再二次设卡
 * （多一道「有没有合同」的判断只会在合同状态 map 过期时把可点的入口挡掉）。
 *
 * **一实例一工厂**：签约中那条需求的 id（`contractCreatingId`，行内按钮据此置灰）是本页独有的状态，
 * 做成单例会被多处实例互相覆盖。
 */
export function useRequirementContract(options: UseRequirementContractOptions) {
  /** 正在发起合同的那条需求：行内「发起合同」按钮据此置灰，同一时刻只会有一条。 */
  const contractCreatingId = ref('')

  /**
   * 「查看合同」：优先跳爱签的合同预览页。
   *
   * 合同已在爱签侧发起签署时可取到预览链接；尚未发起或爱签接口异常时，
   * 回退到本地合同签署页展示（与拆分前同一顺序：先试预览，失败再退本地）。
   */
  async function viewContractPreview(item: RequirementItem) {
    const token = options.token()
    if (token) {
      try {
        const previewUrl = await fetchAsignRequirementPreviewUrl(token, item.requirement_id)
        if (previewUrl) {
          options.onOpenPreviewUrl(previewUrl)
          return
        }
      } catch {
        // 爱签预览不可用：回退本地合同展示。
      }
    }
    options.onOpenContractSign(item)
  }

  /** 「发起合同」：建合同 → 提示补充附件的机会 → 刷新列表 → 进合同页签附件 / 签署。 */
  async function createContract(item: RequirementItem) {
    if (!options.isAuthed() || !options.token()) {
      TMessage.error('请先登录后再继续操作')
      return
    }

    contractCreatingId.value = item.requirement_id
    try {
      await createRequirementContract(options.token(), item.requirement_id)
      // R012：发起后引导到合同页的「自定义合同附件」区；附件经平台审核放行后才能发起签署。
      TMessage.success('合同已发起；如需补充条款，可在合同页准备自定义附件，平台放行后即可签署')
      await options.onCreated()
      options.onOpenContractSign(item)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '发起合同失败')
    } finally {
      contractCreatingId.value = ''
    }
  }

  return {
    contractCreatingId,
    /** 「签署合同」＝进合同签署页，与「发起后进合同页」同一个跳转。 */
    openContractSign: options.onOpenContractSign,
    viewContractPreview,
    createContract,
  }
}
