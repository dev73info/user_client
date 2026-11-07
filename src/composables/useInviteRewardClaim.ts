/**
 * 邀请现金奖励的数据与领取流程（面板只负责渲染）。
 *
 * 交互分支：
 * - 微信内（UA 含 MicroMessenger 且 WeixinJSBridge 可用）：逐单 `requestMerchantTransfer`，
 *   回调后查单并刷新；
 * - 非微信：生成带 `?inviteReward=claim` 的本页二维码，提示到微信里打开；
 *   微信内打开带该参数的本页会自动发起一次领取。
 * - 未绑定微信（409 `WECHAT_NOT_BOUND`）：把 `needWechatLogin` 置真，由面板给登录入口。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import QRCode from 'qrcode'
import { TMessage } from 'ui_73info'

import { HttpError } from '@/api/http'
import {
  claimInviteRewards,
  getInviteRewards,
  syncInviteRewards,
  type InviteRewardClaimPayout,
  type InviteRewardOverview,
} from '@/api/inviteReward'
import { INVITE_REWARD_WECHAT_NOT_BOUND } from '@/shared/api/errorCodes'
import { isWechatBrowser } from '@/shared/auth/browser'
import { invokeTransfer, waitForWeixinBridge } from '@/shared/wechat/merchantTransfer'
import { useAuthStore } from '@/stores/auth'

const CLAIM_QUERY_KEY = 'inviteReward'
const SYNC_DELAY_MS = 10_000

export function useInviteRewardClaim() {
  const auth = useAuthStore()
  const overview = ref<InviteRewardOverview | null>(null)
  const loading = ref(false)
  const claiming = ref(false)
  const loadError = ref('')
  const needWechatLogin = ref(false)
  const qrOpen = ref(false)
  const qrImage = ref('')
  const qrError = ref('')
  const autoClaimTried = ref(false)
  let syncTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 已经拉起过微信确认页、但用户取消/退出后仍未完成的转账单。
   *
   * 这类单不占「可领取」，`available_fen` 可能是 0；但领取接口按契约会返回已有的
   * 非终态单及其 `package_info`，所以仍要允许再走一次 claim 把确认页重新拉起来。
   */
  const payoutNeedsConfirm = computed(() =>
    (overview.value?.payouts ?? []).some(
      (payout) => payout.status === 'wait_user_confirm' && Boolean(payout.package_info),
    ),
  )

  /**
   * 仍在渠道处理中的转账单（`creating` / `processing`）。这类单没有确认页可拉，
   * 页面刷新后必须主动查单，否则按钮会一直禁用、奖励永远卡在「领取中」。
   */
  const payoutNeedsSync = computed(() =>
    (overview.value?.payouts ?? []).some(
      (payout) => payout.status === 'creating' || payout.status === 'processing',
    ),
  )

  async function load() {
    auth.hydrate()
    const token = auth.token.trim()
    if (!token) {
      overview.value = null
      loadError.value = ''
      return
    }

    loading.value = true
    loadError.value = ''
    try {
      overview.value = await getInviteRewards(token)
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : '加载邀请奖励失败'
    } finally {
      loading.value = false
    }
    void maybeAutoClaim()
  }

  /** 带 `?inviteReward=claim` 在微信内打开时自动领一次，领完把参数从地址栏摘掉。 */
  async function maybeAutoClaim() {
    if (autoClaimTried.value || typeof window === 'undefined' || !isWechatBrowser()) return
    const params = new URLSearchParams(window.location.search)
    if (params.get(CLAIM_QUERY_KEY) !== 'claim') return

    autoClaimTried.value = true
    params.delete(CLAIM_QUERY_KEY)
    const search = params.toString()
    const query = search ? `?${search}` : ''
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query}${window.location.hash}`,
    )
    await claim()
  }

  async function syncRewards() {
    const token = auth.token.trim()
    if (!token) return
    try {
      overview.value = await syncInviteRewards(token)
    } catch {
      // 查单失败不打断页面：奖励状态由下一次刷新补齐。
    }
  }

  function scheduleSync() {
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(() => {
      syncTimer = null
      void syncRewards()
    }, SYNC_DELAY_MS)
  }

  async function openClaimQr() {
    qrOpen.value = true
    qrError.value = ''
    if (qrImage.value || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set(CLAIM_QUERY_KEY, 'claim')
    try {
      qrImage.value = await QRCode.toDataURL(url.toString(), {
        width: 240,
        margin: 2,
        errorCorrectionLevel: 'M',
      })
    } catch {
      qrError.value = '二维码生成失败，请在微信中打开本页领取'
    }
  }

  /** 微信内逐单拉起收款页；返回 true 表示这批单不该再走扫码提示。 */
  async function transferInWechat(payouts: InviteRewardClaimPayout[]): Promise<boolean> {
    const billable = payouts.filter((payout) => payout.package_info)
    if (!billable.length) {
      // 没有拉起参数说明渠道单还要稍后查单，不需要再让用户扫码。
      TMessage.info('已提交领取，到账后自动更新')
      return true
    }

    const bridge = await waitForWeixinBridge()
    if (!bridge) return false

    let cancelled = false
    let failed = false
    for (const payout of billable) {
      const outcome = await invokeTransfer(bridge, {
        mchId: payout.mch_id,
        appId: payout.app_id,
        package: payout.package_info ?? '',
      })
      if (outcome === 'cancel') {
        cancelled = true
        break
      }
      if (outcome === 'fail') failed = true
    }

    if (cancelled) TMessage.warning('已取消，可稍后再领')
    else if (failed) TMessage.warning('微信收款未完成，可稍后再领')
    else TMessage.success('已发起收款，请在微信中确认')
    return true
  }

  async function claim() {
    auth.hydrate()
    const token = auth.token.trim()
    const hasAvailable = (overview.value?.available_fen ?? 0) > 0
    if (
      !token ||
      !overview.value?.enabled ||
      (!hasAvailable && !payoutNeedsConfirm.value && !payoutNeedsSync.value) ||
      claiming.value
    ) {
      return
    }

    // 有建单中 / 处理中的单先查单：直接再调 claim 只会拿到 503（锁单保护），
    // 查单后才可能变成可确认、已到账或失败退回可领取。
    if (payoutNeedsSync.value) {
      claiming.value = true
      try {
        await syncRewards()
      } finally {
        claiming.value = false
      }
      return
    }

    claiming.value = true
    needWechatLogin.value = false
    try {
      const result = await claimInviteRewards(token)
      const handled = isWechatBrowser() ? await transferInWechat(result.payouts) : false
      if (!handled) await openClaimQr()
      if (handled) await syncRewards()
      await load()
      const needsSync =
        result.payouts.some((payout) => payout.state === 'processing' || !payout.package_info) ||
        (overview.value?.payouts ?? []).some((payout) => payout.status === 'processing')
      if (needsSync) scheduleSync()
    } catch (error) {
      const message = error instanceof Error ? error.message : '领取邀请奖励失败'
      needWechatLogin.value =
        error instanceof HttpError && error.code === INVITE_REWARD_WECHAT_NOT_BOUND
      TMessage.error(message)
    } finally {
      claiming.value = false
    }
  }

  /** 页面加载 / 重新可见时，若有处理中的转账单，主动查一次渠道状态。 */
  async function syncIfNeeded() {
    if (!payoutNeedsSync.value || !auth.token.trim()) return
    await syncRewards()
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      void load().then(syncIfNeeded)
    }
  }

  onMounted(() => {
    void load().then(syncIfNeeded)
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
    overview,
    loading,
    claiming,
    loadError,
    needWechatLogin,
    payoutNeedsConfirm,
    payoutNeedsSync,
    qrOpen,
    qrImage,
    qrError,
    load,
    claim,
  }
}
