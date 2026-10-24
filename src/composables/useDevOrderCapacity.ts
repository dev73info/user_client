import { computed, ref } from 'vue'
import { getDevAccessStatus } from '@/api/auth'
import { getDevCreditSelf, type DevCreditSelf } from '@/api/devCredit'
import { getDevOrderDepositStatus, type DevOrderDepositStatus } from '@/api/devOrderDeposit'
import { useAuthStore } from '@/stores/auth'
import { availableDepositText, orderCreditCap } from '@/shared/devRequirementBinding'

/**
 * 接单资格：保证金余额、信用额度、《开发者入驻协议》签署状态。
 *
 * 三者一起算「这一单接不接得动」，所以放同一个 composable 里一次取完：
 * - 保证金（`devOrderDeposit`）：够不够接单（`can_bind_requirement`）与可用余额；
 * - 信用（`devCredit`）：开启订单额度限制时，单笔预算的上限；
 * - 入驻协议（`auth/dev-access-status`）：电签担保需求必须先签，否则连申请都发不出去。
 *
 * 信用与协议状态取失败不阻断页面：拿不到就按「未开启限制 / 未签」的保守口径算，
 * 用户点提交时后端还会再拦一次，比整页报错更不容易把人卡死。
 */
export function useDevOrderCapacity() {
  const auth = useAuthStore()

  const depositLoading = ref(false)
  const depositStatus = ref<DevOrderDepositStatus | null>(null)
  const creditInfo = ref<DevCreditSelf | null>(null)
  const developerAgreementSigned = ref(false)

  /** 后端 `can_bind_requirement`：保证金够不够接单。 */
  const canTakeOrders = computed(() => depositStatus.value?.can_bind_requirement ?? false)
  const availableCny = computed(() => depositStatus.value?.available_cny ?? 0)
  const availableDepositLabel = computed(() =>
    availableDepositText(depositStatus.value?.available_cny),
  )
  /** 单笔订单的信用上限；未开启限制时为 `Infinity`。 */
  const creditCap = computed(() => orderCreditCap(creditInfo.value))

  async function loadCapacity() {
    depositLoading.value = true
    try {
      const [deposit, credit, accessStatus] = await Promise.all([
        getDevOrderDepositStatus(auth.token),
        getDevCreditSelf(auth.token).catch(() => null),
        getDevAccessStatus(auth.token).catch(() => null),
      ])

      depositStatus.value = deposit
      creditInfo.value = credit
      if (accessStatus) {
        developerAgreementSigned.value = accessStatus.developer_agreement_signed
      }
    } finally {
      depositLoading.value = false
    }
  }

  return {
    depositLoading,
    depositStatus,
    creditInfo,
    developerAgreementSigned,
    canTakeOrders,
    availableCny,
    availableDepositLabel,
    creditCap,
    loadCapacity,
  }
}
