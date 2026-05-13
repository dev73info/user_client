<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  getDevWithdrawalSummary,
  type DevWithdrawalRecord,
  type DevWithdrawalSummary,
} from '@dev/api/wallet'
import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'

const auth = useAuthStore()
const { showToast } = useToast()

const loading = ref(false)
const summary = ref<DevWithdrawalSummary | null>(null)

const withdrawals = computed<DevWithdrawalRecord[]>(() => summary.value?.withdrawals ?? [])

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
    approved: '待打款',
    rejected: '已驳回',
    paid: '已打款',
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
  <div class="dev-page dev-withdraw-page">
    <div class="dev-withdraw-meta-strip" v-loading="loading">
      <div class="dev-withdraw-meta-strip__item">
        <span class="dev-withdraw-meta-strip__label">当前可提现</span>
        <span class="dev-withdraw-meta-strip__value">{{
          money(summary?.withdrawable_balance_cny)
          }}</span>
        <span class="dev-withdraw-meta-strip__hint">从已收尾款扣减已提现和审核中金额</span>
      </div>
      <div class="dev-withdraw-meta-strip__divider" />
      <div class="dev-withdraw-meta-strip__item">
        <span class="dev-withdraw-meta-strip__label">审核中金额</span>
        <span class="dev-withdraw-meta-strip__value">{{
          money(summary?.pending_withdraw_cny)
          }}</span>
        <span class="dev-withdraw-meta-strip__hint">待审核和待打款申请会先锁定余额</span>
      </div>
      <div class="dev-withdraw-meta-strip__divider" />
      <div class="dev-withdraw-meta-strip__item">
        <span class="dev-withdraw-meta-strip__label">累计已提现</span>
        <span class="dev-withdraw-meta-strip__value">{{ money(summary?.paid_withdraw_cny) }}</span>
        <span class="dev-withdraw-meta-strip__hint">管理员标记已打款后累计到这里</span>
      </div>
    </div>

    <el-card shadow="never" class="dev-surface-card">
      <h3 class="dev-section-title">历史提现记录</h3>
      <p class="dev-section-desc">按时间倒序查看所有提现申请与处理结果。</p>

      <el-table :data="withdrawals" stripe v-loading="loading" :empty-text="loading ? '提现记录加载中' : '当前还没有提现申请'">
        <el-table-column prop="withdrawal_id" label="提现单号" min-width="180" />
        <el-table-column label="金额" width="140">
          <template #default="scope">
            <span class="dev-withdraw-table__amount">{{ money(scope.row.amount_cny) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="方式" width="120">
          <template #default="scope">
            {{ channelText(scope.row.channel) }}
          </template>
        </el-table-column>
        <el-table-column label="账户" min-width="180">
          <template #default="scope">
            <div class="dev-withdraw-table__title">{{ scope.row.account_name }}</div>
            <div class="dev-wallet-table__meta">{{ scope.row.account_no_masked }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="scope">
            <el-tag :type="statusTagType(scope.row.status)" effect="plain">{{
              statusText(scope.row.status)
              }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="review_note" label="处理备注" min-width="220" show-overflow-tooltip />
        <el-table-column prop="paid_reference" label="打款参考号" min-width="180" />
        <el-table-column prop="created_at" label="申请时间" min-width="180" />
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.dev-withdraw-page {
  gap: 16px;
}

.dev-withdraw-meta-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: stretch;
  gap: 18px;
  padding: 18px 20px;
  border: 1px solid rgba(223, 210, 168, 0.64);
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(255, 250, 237, 0.86));
  box-shadow: 0 14px 32px rgba(105, 78, 18, 0.08);
}

.dev-withdraw-meta-strip__item {
  min-width: 0;
  display: grid;
  gap: 7px;
  align-content: start;
}

.dev-withdraw-meta-strip__divider {
  width: 1px;
  min-height: 62px;
  background: linear-gradient(180deg, transparent, rgba(223, 210, 168, 0.82), transparent);
}

.dev-withdraw-meta-strip__label {
  color: var(--dev-muted);
  font-size: 12px;
  font-weight: 700;
}

.dev-withdraw-meta-strip__value {
  overflow: hidden;
  color: var(--dev-ink);
  font-size: 24px;
  font-weight: 800;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dev-withdraw-meta-strip__hint {
  color: var(--dev-muted);
  font-size: 12px;
  line-height: 1.5;
}

.dev-withdraw-table__amount {
  font-weight: 700;
  color: var(--dev-gold);
}

.dev-withdraw-table__title {
  font-weight: 700;
  color: var(--dev-ink);
}

@media (max-width: 900px) {
  .dev-withdraw-meta-strip {
    grid-template-columns: 1fr;
  }

  .dev-withdraw-meta-strip__divider {
    width: 100%;
    min-height: 1px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(223, 210, 168, 0.82), transparent);
  }
}
</style>
