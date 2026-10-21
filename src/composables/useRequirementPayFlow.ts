import { computed, ref } from 'vue'

import {
  createAdapayPayment,
  getAdapayClientPlatform,
  getAdapayPayment,
  type AdapayBusinessPayChannel,
  type AdapayPaymentResponse,
} from '@/api/adapay'
import {
  getUnionPaymentAuthorizeUrl,
  isUnionPaymentAuthorizationRequired,
  isWechatPaymentAuthorizationRequired,
} from '@/api/auth'
import type { RequirementItem } from '@/api/requirements'
import { buildAdapayPaymentQuery } from '@/shared/paymentRoute'
import {
  isRequirementFinalPayment,
  requirementPayAmount,
  requirementPayStageLabel,
} from '@/shared/requirementPayment'
import { isAdapayRequirement } from '@/shared/requirementRowRules'
import { TMessage } from 'ui_73info'

/** 已经建过的那张 Adapay 订单（原样保留视图里那份形状，查单时只认 `payment_id` 与 `adapay`）。 */
export type RequirementPayOrder = {
  payment_id: string
  requirement_id: string
  channel: string
  amount_cny: number
  status: string
  alipay_order_string?: string
  expires_at: string
  adapay?: boolean
}

/**
 * 一次「点支付」的结果。
 *
 * 这个 composable **不做任何跳转**：建单后要去支付页、云闪支付授权后要去授权地址，
 * 都只把「去哪儿」返回给视图，由视图决定 `router.push` 还是 `window.location.assign`
 * （与主页 / 个人中心两处支付入口的分工一致，也方便单测直接断结果）。
 */
export type RequirementPayOutcome =
  | { kind: 'none' }
  | { kind: 'paid' }
  | { kind: 'redirect-page'; query: Record<string, string> }
  | { kind: 'external'; url: string }

type UseRequirementPayFlowOptions = {
  /** 当前登录 token：视图持有 `auth`，这里只按需取值，不把 pinia 拖进来。 */
  token: () => string
  /**
   * 定金占总价的比例。**必须注入**：口径只有 `useMyRequirementsData`（settings 接口）持有，
   * 这里重新算一遍就会出现「弹窗显示 20%、实付按别的比例」的两套金额。
   */
  depositRatioPercent: () => number
  /**
   * 这条需求现在能不能付。判据是 `shared/requirementRowRules` 的 `canPay`，依赖按条的合同事实，
   * 只有视图能取到（`rowFacts`），所以注入布尔而不是在这里再查一遍合同。
   */
  canPayRequirement: (item: RequirementItem) => boolean
  /** 支付确认成功后刷新列表：列表写入口只有 `useMyRequirementsData` 的 `reload()`。 */
  onPaid?: () => void | Promise<void>
}

/**
 * 「我的需求」页的支付流程：开弹窗、切通道、算这次应付多少、Adapay 下单与查单。
 *
 * 跳转留在视图（见 `RequirementPayOutcome`），渲染留在 `RequirementPayModal`——
 * 这里只管状态与请求，toast 也在这里发（与解除合作域同一分工）。
 */
export function useRequirementPayFlow(options: UseRequirementPayFlowOptions) {
  const visible = ref(false)
  const requirement = ref<RequirementItem | null>(null)
  const channel = ref<AdapayBusinessPayChannel>('alipay')
  const loading = ref(false)
  const order = ref<RequirementPayOrder | null>(null)

  const isFinalPayment = computed(() => isRequirementFinalPayment(requirement.value))
  const stageLabel = computed(() => requirementPayStageLabel(requirement.value))

  /** 本次应付：没有需求时保持原来的 0.01 兜底（弹窗渲染期间值为 0 会显示「¥0.00」）。 */
  const amount = computed(() =>
    requirement.value
      ? requirementPayAmount(requirement.value, options.depositRatioPercent())
      : 0.01,
  )

  function open(item: RequirementItem) {
    if (!options.canPayRequirement(item)) {
      return
    }
    requirement.value = item
    channel.value = 'alipay'
    order.value = null
    visible.value = true
  }

  function close() {
    visible.value = false
  }

  /** 换通道要把已建的订单丢掉：旧订单是上一个通道下的，拿它查单只会一直「未支付」。 */
  function setChannel(next: AdapayBusinessPayChannel) {
    if (channel.value === next) {
      return
    }
    channel.value = next
    order.value = null
  }

  /**
   * 建单 / 查单。分三段，与原来视图里的顺序一一对应：
   * 1. 还没有订单 → 下单，成功即返回「去支付页」；
   * 2. 已有订单 → 查状态，`paid`/`confirmed` 才算完成，`failed` 丢掉重下；
   * 3. 下单被后端以「未授权」挡回 → 微信走支付页意图模式、云闪付走授权地址。
   */
  async function submit(): Promise<RequirementPayOutcome> {
    if (!requirement.value) {
      return { kind: 'none' }
    }

    const target = requirement.value
    const payChannelValue = channel.value
    const clientPlatform = getAdapayClientPlatform()
    if (!isAdapayRequirement(target)) {
      TMessage.warning('无担保订单不通过平台收款，请由双方按约定自行结算')
      return { kind: 'none' }
    }

    loading.value = true
    try {
      if (!order.value) {
        const adapayPayment: AdapayPaymentResponse = await createAdapayPayment(
          options.token(),
          target.requirement_id,
          isFinalPayment.value ? 'final' : 'deposit',
          payChannelValue,
          clientPlatform,
        )
        order.value = {
          payment_id: adapayPayment.paymentId,
          requirement_id: adapayPayment.requirementId,
          channel: payChannelValue,
          amount_cny: Number(adapayPayment.amountCny),
          status: adapayPayment.status,
          alipay_order_string: adapayPayment.payUrl ?? '',
          expires_at: '',
          adapay: true,
        }
        TMessage.success(`${stageLabel.value}支付订单已生成，正在跳转支付页`)
        return {
          kind: 'redirect-page',
          query: buildAdapayPaymentQuery({
            paymentId: order.value.payment_id,
            requirementId: adapayPayment.requirementId,
            channel: payChannelValue,
            clientPlatform,
            amountCny: adapayPayment.amountCny,
            qrContent: adapayPayment.payUrl,
          }),
        }
      }

      if (order.value.adapay) {
        const adapayPayment = await getAdapayPayment(options.token(), order.value.payment_id)
        if (adapayPayment.status !== 'paid' && adapayPayment.status !== 'confirmed') {
          if (adapayPayment.status === 'failed') {
            order.value = null
            TMessage.warning('上次支付订单已失效，重新发起支付')
            // 递归要 `return await`：重下之后同样会得到「去支付页」，吞掉结果就不会跳转了。
            return await submit()
          }
          TMessage.warning('支付尚未完成，请先完成 Adapay 支付')
          return { kind: 'none' }
        }
        TMessage.success(`${stageLabel.value}支付确认成功`)
        order.value = null
        visible.value = false
        await options.onPaid?.()
        return { kind: 'paid' }
      }

      throw new Error('支付订单状态无效，请重新发起 Adapay 支付')
    } catch (err) {
      if (isWechatPaymentAuthorizationRequired(err)) {
        // 尚未绑定 open_id：直接跳转到支付页（意图模式），由支付页在微信内自动静默授权并下单。
        if (!requirement.value) {
          return { kind: 'none' }
        }
        return {
          kind: 'redirect-page',
          query: buildAdapayPaymentQuery({
            requirementId: requirement.value.requirement_id,
            milestone: isFinalPayment.value ? 'final' : 'deposit',
            channel: 'wechat',
            clientPlatform,
            amountCny: amount.value,
            intent: true,
          }),
        }
      }
      if (isUnionPaymentAuthorizationRequired(err)) {
        if (clientPlatform !== 'mobile') {
          TMessage.warning('云闪付授权仅适用于移动端，请重新选择支付方式')
          return { kind: 'none' }
        }
        try {
          const authorization = await getUnionPaymentAuthorizeUrl(
            options.token(),
            window.location.href,
          )
          if (!authorization.url.trim()) {
            throw new Error('云闪付授权地址为空')
          }
          return { kind: 'external', url: authorization.url }
        } catch (authorizationError) {
          TMessage.error(
            authorizationError instanceof Error ? authorizationError.message : '发起云闪付授权失败',
          )
          return { kind: 'none' }
        }
      }

      TMessage.error(err instanceof Error ? err.message : '支付失败')
      return { kind: 'none' }
    } finally {
      loading.value = false
    }
  }

  return {
    payVisible: visible,
    payRequirement: requirement,
    payChannel: channel,
    payLoading: loading,
    currentPayment: order,
    isFinalPayment,
    payStageLabel: stageLabel,
    payAmount: amount,
    openPayModal: open,
    closePayModal: close,
    updatePayChannel: setChannel,
    submitPayment: submit,
  }
}
