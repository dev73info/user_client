import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue'
import { useRoute } from 'vue-router'

import { getAdapayClientPlatform } from '@/api/adapay'
import { useAuthStore } from '@/stores/auth'
import { readPaymentQuery } from '@/shared/paymentQuery'
import { paymentHeading } from '@/shared/paymentFlags'
import { usePaymentSession } from '@/composables/usePaymentSession'
import { usePaymentRedirect } from '@/composables/usePaymentRedirect'
import { useAdapayOrder } from '@/composables/useAdapayOrder'
import { usePaymentContext } from '@/composables/usePaymentContext'
import { useWechatJsapiPay } from '@/composables/useWechatJsapiPay'
import { useIntentAdapayOrder } from '@/composables/useIntentAdapayOrder'
import { useWechatMiddlePage } from '@/composables/useWechatMiddlePage'
import { useWechatPaymentFlow } from '@/composables/useWechatPaymentFlow'
import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'
import type { TipOrder } from '@/api/tips'

const PAYMENT_POLL_INTERVAL_MS = 8_000

/**
 * 支付页的页面级编排：把「这是什么支付」（context）、订单查单（adapayOrder）、
 * 微信各条链路（jsapi / 静默授权 / 意图下单 / 中间页 / 总编排）、支付宝收银台与倒计时串起来。
 *
 * 视图只从这里取一份扁平的展示状态与动作，不再自己持有任何支付状态，
 * 这样任何一条链路的行为都只在这一层与对应 composable 里，模板只负责画。
 *
 * 构造顺序即依赖顺序，全部用 `const`：互相要用对方状态的地方（中间页回填、支付参数）
 * 由本层创建共享 ref 再分别注入，避免两个 composable 反向引用对方的实例。
 */
export function usePaymentPage() {
  const route = useRoute()
  const auth = useAuthStore()

  const session = usePaymentSession()

  /** query 快照：只依赖路由，是整页最底层的输入 */
  const ctx = computed(() =>
    readPaymentQuery((route.query ?? {}) as Record<string, unknown>, getAdapayClientPlatform()),
  )

  const adapayOrder = useAdapayOrder({
    ctx: () => ctx.value,
    token: () => auth.token,
    isAuthed: () => auth.isAuthed,
    hydrate: () => auth.hydrate(),
    session,
  })

  // 中间页回填的支付参数 / 订单：展示（context）与流程（middle）都要读，所以在装配层创建
  const backfill = {
    resource: {
      payInfoRaw: ref(''),
      detail: ref(null) as Ref<ResourcePurchaseOrder | null>,
      creating: ref(false),
    },
    tip: {
      payInfoRaw: ref(''),
      detail: ref(null) as Ref<TipOrder | null>,
      creating: ref(false),
    },
  }

  const context = usePaymentContext({
    channel: () => adapayOrder.resolvedChannel.value,
    tipPayInfo: () => backfill.tip.payInfoRaw.value,
    resourcePayInfo: () => backfill.resource.payInfoRaw.value,
    adapayPayUrl: adapayOrder.adapayPayUrl,
    hasAdapayPayment: adapayOrder.hasAdapayPayment,
    resourceOrder: () => backfill.resource.detail.value,
    tipOrder: () => backfill.tip.detail.value,
  })

  const jsapi = useWechatJsapiPay({
    session,
    payInfo: () => context.wechatPayInfo.value,
    isWechatBrowser: () => context.isWechatBrowser.value,
    isPaymentHandoff: () => ctx.value.isHandoff,
    token: () => auth.token,
    onSubmitted: () => void adapayOrder.confirmPayment(),
  })

  const middle = useWechatMiddlePage(
    {
      session,
      ctx: () => ctx.value,
      // 支付参数由 context 统一解析（中间页回填的 pay_info 会并进同一条链路）
      payInfo: () => context.wechatPayInfo.value,
      isWechatBrowser: () => context.isWechatBrowser.value,
      launchPayment: () => jsapi.launchWechatPayment(),
    },
    backfill,
  )

  const intentOrder = useIntentAdapayOrder({
    session,
    ctx: () => ctx.value,
    flags: () => context.flags.value,
    token: () => auth.token,
    isWechatBrowser: () => context.isWechatBrowser.value,
    adapayPayment: adapayOrder.adapayPayment,
  })

  const middleCreating = computed(
    () => backfill.resource.creating.value || backfill.tip.creating.value,
  )
  /** 中间页正在建单（含意图模式） */
  const wechatMiddleBusy = computed(
    () => intentOrder.creatingIntentOrder.value || middleCreating.value,
  )
  /** 中间页 / 意图模式还没拿到支付参数 = 正在创建 */
  const wechatMiddleCreating = computed(
    () =>
      (context.flags.value.isIntentMode || context.flags.value.isWechatMiddlePage) &&
      !context.wechatPayInfo.value,
  )

  useWechatPaymentFlow({
    session,
    ctx: () => ctx.value,
    flags: () => context.flags.value,
    isWechatBrowser: () => context.isWechatBrowser.value,
    token: () => auth.token,
    isAuthed: () => auth.isAuthed,
    payInfo: () => context.wechatPayInfo.value,
    runMiddlePage: middle.runActive,
    middleCreating: () => middleCreating.value,
    creatingIntentOrder: () => intentOrder.creatingIntentOrder.value,
    intentOrderAttempted: () => intentOrder.intentOrderAttempted.value,
    createIntentOrder: () => intentOrder.createIntentAdapayOrder(),
    adapayStatus: () => adapayOrder.adapayPayment.value?.status ?? '',
    launchPayment: () => jsapi.launchWechatPayment(),
  })

  // 支付成功 → 3 秒自动返回（与顶部「返回」按钮同一个动作），逻辑在 usePaymentRedirect 里
  const { redirectCountdown, goBack } = usePaymentRedirect({ paid: session.paid })

  // ---------------------------------------------------------------------------
  // 生命周期：登录态与轮询查单
  // ---------------------------------------------------------------------------

  let pollTimer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    auth.hydrate()

    if (!ctx.value.isHandoff && !session.paid.value) {
      pollTimer = setInterval(() => {
        if (document.visibilityState !== 'visible') {
          return
        }
        if (ctx.value.isTipWechat || ctx.value.isResourceWechat) {
          void middle.pollActive()
          return
        }
        void adapayOrder.confirmPayment()
      }, PAYMENT_POLL_INTERVAL_MS)
    }
  })

  onUnmounted(() => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  })

  /** 页面标题：支付结果态优先，其次按渠道 */
  const heading = computed(() =>
    paymentHeading(context.flags.value, session.paymentResultVisible.value),
  )

  return {
    // ---- 支付结果态 ----
    paid: session.paid,
    paymentResultVisible: session.paymentResultVisible,
    confirmationError: session.confirmationError,
    confirming: adapayOrder.confirming,
    redirectCountdown,
    confirmPayment: adapayOrder.confirmPayment,

    // ---- 渠道判定与展示口径 ----
    heading,
    flags: context.flags,
    isWechatBrowser: context.isWechatBrowser,
    isPaymentHandoff: computed(() => ctx.value.isHandoff),
    isWechatMiddlePage: computed(() => context.flags.value.isWechatMiddlePage),
    paymentId: computed(() => ctx.value.paymentId),
    paymentChannel: context.resolvedChannel,

    // ---- 支付入口 ----
    hasOrder: context.hasOrder,
    qrDataUrl: context.qrDataUrl,
    wechatPayError: session.wechatPayError,
    wechatPayLoading: jsapi.wechatPayLoading,
    wechatMiddleBusy,
    wechatMiddleCreating,
    wechatAutoAuthRedirecting: session.wechatAutoAuthRedirecting,
    creatingIntentOrder: intentOrder.creatingIntentOrder,
    alipayPaymentUrl: context.alipayPaymentUrl,
    unionPaymentUrl: context.unionPaymentUrl,
    mismatched: computed(
      () => context.invalidAdapayPaymentContent.value || context.invalidUnionPaymentContent.value,
    ),

    // ---- 支付信息 ----
    displayOrderNo: context.displayOrderNo,
    displayAmountCny: context.displayAmountCny,
    displayRequirementLabel: context.displayRequirementLabel,
    displayRequirementId: context.displayRequirementId,
    couponCode: computed(() => ctx.value.couponCode),
    expiresAt: computed(() => ctx.value.expiresAt),
    isExpired: context.isExpired,
    countdownText: context.countdownText,

    // ---- 动作 ----
    goBack,
    launchWechatPayment: () => jsapi.launchWechatPayment(),
    retryMiddlePageAuth: middle.retryMiddlePageAuth,
    createIntentAdapayOrder: () => intentOrder.createIntentAdapayOrder(),
  }
}

export type PaymentPage = ReturnType<typeof usePaymentPage>
