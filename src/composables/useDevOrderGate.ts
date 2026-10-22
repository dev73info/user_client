import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { TMessage } from 'ui_73info'

import { getDevAccessStatus } from '@/api/auth'
import { getDevCreditSelf, type DevCreditSelf } from '@/api/devCredit'
import type { RequirementItem } from '@/api/devRequirements'
import { getDevOrderDepositStatus, type DevOrderDepositStatus } from '@/api/devOrderDeposit'
import { requiresDepositGate, type RequirementBindGate } from '@/shared/devRequirementHall'
import { useAuthStore } from '@/stores/auth'

/**
 * 开发者接单资格：保证金账单、信用额度、入驻协议签署状态，以及由它们派生出的
 * 接单资格读数（`bindGate`，决定每行「接单」按钮上写什么）与三处跳转
 * （需求详情 / 缴纳保证金 / 签署协议）。
 *
 * 从 `views/DevRequirementHallView.vue` 抽出，取数与文案逐段照搬：
 * 保证金是硬闸门（`can_bind_requirement`），信用额度只在上限强制时才参与判定。
 */
export function useDevOrderGate() {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  const depositStatus = ref<DevOrderDepositStatus | null>(null)
  const creditInfo = ref<DevCreditSelf | null>(null)
  const developerAgreementSigned = ref(false)

  const canTakeOrders = computed(() => depositStatus.value?.can_bind_requirement ?? false)
  const availableDepositText = computed(
    () => `¥${(depositStatus.value?.available_cny ?? 0).toFixed(2)}`,
  )
  const orderCreditCap = computed(() => {
    if (!creditInfo.value || !creditInfo.value.enforce_order_limit) return Number.POSITIVE_INFINITY
    return creditInfo.value.max_order_amount_cny
  })

  /** 列表里每一行的「接单」按钮要吃的那份资格读数（纯函数在 `@/shared/devRequirementHall`）。 */
  const bindGate = computed<RequirementBindGate>(() => ({
    agreementSigned: developerAgreementSigned.value,
    canTakeOrders: canTakeOrders.value,
    availableCny: depositStatus.value?.available_cny ?? 0,
    orderCap: orderCreditCap.value,
  }))

  async function loadDepositStatus() {
    if (!auth.token) {
      return
    }

    try {
      const [status, credit, accessStatus] = await Promise.all([
        getDevOrderDepositStatus(auth.token),
        getDevCreditSelf(auth.token).catch(() => null),
        getDevAccessStatus(auth.token).catch(() => null),
      ])
      depositStatus.value = status
      creditInfo.value = credit
      if (accessStatus) {
        developerAgreementSigned.value = accessStatus.developer_agreement_signed
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载接单保证金状态失败'
      TMessage.error(message)
      depositStatus.value = null
    }
  }

  /**
   * 点某一行的「接单」：没签协议先去签（签完靠 `redirect_to` 回到大厅），签了就直接进需求详情。
   *
   * 早先这里开的是本页那个「关联需求」弹窗，后来接单流程整个搬到需求详情页
   * （`DevRequirementDetailView` 里既有绑定又有「初始化新资源项目」），
   * 本页只留一个入口按钮；弹窗那套状态随之删除，见本页 `<script>` 顶部的说明。
   */
  function openRequirement(requirement: RequirementItem) {
    if (requiresDepositGate(requirement) && !developerAgreementSigned.value) {
      goSignDeveloperAgreement(requirement.requirement_id)
      return
    }

    void router.push({
      name: 'dev-requirement-detail',
      params: { requirementId: requirement.requirement_id },
    })
  }

  /** 去缴纳保证金：协议还没签就先签（没有协议签不了担保单）。 */
  function goToOrderDeposit() {
    if (!developerAgreementSigned.value) {
      goSignDeveloperAgreement()
      return
    }

    void router.push('/dev/wallet/order-deposit')
  }

  /** 去签入驻协议；带需求号时签完回到该需求在大厅里的地址，不带就回当前页。 */
  function goSignDeveloperAgreement(requirementId?: string) {
    const redirectTo = requirementId
      ? `/workbench/developer/requirements/hall/${encodeURIComponent(requirementId)}`
      : route.fullPath
    void router.push({
      name: 'contract-sign',
      query: { agreement: 'developer', redirect_to: redirectTo },
    })
  }

  return {
    developerAgreementSigned,
    availableDepositText,
    bindGate,
    loadDepositStatus,
    openRequirement,
    goToOrderDeposit,
    goSignDeveloperAgreement,
  }
}
