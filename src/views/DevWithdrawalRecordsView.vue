<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  getDevWithdrawalSummary,
  type DevWithdrawalRecord,
  type DevWithdrawalSummary,
  type DevWalletIncomeItem,
} from '@/api/devWallet'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const props = defineProps<{ income: DevWalletIncomeItem[]; keyword?: string }>()
const { showToast } = useToast()

const loading = ref(false)
const summary = ref<DevWithdrawalSummary | null>(null)

const withdrawals = computed<DevWithdrawalRecord[]>(() => summary.value?.withdrawals ?? [])
const records = computed(() => [
  ...props.income.map((record) => ({
    key: `income:${record.payment_id}`,
    kind: 'income',
    id: record.payment_id,
    amount: record.amount_cny,
    detail: record.title,
    account: `${record.requirement_id} · ${record.customer}`,
    status: '已入账',
    tag: 'success' as const,
    note: '-',
    reference: record.payment_id,
    time: record.paid_at,
  })),
  ...withdrawals.value.map((record) => ({
    key: `withdrawal:${record.withdrawal_id}`,
    kind: 'withdrawal',
    id: record.withdrawal_id,
    amount: record.amount_cny,
    detail: `${channelText(record.channel)} · ${record.account_name}`,
    account: record.account_no_masked,
    status: statusText(record.status),
    tag: statusTagType(record.status),
    note: record.review_note || '-',
    reference: record.paid_reference || '-',
    time: record.created_at,
  })),
].sort((first, second) => second.time.localeCompare(first.time)))

/* 关键字由父级的统一工具栏传入（与其它列表页的搜索同口径），只过滤已加载的记录。 */
const filteredRecords = computed(() => {
  const keyword = (props.keyword ?? '').trim().toLowerCase()
  if (!keyword) {
    return records.value
  }
  return records.value.filter((record) =>
    [record.id, record.detail, record.account, record.status, record.note, record.reference, record.time].some(
      (field) => String(field ?? '').toLowerCase().includes(keyword),
    ),
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
  await loadWithdrawals()
})

function money(value?: number | null) {
  if (value == null) {
    return '¥0.00'
  }
  return `¥${value.toFixed(2)}`
}

function statusText(status: DevWithdrawalRecord['status']) {
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

function statusTagType(
  status: DevWithdrawalRecord['status'],
): 'warning' | 'success' | 'danger' | 'info' {
  if (status === 'pending_review') {
    return 'warning'
  }
  if (status === 'approved') {
    return 'info'
  }
  if (status === 'payout_processing') {
    return 'info'
  }
  if (status === 'paid') {
    return 'success'
  }
  return 'danger'
}

function channelText(channel: DevWithdrawalRecord['channel']) {
  return channel === 'wechat' ? '微信' : '支付宝'
}

async function loadWithdrawals() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  loading.value = true
  try {
    summary.value = await getDevWithdrawalSummary(auth.token)
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载提现记录失败'
    showToast(message, 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="income-records" aria-label="收入记录">
    <el-table class="dev-table wallet-records__table" :data="pagedRecords" row-key="key" stripe v-loading="loading">
      <template #empty>
        <p class="dev-empty-state">{{ loading ? '记录加载中' : '暂无收入或提现记录' }}</p>
      </template>
      <el-table-column label="类型" width="90">
        <template #default="scope">
          <el-tag :type="scope.row.kind === 'income' ? 'success' : 'info'" effect="plain">{{ scope.row.kind === 'income' ? '收入' : '提现' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="id" label="单号" min-width="180" show-overflow-tooltip />
      <el-table-column label="金额" width="140" align="right">
        <template #default="scope">
          <span class="dev-withdraw-table__amount" :class="{ 'dev-withdraw-table__amount--income': scope.row.kind === 'income' }">{{ money(scope.row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="来源 / 收款账户" min-width="240" show-overflow-tooltip>
        <template #default="scope">
          <div class="dev-table__strong">{{ scope.row.detail }}</div>
          <div class="dev-table__sub">{{ scope.row.account }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="scope">
          <el-tag :type="scope.row.tag" effect="plain">{{
            scope.row.status
            }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="note" label="处理备注" min-width="220" show-overflow-tooltip />
      <el-table-column prop="reference" label="交易参考号" min-width="180" show-overflow-tooltip />
      <el-table-column prop="time" label="时间" min-width="180" />
    </el-table>
    <div class="dev-pager">
      <div class="dev-pager__count">
        <span>共 {{ recordTotal }} 条</span>
        <el-select v-model="pageSize" aria-label="收入记录每页条数" class="dev-pager__size">
          <el-option v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
        </el-select>
      </div>
      <el-pagination v-model:current-page="page" :page-size="pageSize" :total="recordTotal" :pager-count="5" layout="prev, pager, next" background aria-label="收入记录分页" />
    </div>
  </div>
</template>

<style scoped>
/* 表格与表尾都走统一层（.dev-table / .dev-pager），本页只保留金额与来源的排版。 */
.income-records {
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
