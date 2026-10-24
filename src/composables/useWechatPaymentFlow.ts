import { watch } from 'vue'

import type { WechatJsapiPaymentInfo } from '@/utils/wechatPayment'
import type { PaymentFlags } from '@/shared/paymentFlags'
import type { PaymentQueryContext } from '@/shared/paymentQuery'
import type { PaymentSession } from '@/composables/usePaymentSession'

type UseWechatPaymentFlowOptions = {
  session: PaymentSession
  ctx: () => PaymentQueryContext
  flags: () => PaymentFlags
  isWechatBrowser: () => boolean
  token: () => string
  isAuthed: () => boolean
  payInfo: () => WechatJsapiPaymentInfo | null
  /** 资源 / 打赏中间页：命中时整条链路交给它，主通道不插手 */
  runMiddlePage: () => Promise<void>
  /** 中间页正在建单（建完要重跑一次编排，决定是否调起支付） */
  middleCreating: () => boolean
  creatingIntentOrder: () => boolean
  intentOrderAttempted: () => boolean
  createIntentOrder: () => Promise<void>
  /** 服务端订单状态（`creating` / `created` 才允许自动调起，避免重复下单时抢跑） */
  adapayStatus: () => string
  launchPayment: () => void
}

/**
 * 微信支付的总编排：决定这一次进入页面该走哪条微信链路。
 *
 * 优先级：打赏中间页 → 资源中间页 → 跨设备 handoff → 主通道（意图下单 / 静默授权 / 自动调起）。
 * 微信内打开支付页时自动静默授权（snsapi_base，无确认页）：已登录用户未绑定 open_id 时自动跳转；
 * 授权回调带 `wechat_oauth=success`，据此避免重复跳转造成死循环。
 */
export function useWechatPaymentFlow(options: UseWechatPaymentFlowOptions) {
  async function runWechatFlow() {
    const { session } = options
    const ctx = options.ctx()
    const flags = options.flags()

    if (ctx.isTipWechat || ctx.isResourceWechat) {
      await options.runMiddlePage()
      return
    }

    if (ctx.isHandoff) {
      if (!options.isWechatBrowser()) {
        session.wechatPayError.value = '请用手机微信打开当前页面后再发起支付。'
      } else if (options.payInfo() && !session.wechatAutoInvoked.value) {
        session.wechatAutoInvoked.value = true
        options.launchPayment()
      }
      return
    }

    if (!options.isAuthed() || !options.token()) {
      return
    }
    if (session.wechatAutoAuthRedirecting.value) {
      return
    }
    if (!flags.isWechatPayment) {
      return
    }
    if (flags.isWechatPcPayment && flags.isIntentMode) {
      if (!options.intentOrderAttempted()) await options.createIntentOrder()
      return
    }
    // 移动端微信支付但不在微信内，无法调起 JSAPI
    if (flags.isWechatMobilePayment && !options.isWechatBrowser()) {
      session.wechatPayError.value = '请用手机微信打开当前页面后再发起支付。'
      return
    }
    if (!options.isWechatBrowser()) {
      return
    }
    // 当前契约没有独立支付授权接口；资源订单的授权只在其专属中间页处理。
    session.wechatAuthChecked.value = true

    // 意图模式：订单未创建则先创建
    if (
      flags.isIntentMode &&
      !options.payInfo() &&
      !options.creatingIntentOrder() &&
      !options.intentOrderAttempted()
    ) {
      await options.createIntentOrder()
      return
    }

    // 微信内移动端：订单就绪且未支付时自动调起支付
    if (
      flags.isWechatMobilePayment &&
      options.payInfo() &&
      !session.paid.value &&
      !session.wechatAutoInvoked.value &&
      !options.creatingIntentOrder()
    ) {
      const status = options.adapayStatus()
      if (status !== 'creating' && status !== 'created') {
        return
      }
      session.wechatAutoInvoked.value = true
      options.launchPayment()
    }
  }

  // 这些值任何一个变化都可能让「该走哪条链路」改变（授权回来、订单建成、支付完成…）
  watch(
    [
      () => options.isAuthed(),
      () => options.token(),
      () => options.flags().isWechatPayment,
      () => options.isWechatBrowser(),
      () => options.flags().isIntentMode,
      () => options.ctx().isResourceWechat,
      () => options.ctx().isTipWechat,
      () => options.payInfo(),
      () => options.creatingIntentOrder(),
      () => options.middleCreating(),
      () => options.adapayStatus(),
      () => options.session.paid.value,
    ],
    () => {
      void runWechatFlow()
    },
    { immediate: true },
  )

  return { runWechatFlow }
}
