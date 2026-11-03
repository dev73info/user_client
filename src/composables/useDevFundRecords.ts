/**
 * 「资金明细」的状态与请求：两路**契约里真实存在**的台账 + 父级传入的收入凭据 → 合成一张
 * 按时间倒序的表，再交给共享的 `useClientPagination` 做前端分页。
 *
 * 视图只负责排版，金额/文案/合并规则都在 `shared/devFundDisplay.ts`。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { TMessage } from 'ui_73info'

import {
  listDevWithdrawals,
  type DevWalletIncomeItem,
  type DevWithdrawalRecord,
} from '@/api/devWallet'
import {
  listMyPrepaidWithdrawals,
  type PrepaidLedgerEntry,
  type PrepaidWithdrawal,
} from '@/api/devOrderDeposit'
import { useClientPagination } from '@/composables/useClientPagination'
import { buildFundRecords, filterFundRecords, type FundRecordKind } from '@/shared/devFundDisplay'
import { useAuthStore } from '@/stores/auth'

export type DevFundRecordsProps = {
  income: DevWalletIncomeItem[]
  /** 预付账户流水（保证金充值 / 提现）；父级从保证金读数里带下来。 */
  depositLedger?: PrepaidLedgerEntry[]
  keyword?: string
  kind?: FundRecordKind | 'all'
}

export function useDevFundRecords(props: DevFundRecordsProps) {
  const auth = useAuthStore()

  const loading = ref(false)
  const withdrawals = ref<DevWithdrawalRecord[]>([])
  const depositWithdrawals = ref<PrepaidWithdrawal[]>([])
  const loadedToken = ref<string | null>(null)

  /** 三类台账合成一段（收入 / 退款冲减 / 接单收入提现 / 保证金充值 / 保证金提现），按时间倒序。 */
  const records = computed(() =>
    buildFundRecords({
      income: props.income,
      incomeWithdrawals: withdrawals.value,
      depositLedger: props.depositLedger ?? [],
      depositWithdrawals: depositWithdrawals.value,
    }),
  )

  /* 关键字与类型由父级的统一工具栏传入（与其它列表页的搜索同口径），只过滤已加载的记录。 */
  const filteredRecords = computed(() =>
    filterFundRecords(records.value, props.keyword, props.kind),
  )

  /* 分页走共享的 useClientPagination：与「资源列表 / 团队资源 / 我的接单」
     同一套页码与每页条数口径，不再在本页手写 slice 与 Math.min 回退。 */
  const {
    page,
    pageSize,
    total: recordTotal,
    paged: pagedRecords,
  } = useClientPagination(filteredRecords)

  /* 换类型筛选要回到第 1 页，否则会停在一个已经不存在的页码上。 */
  watch(
    () => props.kind,
    () => {
      page.value = 1
    },
  )

  /** 两路出款台账：接单收入提现（`/payment/withdrawals`）与保证金提现（预付账户）。
   *  收入那一半由父级传进来，不在这里重取；保证金充值流水同样来自父级的读数。 */
  async function loadRecords() {
    const token = auth.token
    if (!token) {
      // 首次进入时自动登录可能还没完成；令牌就绪后由下面的 watch 触发。
      return
    }

    loading.value = true
    try {
      const [incomeResult, depositResult] = await Promise.allSettled([
        listDevWithdrawals(token),
        listMyPrepaidWithdrawals(token),
      ])
      if (incomeResult.status === 'rejected') {
        throw incomeResult.reason
      }
      withdrawals.value = incomeResult.value
      // 保证金提现读不到不该让整张表进错误态：少一类行，其余照常显示。
      depositWithdrawals.value = depositResult.status === 'fulfilled' ? depositResult.value : []
      loadedToken.value = token
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载提现记录失败')
    } finally {
      loading.value = false
    }
  }

  onMounted(() => auth.hydrate())
  watch(
    () => auth.token,
    (token) => {
      if (token && token !== loadedToken.value) {
        void loadRecords()
      }
    },
    { immediate: true },
  )

  return { loading, page, pageSize, recordTotal, pagedRecords, loadRecords }
}
