import { computed, ref, type Ref } from 'vue'

import { detectClientPlatform, recordAgreementAcceptance } from '@/api/auth'
import {
  LEGAL_NOTICE_VERSION,
  rememberLegalNoticeConfirmedAt,
} from '@/components/legal/legalNotice'
import { useAuthStore } from '@/stores/auth'

/**
 * 平台协议签署前的重要条款提示与二次确认（R043 任务-03，R047 拆分后单列一支）。
 *
 * 《民法典》第 496 条要求格式条款提供方对免责、责任限制等条款履行提示说明义务，
 * 所以平台协议（开发者入驻协议 / 接口使用协议）在发起签署前要：
 * 1. 单独展示一次重要条款提示并让用户勾选确认（勾选状态与提示版本在这里）；
 * 2. 签署时留痕一次「确认时间 + 提示版本」，留痕要能证明"用户被提示过什么"。
 *
 * **需求合同不走这条路径**：那是甲乙双方之间的合同，平台不是当事人，
 * 平台不该在别人的合同流程里加平台自己的提示（`isPlatformAgreement` 为假时直接放行）。
 */
type UseContractNoticeConfirmOptions = {
  /** 平台与用户之间的内置协议（入驻协议 / 接口使用协议）：为假时本支整体放行。 */
  isPlatformAgreement: Ref<boolean>
  /** 接口使用协议：决定留痕用的模版 code。 */
  isApiUsageAgreement: Ref<boolean>
}

export function useContractNoticeConfirm(options: UseContractNoticeConfirmOptions) {
  const auth = useAuthStore()

  /** 「已阅读并理解重要条款提示」的勾选状态；每次进签署页都要重新勾。 */
  const noticeAccepted = ref(false)
  /** 提示组件读到的协议版本号（留痕用；读不到时后端回落到模板当前版本）。 */
  const noticeVersion = ref('')
  /** 平台协议对应的模版 code。 */
  const platformAgreementCode = computed(() =>
    options.isApiUsageAgreement.value ? 'api_usage_agreement' : 'developer_agreement',
  )

  /** 提示组件取到协议正文后回传版本 / 生效日期。 */
  function onNoticeLoaded(payload: { version: string; effective_at: string }) {
    noticeVersion.value = payload.version
  }

  /**
   * 签署前的最后一道闸门：平台协议没勾选确认重要条款提示就拦住。
   *
   * 返回空串表示放行，顺便把「确认时间 + 提示版本」留痕一次（`source=sign`）。
   * 留痕失败不阻断签署：签署本身已经过爱签的实名校验，留痕是补记。
   */
  async function confirmBeforeSign(): Promise<string> {
    if (!options.isPlatformAgreement.value) return ''
    if (!noticeAccepted.value) {
      return '请先阅读并勾选确认重要条款提示，再发起签署'
    }
    const confirmedAt = new Date().toISOString()
    rememberLegalNoticeConfirmedAt(confirmedAt)
    await recordAgreementAcceptance(
      auth.token,
      platformAgreementCode.value,
      noticeVersion.value,
      detectClientPlatform(),
      'sign',
      confirmedAt,
      LEGAL_NOTICE_VERSION,
    ).catch(() => undefined)
    return ''
  }

  return { noticeAccepted, noticeVersion, platformAgreementCode, onNoticeLoaded, confirmBeforeSign }
}
