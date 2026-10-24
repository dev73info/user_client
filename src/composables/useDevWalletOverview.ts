/**
 * 收益钱包页的「接单收入池」：余额读数、提现偏好（自动提现开关 + 出款通道状态）、
 * 手动提现入口是否可点，以及这两条出款路径共用的动作。
 *
 * 视图只把这里的东西摆到卡片上。契约里只有这一个资金池：接单保证金由后端在接单时
 * 从可提现收益里冻结（`GET /api/payment/freeze-details` 可查冻结明细），没有第二个钱包。
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  getDevWalletOverview,
  getDevWithdrawalBalance,
  getDevWithdrawalSetting,
  updateDevWithdrawalSetting,
  type DevWalletIncomeItem,
  type DevWalletOverview,
  type DevWithdrawalSetting,
} from '@/api/devWallet'
import { MIN_WITHDRAW_FEN } from '@/shared/devWalletDisplay'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/** 出款说明兜底文案：正常情况下由后端 `payout_schedule_note` 下发，只在设置接口失败时兜底。 */
const DEFAULT_PAYOUT_SCHEDULE_NOTE = '限额内可自动出款，其余提现进入人工审核'

export function useDevWalletOverview() {
  const auth = useAuthStore()
  const router = useRouter()

  const loading = ref(false)
  const overview = ref<DevWalletOverview | null>(null)
  /**
   * 当前可提现（分）：`DevWalletResponse.withdrawable_balance_cny` 是元，且只作展示，
   * 拿它乘 100 判门槛会引入浮点误差；额度以额度端点为准。
   */
  const withdrawableFen = ref(0)
  /** 自动提现开关与出款通道状态；两者都由这一个对象推导，不做本地先翻转再回滚。 */
  const withdrawalSetting = ref<DevWithdrawalSetting | null>(null)
  const autoWithdrawSaving = ref(false)

  const recentIncome = computed<DevWalletIncomeItem[]>(() => overview.value?.recent_income ?? [])
  const canWithdraw = computed(() => withdrawableFen.value >= MIN_WITHDRAW_FEN)

  /** 设置接口是否已经返回：返回前不判断通道状态，避免误报「通道未就绪」。 */
  const withdrawalSettingLoaded = computed(() => withdrawalSetting.value !== null)
  const payoutChannelReady = computed(() => withdrawalSetting.value?.payout_channel_ready ?? false)
  const payoutChannelMessage = computed(() => withdrawalSetting.value?.auto_payout_blocked_reason ?? '')
  /** 通道状态未知时按就绪处理，真正的拦截交给后端，避免一次请求失败就禁用提现入口。 */
  const payoutChannelUsable = computed(
    () => withdrawalSettingLoaded.value === false || payoutChannelReady.value,
  )
  const autoWithdrawEnabled = computed(
    () => withdrawalSetting.value?.auto_withdraw_enabled ?? false,
  )
  const payoutScheduleNote = computed(
    () => withdrawalSetting.value?.auto_payout_note || DEFAULT_PAYOUT_SCHEDULE_NOTE,
  )
  /** 手动提现入口：余额达标且出款通道可用（自动提现开启时仍允许手动发起） */
  const canSubmitWithdrawal = computed(() => canWithdraw.value && payoutChannelUsable.value)
  /** 自动提现开关：通道不可用时禁用（已开启的开关要允许关闭） */
  const autoWithdrawReady = computed(() => payoutChannelUsable.value || autoWithdrawEnabled.value)

  async function loadWallet() {
    if (!auth.token) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }

    loading.value = true
    try {
      const [wallet, balance, setting] = await Promise.all([
        getDevWalletOverview(auth.token),
        // 额度与偏好各自失败都不影响总览读数：拿不到就不做本地门槛判断，交给后端拦。
        getDevWithdrawalBalance(auth.token).catch(() => null),
        getDevWithdrawalSetting(auth.token).catch(() => null),
      ])
      overview.value = wallet
      withdrawableFen.value = balance?.withdrawable_fen ?? 0
      if (setting) {
        withdrawalSetting.value = setting
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载钱包失败'
      TMessage.error(message)
    } finally {
      loading.value = false
    }
  }

  /**
   * 自动提现开关的切换：等服务端确认后再改开关状态。
   *
   * 出款通道未就绪时后端会拒绝开启，此时开关保持原样并把原因提示给开发者；
   * 开关状态只由 `withdrawalSetting` 推导，所以这里失败什么都不做，界面自然停在原位，
   * 不需要先翻转再回滚。
   */
  async function toggleAutoWithdraw(next: boolean): Promise<void> {
    if (!auth.token || autoWithdrawSaving.value) {
      return
    }

    autoWithdrawSaving.value = true
    try {
      withdrawalSetting.value = await updateDevWithdrawalSetting(auth.token, next)
      TMessage.success(
        next
          ? '已开启自动提现，限额内的申请将自动出款'
          : '已关闭自动提现，之后的申请将进入人工审核',
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : next ? '开启自动提现失败' : '关闭自动提现失败'
      TMessage.error(message)
    } finally {
      autoWithdrawSaving.value = false
    }
  }

  /** 跳转账号中心绑定或修改收款银行卡（手动与自动提现的前置条件） */
  function goBindSettlementAccount() {
    void router.push({ name: 'workbench-account', query: { settle: '1' } })
  }

  return {
    loading,
    overview,
    withdrawableFen,
    withdrawalSetting,
    autoWithdrawSaving,
    recentIncome,
    canWithdraw,
    withdrawalSettingLoaded,
    payoutChannelReady,
    payoutChannelMessage,
    payoutChannelUsable,
    autoWithdrawEnabled,
    autoWithdrawReady,
    payoutScheduleNote,
    canSubmitWithdrawal,
    loadWallet,
    toggleAutoWithdraw,
    goBindSettlementAccount,
  }
}
