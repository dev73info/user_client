/**
 * 收益钱包页的「保证金池」：余额三档（充值总额 / 可提现 / 冻结）、退回与提现台账的状态，
 * 以及后台轮询刷新。
 *
 * 轮询的三档节拍是本页最容易踩坑的地方，规则留在 `pollDepositStatus` 与三个常量旁边：
 * 处理中 5s、只剩打款失败（需人工）30s、从后台回到页面 3s 节流，且后台刷新不点亮 loading。
 *
 * 与接单收入池（`useDevWalletOverview`）互不引用：两笔钱分属两个互不相通的池子，
 * 读数各算各的，页面上的「可提现」判定也各用各的余额。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'

import {
  getDevOrderDepositStatus,
  getDevOrderDepositWithdrawalSummary,
  type DevOrderDepositStatus,
  type DevOrderDepositWithdrawalSummary,
} from '@/api/devOrderDeposit'
import { getDevCreditSelf, type DevCreditSelf } from '@/api/devCredit'
import { MIN_WITHDRAW_CNY } from '@/shared/devWalletDisplay'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

// 后台轮询心跳：处理中的记录 5s 检查一次，仅剩打款失败（需人工处理）时放宽到 30s
const DEPOSIT_ACTIVE_POLL_MS = 5000
const DEPOSIT_STALLED_POLL_MS = 30000
// 焦点/可见性触发的刷新最小间隔，避免切换窗口时连续重复请求
const DEPOSIT_BACKGROUND_MIN_INTERVAL_MS = 3000
// 轮询节拍与节流阈值相等时，setInterval 的毫秒级抖动会让整次轮询被跳过，故留出容差
const DEPOSIT_POLL_JITTER_TOLERANCE_MS = 1000
const DEPOSIT_ACTIVE_STATUSES = ['pending_review', 'approved', 'payout_processing']
const DEPOSIT_STALLED_STATUSES = ['payout_failed']

export type LoadDepositOptions = {
  /** 失败时不弹 toast（后台轮询使用） */
  silent?: boolean
  /** 后台刷新：不点亮表格/按钮的 loading 遮罩，避免闪烁 */
  background?: boolean
}

export function useDevWalletDeposit() {
  const auth = useAuthStore()

  const depositLoading = ref(false)
  const depositStatus = ref<DevOrderDepositStatus | null>(null)
  const depositWithdrawalSummary = ref<DevOrderDepositWithdrawalSummary | null>(null)
  const creditInfo = ref<DevCreditSelf | null>(null)

  let depositRefreshTimer: ReturnType<typeof setInterval> | null = null
  // 后台刷新只做并发保护，不点亮 depositLoading，否则表格每 5 秒闪一次遮罩
  let depositFetching = false
  // 记录最后一次刷新的启动时间（而非完成时间），避免请求耗时把下一次轮询挤掉
  let depositRefreshStartedAt = 0

  const depositWithdrawable = computed(
    () => depositWithdrawalSummary.value?.withdrawable_balance_cny ?? 0,
  )
  const depositTotalPaid = computed(() => depositStatus.value?.total_paid_cny ?? 0)
  const canWithdrawDeposit = computed(() => depositWithdrawable.value >= MIN_WITHDRAW_CNY)

  function depositRecordStatuses(): string[] {
    return (depositWithdrawalSummary.value?.withdrawals ?? []).map((record) => record.status)
  }

  function refreshDepositInBackground(minIntervalMs = DEPOSIT_BACKGROUND_MIN_INTERVAL_MS) {
    if (document.visibilityState !== 'visible') return
    if (depositFetching) return
    if (depositRefreshStartedAt && Date.now() - depositRefreshStartedAt < minIntervalMs) return
    void loadDeposit({ silent: true, background: true })
  }

  function refreshDepositWhenVisible() {
    refreshDepositInBackground()
  }

  function pollDepositStatus() {
    const statuses = depositRecordStatuses()
    if (statuses.some((status) => DEPOSIT_ACTIVE_STATUSES.includes(status))) {
      refreshDepositInBackground(DEPOSIT_ACTIVE_POLL_MS - DEPOSIT_POLL_JITTER_TOLERANCE_MS)
      return
    }
    if (statuses.some((status) => DEPOSIT_STALLED_STATUSES.includes(status))) {
      refreshDepositInBackground(DEPOSIT_STALLED_POLL_MS - DEPOSIT_POLL_JITTER_TOLERANCE_MS)
    }
  }

  async function loadDeposit(options: LoadDepositOptions = {}) {
    if (!auth.token || depositFetching) return

    const { silent = false, background = false } = options
    depositFetching = true
    depositRefreshStartedAt = Date.now()
    if (!background) {
      depositLoading.value = true
    }
    try {
      const [status, summary, credit] = await Promise.all([
        getDevOrderDepositStatus(auth.token),
        getDevOrderDepositWithdrawalSummary(auth.token),
        getDevCreditSelf(auth.token).catch(() => null),
      ])
      depositStatus.value = status
      depositWithdrawalSummary.value = summary
      creditInfo.value = credit
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载保证金数据失败'
      if (!silent) TMessage.error(message)
    } finally {
      depositFetching = false
      if (!background) {
        depositLoading.value = false
      }
    }
  }

  // 心跳与「回到页面」共用同一个节流口径：两个入口都只是请 `refreshDepositInBackground` 判断，
  // 所以切窗口时连续触发的 focus / visibilitychange 不会各自发一次请求。
  onMounted(() => {
    depositRefreshTimer = setInterval(pollDepositStatus, DEPOSIT_ACTIVE_POLL_MS)
    document.addEventListener('visibilitychange', refreshDepositWhenVisible)
    window.addEventListener('focus', refreshDepositWhenVisible)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', refreshDepositWhenVisible)
    window.removeEventListener('focus', refreshDepositWhenVisible)
    if (depositRefreshTimer) {
      clearInterval(depositRefreshTimer)
      depositRefreshTimer = null
    }
  })

  return {
    depositLoading,
    depositStatus,
    depositWithdrawalSummary,
    creditInfo,
    depositWithdrawable,
    depositTotalPaid,
    canWithdrawDeposit,
    loadDeposit,
  }
}
