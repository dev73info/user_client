import { computed, ref } from 'vue'

/**
 * 支付页跨通道共享的状态。
 *
 * 「已到账」「微信是否已提交」「错误提示」这几样被 6 条子流程（Adapay 查单、微信 JSAPI、
 * 静默授权、意图下单、资源中间页、打赏中间页）同时读写，所以单独抽出来，
 * 由页面级 composable 创建一次、按依赖注入给各子流程，避免各自持有一份导致页面自相矛盾。
 */
export function usePaymentSession() {
  /** 平台已确认收款（不是「微信返回成功」——后者只代表支付动作发出去了） */
  const paid = ref(false)
  /** 微信客户端已回调 `:ok`：PC 端到账以电脑端订单为准，所以它与 `paid` 分开 */
  const wechatSubmitted = ref(false)
  /** 查单失败原因（展示在支付结果区 / 支付信息栏） */
  const confirmationError = ref('')
  /** 微信链路（授权 / 下单 / 调起）的错误提示 */
  const wechatPayError = ref('')
  /** 本次进入页面是否已确认过微信授权状态，避免重复跳授权 */
  const wechatAuthChecked = ref(false)
  /** 正在跳微信授权（防重入） */
  const wechatAutoAuthRedirecting = ref(false)
  /** 微信支付是否已自动调起过一次（防重复调起） */
  const wechatAutoInvoked = ref(false)

  /** 支付结果区：已到账或微信已返回成功，都从「支付入口」切到「支付结果」 */
  const paymentResultVisible = computed(() => paid.value || wechatSubmitted.value)

  function markPaymentPaid() {
    paid.value = true
    confirmationError.value = ''
  }

  return {
    paid,
    wechatSubmitted,
    confirmationError,
    wechatPayError,
    wechatAuthChecked,
    wechatAutoAuthRedirecting,
    wechatAutoInvoked,
    paymentResultVisible,
    markPaymentPaid,
  }
}

export type PaymentSession = ReturnType<typeof usePaymentSession>
