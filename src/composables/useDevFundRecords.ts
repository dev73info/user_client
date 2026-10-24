/**
 * 「资金明细」的状态与请求：三路台账 + 父级传入的收入凭据 → 合成一张按时间倒序的表，
 * 再交给共享的 `useClientPagination` 做前端分页。
 *
 * 视图只负责排版，金额/文案/合并规则都在 `shared/devFundDisplay.ts`。
 */
import { computed, onMounted, ref } from 'vue'

import {
  getDevOrderDepositOrders,
  getDevOrderDepositWithdrawalSummary,
  type DevOrderDepositOrderSummary,
  type DevOrderDepositWithdrawalSummary,
} from '@/api/devOrderDeposit'
import {
  getDevWithdrawalSummary,
  type DevWalletIncomeItem,
  type DevWithdrawalSummary,
} from '@/api/devWallet'
import { useClientPagination } from '@/composables/useClientPagination'
import { buildFundRecords, filterFundRecords } from '@/shared/devFundDisplay'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

export type DevFundRecordsProps = { income: DevWalletIncomeItem[]; keyword?: string }

export function useDevFundRecords(props: DevFundRecordsProps) {
  const auth = useAuthStore()

  const loading = ref(false)
  const withdrawalSummary = ref<DevWithdrawalSummary | null>(null)
  const depositWithdrawalSummary = ref<DevOrderDepositWithdrawalSummary | null>(null)
  const depositOrders = ref<DevOrderDepositOrderSummary[]>([])

  /** 四类台账合成一段（保证金充值 / 保证金提现 / 收入 / 退款冲减 / 收入提现），按时间倒序。 */
  const records = computed(() =>
    buildFundRecords({
      depositOrders: depositOrders.value,
      depositWithdrawals: depositWithdrawalSummary.value?.withdrawals ?? [],
      income: props.income,
      incomeWithdrawals: withdrawalSummary.value?.withdrawals ?? [],
    }),
  )

  /* 关键字由父级的统一工具栏传入（与其它列表页的搜索同口径），只过滤已加载的记录。 */
  const filteredRecords = computed(() => filterFundRecords(records.value, props.keyword))

  /* 分页走共享的 useClientPagination：与「资源列表 / 团队资源 / 我的接单 / 保证金退回」
     同一套页码与每页条数口径，不再在本页手写 slice 与 Math.min 回退。 */
  const {
    page,
    pageSize,
    total: recordTotal,
    paged: pagedRecords,
  } = useClientPagination(filteredRecords)

  /** 三类出款/充值台账一次拉齐：任何一路失败都提示出来，但其余几路照旧展示。 */
  async function loadRecords() {
    if (!auth.token) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }

    const token = auth.token
    loading.value = true
    const failures: string[] = []
    const settle = async (label: string, task: Promise<void>) => {
      try {
        await task
      } catch (error) {
        failures.push(`${label}：${error instanceof Error ? error.message : '加载失败'}`)
      }
    }
    await Promise.all([
      settle(
        '收入提现记录',
        (async () => {
          withdrawalSummary.value = await getDevWithdrawalSummary(token)
        })(),
      ),
      settle(
        '保证金提现记录',
        (async () => {
          depositWithdrawalSummary.value = await getDevOrderDepositWithdrawalSummary(token)
        })(),
      ),
      settle(
        '保证金充值记录',
        (async () => {
          depositOrders.value = await getDevOrderDepositOrders(token)
        })(),
      ),
    ])
    if (failures.length > 0) {
      TMessage.error(failures.join('；'))
    }
    loading.value = false
  }

  onMounted(async () => {
    auth.hydrate()
    await loadRecords()
  })

  return { loading, page, pageSize, recordTotal, pagedRecords, loadRecords }
}
