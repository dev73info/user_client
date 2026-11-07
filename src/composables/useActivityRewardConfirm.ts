/**
 * 活动奖励的转账确认流程（活动详情与「我的活动奖励」共用）。
 *
 * 与邀请奖励的 `useInviteRewardClaim` 同一套分支：
 * - 微信内：`requestMerchantTransfer` 拉起确认页，回调后查单并刷新；
 * - 非微信：生成带 `?activityReward=confirm` 的本页二维码，提示到微信里打开；
 *   微信内打开带该参数的本页会自动发起一次确认；
 * - 未绑定微信（409 `WECHAT_NOT_BOUND`）：`needWechatLogin` 置真，由页面给登录入口。
 *
 * 活动域没有单独的「领取」接口：`POST /activities/rewards/sync` 既对非终态单查渠道状态，
 * 也把待入账奖励推进成转账单，所以确认前先查一次单，再按返回的 payout 拉起确认页。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import QRCode from 'qrcode'
import { TMessage } from 'ui_73info'

import type { ActivityPayoutItem } from '@/api/activities'
import { HttpError } from '@/api/http'
import { hasActiveActivityPayout, hasConfirmableActivityPayout } from '@/shared/activity'
import { WECHAT_NOT_BOUND } from '@/shared/api/errorCodes'
import { isWechatBrowser } from '@/shared/auth/browser'
import { invokeTransfer, waitForWeixinBridge } from '@/shared/wechat/merchantTransfer'

const CONFIRM_QUERY_KEY = 'activityReward'
const SYNC_DELAY_MS = 10_000

type ActivityRewardConfirmOptions = {
  /** 当前页面的转账单（页面的响应式数据）。 */
  payouts: () => readonly ActivityPayoutItem[]
  /** 查单：返回渠道核对后的最新转账单。 */
  sync: () => Promise<ActivityPayoutItem[]>
  /** 重新拉取页面数据。 */
  reload: () => Promise<void>
  /** 是否还有待入账奖励（决定按钮能否点）。 */
  hasPending?: () => boolean
}

function billablePayouts(payouts: readonly ActivityPayoutItem[]): ActivityPayoutItem[] {
  return payouts.filter(
    (payout) => payout.status === 'wait_user_confirm' && Boolean(payout.package_info),
  )
}

export function useActivityRewardConfirm(options: ActivityRewardConfirmOptions) {
  const confirming = ref(false)
  const needWechatLogin = ref(false)
  const qrOpen = ref(false)
  const qrImage = ref('')
  const qrError = ref('')
  const autoConfirmTried = ref(false)
  let syncTimer: ReturnType<typeof setTimeout> | null = null

  /** 有待确认单或处理中的单时，即使没有待入账奖励也允许点一次（拉起确认页 / 查单）。 */
  const canConfirm = computed(() => {
    const payouts = options.payouts()
    return (
      !confirming.value &&
      (hasConfirmableActivityPayout(payouts) ||
        hasActiveActivityPayout(payouts) ||
        (options.hasPending?.() ?? false))
    )
  })

  const confirmLabel = computed(() =>
    hasActiveActivityPayout(options.payouts()) ? '刷新转账状态' : '确认收款',
  )

  async function syncInBackground() {
    try {
      await options.sync()
    } catch {
      // 查单失败不打断页面：状态由下一次刷新补齐。
    }
  }

  function scheduleSync() {
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(() => {
      syncTimer = null
      void syncInBackground()
    }, SYNC_DELAY_MS)
  }

  async function openConfirmQr() {
    qrOpen.value = true
    qrError.value = ''
    if (qrImage.value || typeof window === 'undefined') return

    const url = new URL(window.location.href)
    url.searchParams.set(CONFIRM_QUERY_KEY, 'confirm')
    try {
      qrImage.value = await QRCode.toDataURL(url.toString(), {
        width: 240,
        margin: 2,
        errorCorrectionLevel: 'M',
      })
    } catch {
      qrError.value = '二维码生成失败，请在微信中打开本页确认收款'
    }
  }

  /** 微信内逐单拉起收款页；返回 true 表示这批单不该再走扫码提示。 */
  async function transferInWechat(payouts: readonly ActivityPayoutItem[]): Promise<boolean> {
    const billable = billablePayouts(payouts)
    if (!billable.length) {
      if (hasActiveActivityPayout(payouts)) TMessage.info('已提交转账，到账后自动更新')
      else TMessage.info('暂无可确认的转账')
      return true
    }
    if (!isWechatBrowser()) return false

    const bridge = await waitForWeixinBridge()
    if (!bridge) return false

    let cancelled = false
    let failed = false
    for (const payout of billable) {
      const outcome = await invokeTransfer(bridge, {
        mchId: payout.mch_id ?? '',
        appId: payout.app_id ?? '',
        package: payout.package_info ?? '',
      })
      if (outcome === 'cancel') {
        cancelled = true
        break
      }
      if (outcome === 'fail') failed = true
    }

    if (cancelled) TMessage.warning('已取消，可稍后确认')
    else if (failed) TMessage.warning('微信收款未完成，可稍后确认')
    else TMessage.success('已发起收款，请在微信中确认')
    return true
  }

  async function confirm() {
    if (confirming.value) return
    confirming.value = true
    needWechatLogin.value = false
    try {
      const payouts = await options.sync()
      const handled = await transferInWechat(payouts)
      if (!handled) await openConfirmQr()
      if (handled) await options.sync()
      await options.reload()
      if (hasActiveActivityPayout(payouts) || hasActiveActivityPayout(options.payouts())) {
        scheduleSync()
      }
    } catch (error) {
      needWechatLogin.value = error instanceof HttpError && error.code === WECHAT_NOT_BOUND
      TMessage.error(error instanceof Error ? error.message : '确认收款失败')
    } finally {
      confirming.value = false
    }
  }

  /** 带 `?activityReward=confirm` 在微信内打开时自动确认一次，并把参数从地址栏摘掉。 */
  async function maybeAutoConfirm() {
    if (autoConfirmTried.value || typeof window === 'undefined' || !isWechatBrowser()) return
    const params = new URLSearchParams(window.location.search)
    if (params.get(CONFIRM_QUERY_KEY) !== 'confirm') return

    autoConfirmTried.value = true
    params.delete(CONFIRM_QUERY_KEY)
    const search = params.toString()
    const query = search ? `?${search}` : ''
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query}${window.location.hash}`,
    )
    await confirm()
  }

  /** 页面数据加载完成后调用：有处理中的转账单就主动查一次。 */
  async function syncIfNeeded() {
    if (!hasActiveActivityPayout(options.payouts())) return
    await syncInBackground()
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      void options.reload().then(syncIfNeeded)
    }
  }

  onMounted(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }
  })

  onBeforeUnmount(() => {
    if (syncTimer) clearTimeout(syncTimer)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  })

  return {
    confirming,
    canConfirm,
    confirmLabel,
    needWechatLogin,
    qrOpen,
    qrImage,
    qrError,
    confirm,
    maybeAutoConfirm,
    syncIfNeeded,
  }
}
