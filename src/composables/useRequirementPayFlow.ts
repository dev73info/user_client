import { computed, ref } from 'vue'

import {
  createAdapayPayment,
  getAdapayClientPlatform,
  getAdapayPayment,
  type AdapayBusinessPayChannel,
  type AdapayPaymentResponse,
} from '@/api/adapay'
import type { RequirementItem } from '@/api/requirements'
import { formatFenAsCny } from '@/shared/money'
import { buildAdapayPaymentQuery } from '@/shared/paymentRoute'
import {
  isRequirementFinalPayment,
  requirementPayFen,
  requirementPayStageLabel,
} from '@/shared/requirementPayment'
import { isAdapayRequirement } from '@/shared/requirementRowRules'
import { TMessage } from 'ui_73info'

/**
 * 已经建过的那张支付单（字段取自契约：单号是 `order_no`，金额只有整数分）。
 *
 * 查单只认 `order_no`——它就是下单回执里的 `payment_id`，也是支付页 query 上的 `payment_id`。
 */
export type RequirementPayOrder = {
  order_no: string
  requirement_id: string
  channel: string
  amount_fen: number
  status: string
  pay_url?: string | null
}

/**
 * 一次「点支付」的结果。
 *
 * 这个 composable **不做任何跳转**：建单后要去支付页，只把「去哪儿」返回给视图，
 * 由视图决定 `router.push`（与主页 / 个人中心两处支付入口的分工一致，也方便单测直接断结果）。
 *
 * 契约里没有微信 / 云闪付的「授权地址」端点（`/auth/wechat/payment/url`、`/adapay/union/payment/url`
 * 都不在 `openapi.json` 里），所以这里不再有「未授权 → 改走授权链路」的兜底：
 * 下单失败就是失败，原话交给用户看。
 */
export type RequirementPayOutcome =
  | { kind: 'none' }
  | { kind: 'paid' }
  | { kind: 'redirect-page'; query: Record<string, string> }

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

/** 单子已经被渠道作废：这张单不能再查下去，只能丢掉重下。 */
function isDeadOrder(status: string): boolean {
  return status === 'failed' || status === 'canceled'
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

  /** 本次应付（**整数分**）：比例由视图注入，见 `shared/requirementPayment`。 */
  const payFen = computed(() =>
    requirement.value ? requirementPayFen(requirement.value, options.depositRatioPercent()) : 1,
  )

  /**
   * 给 `RequirementPayModal` 的「本次应付」文本用的元值。
   *
   * 弹窗（不在本次改动范围）的 `amount` prop 是 `number` 并自己 `toFixed(2)`，
   * 所以这里只在最后一步把分换成元做展示，计算全程在整数分上。
   */
  const amount = computed(() => Number(formatFenAsCny(payFen.value)))

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
   * 2. 已有订单 → 查状态，`paid` 才算完成，`failed` / `canceled` 丢掉重下。
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
        const payment: AdapayPaymentResponse = await createAdapayPayment(
          options.token(),
          target.requirement_id,
          isFinalPayment.value ? 'final' : 'deposit',
          payChannelValue,
          clientPlatform,
        )
        order.value = {
          order_no: payment.payment_id,
          requirement_id: payment.requirement_id,
          channel: payment.pay_channel,
          amount_fen: payment.amount_fen,
          status: payment.status,
          pay_url: payment.pay_url,
        }
        TMessage.success(`${stageLabel.value}支付订单已生成，正在跳转支付页`)
        return {
          kind: 'redirect-page',
          query: buildAdapayPaymentQuery({
            paymentId: payment.payment_id,
            requirementId: payment.requirement_id,
            channel: payChannelValue,
            clientPlatform,
            amountCny: payment.amount_cny,
            qrContent: payment.pay_url,
          }),
        }
      }

      const current = await getAdapayPayment(options.token(), order.value.order_no)
      if (current.status === 'paid') {
        TMessage.success(`${stageLabel.value}支付确认成功`)
        order.value = null
        visible.value = false
        await options.onPaid?.()
        return { kind: 'paid' }
      }
      if (isDeadOrder(current.status)) {
        order.value = null
        TMessage.warning('上次支付订单已失效，重新发起支付')
        // 递归要 `return await`：重下之后同样会得到「去支付页」，吞掉结果就不会跳转了。
        return await submit()
      }
      order.value = { ...order.value, status: current.status }
      TMessage.warning('支付尚未完成，请先完成 Adapay 支付')
      return { kind: 'none' }
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '支付失败')
      return { kind: 'none' }
    } finally {
      loading.value = false
    }
  }

  /**
   * 模板挂点：`<RequirementPayModal v-bind="modalBindings" />` 一行铺完金额 / 通道 / 订单态。
   *
   * `@submit` 不在这里：建单后的跳转要由视图执行（见 `RequirementPayOutcome`），
   * 所以视图写成 `v-bind="modalBindings"` 再加自己的 `@submit`。
   */
  const modalBindings = computed(() => ({
    visible: visible.value,
    requirement: requirement.value,
    channel: channel.value,
    loading: loading.value,
    order: order.value,
    stageLabel: stageLabel.value,
    amount: amount.value,
    isFinalPayment: isFinalPayment.value,
    depositRatioPercent: options.depositRatioPercent(),
    onClose: close,
  }))

  return {
    payVisible: visible,
    payRequirement: requirement,
    payChannel: channel,
    payLoading: loading,
    currentPayment: order,
    isFinalPayment,
    payStageLabel: stageLabel,
    payAmount: amount,
    /** 本次应付的整数分（视图要给接口或日志时用它，不要用 `payAmount` 那个展示值） */
    payFen,
    openPayModal: open,
    closePayModal: close,
    updatePayChannel: setChannel,
    submitPayment: submit,
    modalBindings,
  }
}
