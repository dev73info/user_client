import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { isWechatPaymentAuthorizationRequired } from '@/api/auth'
import {
  completeResourceWechatJsapi,
  getResourceWechatAuthUrl,
  getResourceWechatStatus,
  type ResourcePurchaseOrder,
} from '@/api/resourcePurchase'
import {
  completeTipWechatJsapi,
  getTipWechatAuthUrl,
  getTipWechatStatus,
  type TipOrder,
} from '@/api/tips'
import { parseWechatPayInfo, type WechatJsapiPaymentInfo } from '@/utils/wechatPayment'
import type { PaymentQueryContext } from '@/shared/paymentQuery'
import type { MiddleOrder, MiddlePageApi, MiddlePageBackfill } from '@/shared/paymentMiddleOrder'
import type { PaymentSession } from '@/composables/usePaymentSession'

type MiddlePageCommon = {
  session: PaymentSession
  ctx: () => PaymentQueryContext
  /** 全局支付参数（中间页回填后会同一条链路里重新解析） */
  payInfo: () => WechatJsapiPaymentInfo | null
  isWechatBrowser: () => boolean
  launchPayment: () => void
}

/**
 * 一个中间页的完整流程：OAuth（若需要）→ wx_pub 下单 → 自动调起 JSAPI。
 *
 * 资源购买（R008 / BUG-010）与打赏（R010）形态完全一致，只在订单域与接口上分叉，
 * 所以共用这一套引擎，接口按域注入：改动其中一条分支的行为不会再牵动另一条。
 */
function createMiddlePageFlow<T extends MiddleOrder>(
  common: MiddlePageCommon,
  api: MiddlePageApi<T>,
  backfill: MiddlePageBackfill<T>,
) {
  const { detail, payInfoRaw, creating } = backfill
  /** 已尝试下单：失败后不自动无限重试 */
  const attempted = ref(false)

  /** 授权失败时仍拉一次 status，避免支付信息区空白 */
  async function loadDetail() {
    try {
      const status = await api.getStatus(api.orderNo(), api.token())
      detail.value = status.order
      return status
    } catch {
      return null
    }
  }

  async function run() {
    const { session } = common
    if (!api.active() || session.paid.value || session.wechatSubmitted.value) {
      return
    }
    if (!common.isWechatBrowser()) {
      session.wechatPayError.value = '请用手机微信扫码打开本页后再完成支付。'
      void loadDetail()
      return
    }
    if (creating.value || session.wechatAutoAuthRedirecting.value) {
      return
    }

    const ctx = common.ctx()
    if (ctx.wechatOauthError) {
      session.wechatAuthChecked.value = true
      session.wechatPayError.value = `微信授权失败：${ctx.wechatOauthError}`
      // 授权失败也会挡住下单；仍拉订单详情填支付信息，避免金额 / 单号空白。
      void loadDetail()
      return
    }

    const returnedFromOauth = ctx.wechatOauthReturned
    if (!session.wechatAuthChecked.value) {
      session.wechatAutoAuthRedirecting.value = true
      let authorized = returnedFromOauth
      try {
        const status = await api.getStatus(api.orderNo(), api.token())
        detail.value = status.order
        if (status.order.status === 'paid') {
          session.markPaymentPaid()
          return
        }
        if (!returnedFromOauth) {
          authorized = status.authorized
        }
        session.wechatAuthChecked.value = true
        if (!authorized) {
          const { url, authorized: already } = await api.getAuthUrl(
            api.orderNo(),
            api.token(),
            window.location.href,
          )
          if (already) {
            authorized = true
          } else if (url.trim()) {
            window.location.assign(url)
            return
          } else {
            session.wechatPayError.value = '微信授权地址为空，请返回电脑重新扫码。'
            return
          }
        }
      } catch (err) {
        session.wechatAuthChecked.value = true
        session.wechatPayError.value = err instanceof Error ? err.message : '检查微信授权失败'
        return
      } finally {
        session.wechatAutoAuthRedirecting.value = false
      }
      if (!authorized) {
        return
      }
    }

    if (common.payInfo()) {
      if (!session.wechatAutoInvoked.value) {
        session.wechatAutoInvoked.value = true
        common.launchPayment()
      }
      return
    }

    if (attempted.value) {
      return
    }
    attempted.value = true
    creating.value = true
    session.wechatPayError.value = ''
    try {
      const result = await api.completeJsapi(api.orderNo(), api.token())
      detail.value = result.order
      payInfoRaw.value = result.pay_info
      if (result.order.status === 'paid') {
        session.markPaymentPaid()
        return
      }
      if (!parseWechatPayInfo(result.pay_info)) {
        session.wechatPayError.value = '微信支付参数无效，请返回电脑重新下单。'
        return
      }
      if (!session.wechatAutoInvoked.value) {
        session.wechatAutoInvoked.value = true
        common.launchPayment()
      }
    } catch (err) {
      attempted.value = false
      if (isWechatPaymentAuthorizationRequired(err)) {
        session.wechatAuthChecked.value = false
        attempted.value = false
        await run()
        return
      }
      session.wechatPayError.value =
        err instanceof Error ? err.message : '创建微信支付失败，请重试。'
    } finally {
      creating.value = false
    }
  }

  async function poll() {
    if (!api.active() || common.session.paid.value) {
      return
    }
    try {
      const status = await api.getStatus(api.orderNo(), api.token())
      detail.value = status.order
      if (status.order.status === 'paid') {
        common.session.markPaymentPaid()
      }
    } catch {
      /* 轮询失败不打断 */
    }
  }

  return { detail, payInfoRaw, creating, attempted, run, poll, loadDetail }
}

/**
 * 资源 / 打赏两个中间页（`resource_wechat=1` / `tip_wechat=1`）。
 *
 * 对外只暴露「当前这条中间页该跑什么」：`runActive` / `pollActive` / `retryMiddlePageAuth`，
 * 页面级 composable 不需要知道现在是哪一条。
 */
export function useWechatMiddlePage(
  common: MiddlePageCommon,
  backfill: {
    resource: MiddlePageBackfill<ResourcePurchaseOrder>
    tip: MiddlePageBackfill<TipOrder>
  },
) {
  const route = useRoute()
  const router = useRouter()

  /** 清掉 URL 上的授权错误参数再重跑（微信授权失败后「重新授权并支付」） */
  async function clearOauthQuery() {
    const nextQuery = { ...route.query } as Record<string, string | string[] | undefined>
    delete nextQuery.wechat_oauth_error
    delete nextQuery.wechat_oauth
    await router.replace({ query: nextQuery })
  }

  const resource = createMiddlePageFlow<ResourcePurchaseOrder>(
    common,
    {
      active: () => common.ctx().isResourceWechat,
      orderNo: () => common.ctx().resourceOrderNo,
      token: () => common.ctx().resourceToken,
      getStatus: getResourceWechatStatus,
      getAuthUrl: getResourceWechatAuthUrl,
      completeJsapi: completeResourceWechatJsapi,
    },
    backfill.resource,
  )

  const tip = createMiddlePageFlow<TipOrder>(
    common,
    {
      active: () => common.ctx().isTipWechat,
      orderNo: () => common.ctx().tipOrderNo,
      token: () => common.ctx().tipToken,
      getStatus: getTipWechatStatus,
      getAuthUrl: getTipWechatAuthUrl,
      completeJsapi: completeTipWechatJsapi,
    },
    backfill.tip,
  )

  /** 当前命中的那条中间页（未命中返回 null） */
  function activeFlow() {
    const ctx = common.ctx()
    if (ctx.isTipWechat) return tip
    if (ctx.isResourceWechat) return resource
    return null
  }

  async function runActive() {
    const flow = activeFlow()
    if (flow) await flow.run()
  }

  async function pollActive() {
    const flow = activeFlow()
    if (flow) await flow.poll()
  }

  /** 中间页「重新授权并支付」：清掉授权错误参数后重跑当前流程 */
  async function retryMiddlePageAuth() {
    const flow = activeFlow()
    if (!flow) return
    common.session.wechatPayError.value = ''
    common.session.wechatAuthChecked.value = false
    flow.attempted.value = false
    await clearOauthQuery()
    await flow.run()
  }

  return { resource, tip, runActive, pollActive, retryMiddlePageAuth }
}

export type WechatMiddlePage = ReturnType<typeof useWechatMiddlePage>
