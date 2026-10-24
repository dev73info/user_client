/**
 * 「资金明细」的状态与请求：两路**契约里真实存在**的台账 + 父级传入的收入凭据 → 合成一张
 * 按时间倒序的表，再交给共享的 `useClientPagination` 做前端分页。
 *
 * 视图只负责排版，金额/文案/合并规则都在 `shared/devFundDisplay.ts`。
 */
import { computed, onMounted, ref } from 'vue'
import { TMessage } from 'ui_73info'

import {
  listDevWithdrawals,
  type DevWalletIncomeItem,
  type DevWithdrawalRecord,
} from '@/api/devWallet'
import { useClientPagination } from '@/composables/useClientPagination'
import { buildFundRecords, filterFundRecords } from '@/shared/devFundDisplay'
import { useAuthStore } from '@/stores/auth'

export type DevFundRecordsProps = { income: DevWalletIncomeItem[]; keyword?: string }

export function useDevFundRecords(props: DevFundRecordsProps) {
  const auth = useAuthStore()

  const loading = ref(false)
  const withdrawals = ref<DevWithdrawalRecord[]>([])

  /** 两类台账合成一段（收入 / 退款冲减 / 收入提现），按时间倒序。 */
  const records = computed(() =>
    buildFundRecords({
      income: props.income,
      incomeWithdrawals: withdrawals.value,
    }),
  )

  /* 关键字由父级的统一工具栏传入（与其它列表页的搜索同口径），只过滤已加载的记录。 */
  const filteredRecords = computed(() => filterFundRecords(records.value, props.keyword))

  /* 分页走共享的 useClientPagination：与「资源列表 / 团队资源 / 我的接单」
     同一套页码与每页条数口径，不再在本页手写 slice 与 Math.min 回退。 */
  const {
    page,
    pageSize,
    total: recordTotal,
    paged: pagedRecords,
  } = useClientPagination(filteredRecords)

  /** 提现台账取 `GET /api/payment/withdrawals`：收入那一半由父级传进来，不在这里重取。 */
  async function loadRecords() {
    if (!auth.token) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }

    loading.value = true
    try {
      withdrawals.value = await listDevWithdrawals(auth.token)
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载提现记录失败')
    } finally {
      loading.value = false
    }
  }

  onMounted(async () => {
    auth.hydrate()
    await loadRecords()
  })

  return { loading, page, pageSize, recordTotal, pagedRecords, loadRecords }
}
