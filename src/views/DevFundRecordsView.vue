<script setup lang="ts">
/**
 * 资金明细：开发者自己的**全部资金进出**合成一张表。
 *
 * 四类动作各有各的台账，此前分成「保证金退回」与「收入记录」两段（各自一张表、各一套列），
 * 看一遍钱怎么走要来回切：这里按时间倒序拼成一段，用「类型」区分——
 *
 * | 类型 | 数据来源 | 说明 |
 * | --- | --- | --- |
 * | 保证金充值 | `GET /dev/payments/developer-order-deposit/orders` | 已支付的充值单（未支付/失败/关闭的不算钱进来） |
 * | 保证金提现 | `GET /dev/payments/developer-order-deposit/withdrawals` | 保证金退回原充值订单的出款单 |
 * | 收入 | 父级传进来的 `income`（钱包总览的到账凭据） | 每个里程碑分账到账一笔 |
 * | 收入提现 | `GET /dev/payments/withdrawals` | 接单收入的提现出款单 |
 *
 * 金额一律按**正数**展示、方向靠「类型」区分（与原来的收入记录同一口径），不做正负号——
 * 四类混排时符号容易被读成「同一笔钱的加减」，而它们分属两个互不相通的池子（保证金 / 接单收入）。
 */
import { computed, onMounted, ref } from 'vue'

import {
  getDevOrderDepositOrders,
  getDevOrderDepositWithdrawalSummary,
  type DevOrderDepositOrderSummary,
  type DevOrderDepositWithdrawalRecord,
  type DevOrderDepositWithdrawalSummary,
} from '@/api/devOrderDeposit'
import {
  getDevWithdrawalSummary,
  type DevWalletIncomeItem,
  type DevWithdrawalRecord,
  type DevWithdrawalSummary,
} from '@/api/devWallet'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'


import { TMessage, TOption, TPagination, TSelect, TTable, TTableColumn, TTag } from 'ui_73info'

/** 四类资金动作：类型标签 + 金额着色 + 那一行的说明怎么拼。 */
type FundRecordKind = 'deposit_recharge' | 'deposit_withdrawal' | 'income' | 'income_reversal' | 'income_withdrawal'

type FundRecord = {
  key: string
  kind: FundRecordKind
  id: string
  amount: number
  detail: string
  account: string
  status: string
  tag: 'success' | 'info' | 'warning' | 'danger'
  note: string
  reference: string
  time: string
}

const KIND_LABELS: Record<FundRecordKind, string> = {
  deposit_recharge: '保证金充值',
  deposit_withdrawal: '保证金提现',
  income: '收入',
  income_reversal: '退款冲减',
  income_withdrawal: '收入提现',
}

const auth = useAuthStore()
const props = defineProps<{ income: DevWalletIncomeItem[]; keyword?: string }>()

const loading = ref(false)
const withdrawalSummary = ref<DevWithdrawalSummary | null>(null)
const depositWithdrawalSummary = ref<DevOrderDepositWithdrawalSummary | null>(null)
const depositOrders = ref<DevOrderDepositOrderSummary[]>([])

/** 收入提现出款单（接单收入那一侧）。 */
const incomeWithdrawals = computed<DevWithdrawalRecord[]>(
  () => withdrawalSummary.value?.withdrawals ?? [],
)
/** 保证金提现出款单（保证金那一侧）。 */
const depositWithdrawals = computed<DevOrderDepositWithdrawalRecord[]>(
  () => depositWithdrawalSummary.value?.withdrawals ?? [],
)

const records = computed<FundRecord[]>(() => {
  const merged: FundRecord[] = []

  // 保证金充值：到账即一笔；充值单上没有收款账户（钱是从开发者自己的支付渠道进来的）。
  for (const order of depositOrders.value) {
    merged.push({
      key: `deposit_recharge:${order.payment_id}`,
      kind: 'deposit_recharge',
      id: order.payment_id,
      amount: order.amount_cny,
      detail: '保证金充值',
      account: '渠道：Adapay',
      status: '已到账',
      tag: 'success',
      note: '-',
      reference: order.payment_id,
      time: order.created_at,
    })
  }

  for (const record of depositWithdrawals.value) {
    merged.push({
      key: `deposit_withdrawal:${record.withdrawal_id}`,
      kind: 'deposit_withdrawal',
      id: record.withdrawal_id,
      amount: record.amount_cny,
      detail: `保证金提现 · ${record.account_name}`,
      account: record.account_no_masked,
      status: depositWithdrawalStatusText(record.status),
      tag: statusTagType(record.status),
      note: record.review_note || record.payout_failure_message || '-',
      reference: record.paid_reference || '-',
      time: record.created_at,
    })
  }

  for (const record of props.income) {
    // 「收入」行永远记**到账**了多少。此前这里取的是净额，一次售后退款就把那一行改写成
    // ¥0.00——既看不出这笔钱到过账，也和「累计收入」对不上。
    merged.push({
      key: `income:${record.payment_id}`,
      kind: 'income',
      id: record.payment_id,
      amount: record.gross_amount_cny,
      detail: record.title,
      account: `${record.requirement_id} · ${record.customer}`,
      status: '已入账',
      tag: 'success',
      note: '-',
      reference: record.payment_id,
      time: record.paid_at,
    })
    // 售后按原分账份额收回的那部分单独成行：钱往哪走了看得见，也不用回头改历史收入行。
    if (record.refund_developer_cny > 0) {
      // 这一行的金额是**从开发者这里收回的份额**，不是客户实收：结单后的退款由渠道按原分账
      // 份额从各方收回去，平台会按自己的服务费承担一部分（实测：客户申请 199.00，
      // 开发者份额 160.00 = 128.00 + 32.00，余下 39.00 由平台出）。两个数摆在一起，
      // 免得 128.00 / 32.00 被读成「客户只退了 160」。
      const shareNote =
        record.requirement_refund_cny > record.refund_developer_cny
          ? `本次退款客户实收 ${money(record.requirement_refund_cny)}（含平台按服务费承担的部分），此处只记从开发者收回的份额`
          : '售后退款按原分账份额从开发者收回'
      merged.push({
        key: `income_reversal:${record.payment_id}`,
        kind: 'income_reversal',
        id: record.payment_id,
        amount: record.refund_developer_cny,
        detail: `退款冲减（开发者份额）· ${record.title}`,
        account: `${record.requirement_id} · ${record.customer}`,
        status: '已冲减',
        tag: 'danger',
        note: shareNote,
        reference: record.payment_id,
        time: record.refunded_at ?? record.paid_at,
      })
    }
  }

  for (const record of incomeWithdrawals.value) {
    merged.push({
      key: `income_withdrawal:${record.withdrawal_id}`,
      kind: 'income_withdrawal',
      id: record.withdrawal_id,
      amount: record.amount_cny,
      detail: `收入提现 · ${record.account_name}`,
      account: record.account_no_masked,
      status: incomeWithdrawalStatusText(record.status),
      tag: statusTagType(record.status),
      note: record.review_note || record.payout_failure_message || '-',
      reference: record.paid_reference || '-',
      time: record.created_at,
    })
  }

  return merged.sort((first, second) => second.time.localeCompare(first.time))
})

/* 关键字由父级的统一工具栏传入（与其它列表页的搜索同口径），只过滤已加载的记录。 */
const filteredRecords = computed(() => {
  const keyword = (props.keyword ?? '').trim().toLowerCase()
  if (!keyword) {
    return records.value
  }
  return records.value.filter((record) =>
    [
      record.id,
      KIND_LABELS[record.kind],
      record.detail,
      record.account,
      record.status,
      record.note,
      record.reference,
      record.time,
    ].some((field) => String(field ?? '').toLowerCase().includes(keyword)),
  )
})

/* 分页走共享的 useClientPagination：与「资源列表 / 团队资源 / 我的接单 / 保证金退回」
   同一套页码与每页条数口径，不再在本页手写 slice 与 Math.min 回退。 */
const {
  page,
  pageSize,
  total: recordTotal,
  paged: pagedRecords,
} = useClientPagination(filteredRecords)

onMounted(async () => {
  auth.hydrate()
  await loadRecords()
})

function money(value?: number | null) {
  if (value == null) {
    return '¥0.00'
  }
  return `¥${value.toFixed(2)}`
}

/** 接单收入提现的状态文案（与钱包页原来的口径一致）。 */
function incomeWithdrawalStatusText(status: DevWithdrawalRecord['status']) {
  const map: Record<DevWithdrawalRecord['status'], string> = {
    pending_review: '待审核',
    approved: '待出款',
    payout_processing: '出款中（T+1）',
    payout_failed: '出款失败',
    rejected: '已驳回',
    paid: '已到账',
  }
  return map[status]
}

/** 保证金提现（退回原充值订单）的状态文案（与保证金那一段原来的口径一致）。 */
function depositWithdrawalStatusText(status: DevOrderDepositWithdrawalRecord['status']) {
  const map: Record<DevOrderDepositWithdrawalRecord['status'], string> = {
    pending_review: '待审核',
    approved: '待退回',
    payout_processing: '退回处理中',
    payout_failed: '退回需处理',
    rejected: '已驳回',
    paid: '已退回',
  }
  return map[status]
}

function statusTagType(
  status: DevWithdrawalRecord['status'] | DevOrderDepositWithdrawalRecord['status'],
): 'warning' | 'success' | 'danger' | 'info' {
  if (status === 'pending_review') {
    return 'warning'
  }
  if (status === 'approved' || status === 'payout_processing') {
    return 'info'
  }
  if (status === 'paid') {
    return 'success'
  }
  return 'danger'
}

/** 三类出款/充值台账一次拉齐：任何一路失败都提示出来，但其余几路照旧展示。 */
async function loadRecords() {
  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

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
    settle('收入提现记录', (async () => {
      withdrawalSummary.value = await getDevWithdrawalSummary(auth.token)
    })()),
    settle('保证金提现记录', (async () => {
      depositWithdrawalSummary.value = await getDevOrderDepositWithdrawalSummary(auth.token)
    })()),
    settle('保证金充值记录', (async () => {
      depositOrders.value = await getDevOrderDepositOrders(auth.token)
    })()),
  ])
  if (failures.length > 0) {
    TMessage.error(failures.join('；'))
  }
  loading.value = false
}
</script>

<template>
  <div class="fund-records" aria-label="资金明细">
    <TTable :loading="loading" class="dev-table wallet-records__table" :data="pagedRecords" row-key="key" stripe>
      <template #empty>
        <p class="dev-empty-state">{{ loading ? '记录加载中' : '暂无资金记录' }}</p>
      </template>
      <TTableColumn label="类型" width="110">
        <template #default="scope">
          <TTag variant="outline" :tone="scope.row.tag === 'danger' ? 'danger' : scope.row.kind === 'income' || scope.row.kind === 'deposit_recharge' ? 'success' : 'info'">
            {{ KIND_LABELS[scope.row.kind as FundRecordKind] }}
          </TTag>
        </template>
      </TTableColumn>
      <TTableColumn label="金额" width="140" align="right">
        <template #default="scope">
          <span
            class="dev-withdraw-table__amount"
            :class="{ 'dev-withdraw-table__amount--income': scope.row.kind === 'income' || scope.row.kind === 'deposit_recharge' }"
          >{{ money(scope.row.amount) }}</span>
        </template>
      </TTableColumn>
      <TTableColumn label="来源 / 收款账户" min-width="240" show-overflow-tooltip>
        <template #default="scope">
          <div class="dev-table__strong">{{ scope.row.detail }}</div>
          <div class="dev-table__sub">{{ scope.row.account }}</div>
        </template>
      </TTableColumn>
      <TTableColumn label="状态" width="120">
        <template #default="scope">
          <TTag variant="outline" :tone="scope.row.tag">{{ scope.row.status }}</TTag>
        </template>
      </TTableColumn>
      <TTableColumn prop="note" label="处理备注" min-width="200" show-overflow-tooltip />
      <TTableColumn prop="reference" label="交易参考号" min-width="180" show-overflow-tooltip />
      <TTableColumn prop="time" label="时间" min-width="180" />
    </TTable>
    <div class="dev-pager">
      <div class="dev-pager__count">
        <TSelect v-model="pageSize" aria-label="资金明细每页条数" class="dev-pager__size">
          <TOption v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
        </TSelect>
      </div>
      <TPagination v-model:current-page="page" :page-size="pageSize" :total="recordTotal" :pager-count="5" background aria-label="资金明细分页" />
    </div>
  </div>
</template>

<style scoped>
/* 表格与表尾都走统一层（.dev-table / .dev-pager），本页只保留金额与来源的排版。 */
.fund-records {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.dev-withdraw-table__amount {
  font-weight: 700;
  color: var(--dev-ink);
  font-variant-numeric: tabular-nums;
}

.dev-withdraw-table__amount--income {
  color: var(--dev-cyan);
}
</style>
