<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Close, Refresh, Wallet } from '@element-plus/icons-vue'

import {
  createDevWithdrawalRequest,
  getDevWalletOverview,
  type CreateDevWithdrawalRequest,
  type DevWithdrawalLimits,
  type DevWalletIncomeItem,
  type DevWalletOverview,
  validateDevWithdrawalRequest,
} from '@/api/devWallet'
import {
  createDevOrderDepositWithdrawalRequest,
  getDevOrderDepositStatus,
  getDevOrderDepositWithdrawalSummary,
  type CreateDevOrderDepositWithdrawalRequest,
  type DevOrderDepositStatus,
  type DevOrderDepositWithdrawalSummary,
} from '@/api/devOrderDeposit'
import { getDevCreditSelf, type DevCreditSelf } from '@/api/devCredit'
import {
  createAdapayDeveloperDepositPayment,
  getAdapayClientPlatform,
} from '@/api/adapay'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
const activeRecordTab = ref<'deposit' | 'income'>('deposit')
const withdrawDialogVisible = ref(false)
const submittingWithdrawal = ref(false)
const overview = ref<DevWalletOverview | null>(null)
const withdrawalLimits = ref<DevWithdrawalLimits | null>(null)
const withdrawForm = reactive<CreateDevWithdrawalRequest>({
  amount_cny: 0,
  channel: 'alipay',
  account_name: '',
  account_no: '',
  note: '',
})

// 保证金状态
const depositLoading = ref(false)
const depositStatus = ref<DevOrderDepositStatus | null>(null)
const depositWithdrawalSummary = ref<DevOrderDepositWithdrawalSummary | null>(null)
const depositRecordPage = ref(1)
const depositRecordPageSize = ref(10)
const depositRecords = computed(() => depositWithdrawalSummary.value?.withdrawals ?? [])
const depositRecordPageCount = computed(() => Math.max(1, Math.ceil(depositRecords.value.length / depositRecordPageSize.value)))
const pagedDepositRecords = computed(() => depositRecords.value.slice(
  (depositRecordPage.value - 1) * depositRecordPageSize.value,
  depositRecordPage.value * depositRecordPageSize.value,
))
watch(depositRecordPageSize, () => { depositRecordPage.value = 1 })
watch(depositRecordPageCount, (count) => {
  depositRecordPage.value = Math.min(depositRecordPage.value, count)
})
const creditInfo = ref<DevCreditSelf | null>(null)
const depositWithdrawDialogVisible = ref(false)
const submittingDepositWithdrawal = ref(false)
const depositWithdrawalError = ref('')
const depositWithdrawForm = reactive<CreateDevOrderDepositWithdrawalRequest>({
  amount_cny: 0,
  channel: 'adapay',
  account_name: '',
  account_no: '',
  note: '',
})

const rechargeDialogVisible = ref(false)
const rechargeAmount = ref(100)
const rechargeChannel = ref<'alipay' | 'wechat'>('alipay')
const adapayRechargeLoading = ref(false)
const nowTick = ref(Date.now())
let countdownTimer: ReturnType<typeof setInterval> | null = null
let depositRefreshTimer: ReturnType<typeof setInterval> | null = null

function refreshDepositWhenVisible() {
  if (document.visibilityState === 'visible') void loadDeposit(true)
}

const recentIncome = computed<DevWalletIncomeItem[]>(() => overview.value?.recent_income ?? [])
const withdrawalMinAmount = computed(() => withdrawalLimits.value?.min_amount_cny ?? 0.01)
const withdrawalMaxAmount = computed(() => withdrawalLimits.value?.max_amount_cny ?? 999999)
const canWithdraw = computed(() => (overview.value?.withdrawable_balance_cny ?? 0) >= withdrawalMinAmount.value)

const depositWithdrawable = computed(
  () => depositWithdrawalSummary.value?.withdrawable_balance_cny ?? 0,
)
const depositTotalPaid = computed(() => depositStatus.value?.total_paid_cny ?? 0)
const canWithdrawDeposit = computed(() => depositWithdrawable.value >= withdrawalMinAmount.value)

function openRechargeDialog() {
  rechargeAmount.value = 100
  rechargeDialogVisible.value = true
}

async function startAdapayRecharge() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }
  if (!Number.isFinite(rechargeAmount.value) || rechargeAmount.value <= 0) {
    showToast('请输入有效的充值金额', 'warning')
    return
  }
  adapayRechargeLoading.value = true
  try {
    const amountCny = normalizeCnyAmount(Number(rechargeAmount.value))
    const clientPlatform = getAdapayClientPlatform()
    if (rechargeChannel.value === 'wechat') {
      rechargeDialogVisible.value = false
      await router.push({
        name: 'payment',
        query: {
          adapay: '1',
          developer_deposit: '1',
          intent: '1',
          channel: 'wechat',
          client_platform: clientPlatform,
          amount_cny: amountCny,
        },
      })
      return
    }
    const payment = await createAdapayDeveloperDepositPayment(
      auth.token,
      amountCny,
      rechargeChannel.value,
      clientPlatform,
    )
    rechargeDialogVisible.value = false
    await router.push({
      name: 'payment',
      query: {
        adapay: '1',
        developer_deposit: '1',
        payment_id: payment.paymentId,
        channel: payment.payChannel,
        client_platform: clientPlatform,
        amount_cny: payment.amountCny,
        qr_content: payment.payUrl ?? undefined,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建保证金充值订单失败'
    showToast(message, 'error')
  } finally {
    adapayRechargeLoading.value = false
  }
}

onMounted(async () => {
  auth.hydrate()
  countdownTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
  depositRefreshTimer = setInterval(() => {
    if (depositWithdrawalSummary.value?.withdrawals.some((record) =>
      ['pending_review', 'approved', 'payout_processing', 'payout_failed'].includes(record.status),
    )) refreshDepositWhenVisible()
  }, 5000)
  document.addEventListener('visibilitychange', refreshDepositWhenVisible)
  window.addEventListener('focus', refreshDepositWhenVisible)
  await Promise.all([loadWallet(), loadDeposit()])
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', refreshDepositWhenVisible)
  window.removeEventListener('focus', refreshDepositWhenVisible)
  if (depositRefreshTimer) {
    clearInterval(depositRefreshTimer)
    depositRefreshTimer = null
  }
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
})

function money(value?: number | null) {
  if (value == null) {
    return '¥0.00'
  }

  return `¥${value.toFixed(2)}`
}

function normalizeCnyAmount(value: number) {
  return Math.round(value * 100) / 100
}

function rateText(value?: number | null) {
  if (value == null) {
    return '0.0%'
  }

  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}%`
}

function statusText(status: string) {
  const map: Record<string, string> = {
    in_development: '开发中',
    pending_final: '待付尾款',
    final_paid: '已付尾款',
    completed: '已完成',
  }
  return map[status] || status
}

async function loadWallet() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  loading.value = true
  try {
    overview.value = await getDevWalletOverview(auth.token)
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载钱包失败'
    showToast(message, 'error')
  } finally {
    loading.value = false
  }
}

async function loadDeposit(silent = false) {
  if (!auth.token || depositLoading.value) return

  depositLoading.value = true
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
    if (!silent) showToast(message, 'error')
  } finally {
    depositLoading.value = false
  }
}

function openWithdrawDialog() {
  if (!canWithdraw.value) {
    showToast('当前可提现余额不足，暂时无法发起提现', 'warning')
    return
  }

  withdrawDialogVisible.value = true
}

function resetWithdrawForm() {
  withdrawForm.amount_cny = 0
  withdrawForm.channel = 'alipay'
  withdrawForm.account_name = ''
  withdrawForm.account_no = ''
  withdrawForm.note = ''
}

async function submitWithdrawal() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  const payload: CreateDevWithdrawalRequest = {
    amount_cny: normalizeCnyAmount(Number(withdrawForm.amount_cny)),
    channel: withdrawForm.channel,
    account_name: withdrawForm.account_name.trim(),
    account_no: withdrawForm.account_no.trim(),
    note: withdrawForm.note?.trim() || null,
  }

  const validationMessage = validateDevWithdrawalRequest(
    payload,
    overview.value?.withdrawable_balance_cny,
    withdrawalLimits.value,
  )
  if (validationMessage) {
    showToast(validationMessage, 'warning')
    return
  }

  submittingWithdrawal.value = true
  try {
    await createDevWithdrawalRequest(auth.token, payload)
    showToast('提现申请已提交', 'success')
    withdrawDialogVisible.value = false
    resetWithdrawForm()
    await loadWallet()
  } catch (error) {
    const message = error instanceof Error ? error.message : '提交提现申请失败'
    showToast(message, 'error')
  } finally {
    submittingWithdrawal.value = false
  }
}

function openDepositWithdrawDialog() {
  if (!canWithdrawDeposit.value) {
    showToast('当前可提现保证金不足，暂时无法发起提现', 'warning')
    return
  }

  depositWithdrawDialogVisible.value = true
}

function depositReturnStatusText(status: string) {
  const labels: Record<string, string> = {
    pending_review: '待审核', approved: '待退回', payout_processing: '退回处理中',
    payout_failed: '退回需处理', rejected: '已驳回', paid: '已退回',
  }
  return labels[status] ?? status
}

function resetDepositWithdrawForm() {
  depositWithdrawForm.amount_cny = 0
  depositWithdrawForm.channel = 'adapay'
  depositWithdrawForm.account_name = ''
  depositWithdrawForm.account_no = ''
  depositWithdrawForm.note = ''
}

async function submitDepositWithdrawal() {
  if (submittingDepositWithdrawal.value) return
  depositWithdrawalError.value = ''
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  const payload: CreateDevOrderDepositWithdrawalRequest = {
    amount_cny: normalizeCnyAmount(Number(depositWithdrawForm.amount_cny)),
    channel: depositWithdrawForm.channel,
    account_name: depositWithdrawForm.account_name.trim(),
    account_no: depositWithdrawForm.account_no.trim(),
    note: depositWithdrawForm.note?.trim() || null,
  }

  const validationMessage = validateDevWithdrawalRequest(
    payload,
    depositWithdrawable.value,
    withdrawalLimits.value,
    false,
    'developer_order_deposit',
  )
  if (validationMessage) {
    showToast(validationMessage, 'warning')
    return
  }

  submittingDepositWithdrawal.value = true
  try {
    const record = await createDevOrderDepositWithdrawalRequest(auth.token, payload)
    if (record.status === 'paid') {
      showToast('保证金已退回', 'success')
    } else if (record.status === 'payout_failed') {
      showToast(record.payout_failure_message || '自动退回未完成，申请已保留待人工处理', 'warning')
    } else if (record.status === 'pending_review') {
      showToast('自动退回暂未开启，申请已转人工审核', 'warning')
    } else {
      showToast('保证金退回处理中，请留意原支付账户', 'success')
    }
    depositWithdrawDialogVisible.value = false
    resetDepositWithdrawForm()
    await loadDeposit()
  } catch (error) {
    const message = error instanceof Error ? error.message : '提交保证金提现申请失败'
    depositWithdrawalError.value = message
    showToast(message, 'error')
  } finally {
    submittingDepositWithdrawal.value = false
  }
}
</script>

<template>
  <div class="dev-page dev-wallet-page">
    <!-- 次要统计条 -->
    <div class="dev-meta-strip" v-loading="loading">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">累计收入</span>
        <span class="dev-meta-strip__value">{{ money(overview?.total_income_cny) }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">今日入账</span>
        <span class="dev-meta-strip__value">{{ money(overview?.today_income_cny) }}</span>
        <el-tag size="small" :type="(overview?.today_income_change_rate ?? 0) >= 0 ? 'success' : 'danger'"
          effect="plain" class="dev-meta-strip__tag">
          {{ rateText(overview?.today_income_change_rate) }}
        </el-tag>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">完成订单</span>
        <span class="dev-meta-strip__value">{{ overview?.total_completed_orders ?? 0 }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">活跃需求</span>
        <span class="dev-meta-strip__value">{{ overview?.active_requirement_count ?? 0 }}</span>
      </div>
    </div>

    <!-- 主余额卡片 -->
    <div class="wallet-hero">
      <!-- 接单收入 -->
      <el-card shadow="never" class="dev-surface-card wallet-hero__card">
        <div class="wallet-hero__header">
          <span class="wallet-hero__section-label">接单收入</span>
          <el-tag size="small" effect="plain" type="info">已提现 {{ money(overview?.paid_withdraw_cny) }}</el-tag>
        </div>
        <div class="wallet-hero__body">
          <div class="wallet-hero__main">
            <span class="wallet-hero__label">可提现余额</span>
            <span class="wallet-hero__amount" :class="{ 'wallet-hero__amount--dim': !canWithdraw }">
              {{ money(overview?.withdrawable_balance_cny) }}
            </span>
          </div>
          <div class="wallet-hero__tags">
            <el-tag v-if="(overview?.pending_withdraw_cny ?? 0) > 0" size="small" type="warning" effect="plain">
              审核中 {{ money(overview?.pending_withdraw_cny) }}
            </el-tag>
            <el-tag size="small" effect="plain" :type="canWithdraw ? 'success' : 'info'">
              {{ canWithdraw ? '满足提现条件' : '不满足提现条件' }}
            </el-tag>
          </div>
        </div>
        <div class="wallet-hero__footer">
          <el-button class="wallet-hero__button wallet-hero__button--primary" type="primary" :disabled="!canWithdraw"
            @click="openWithdrawDialog">
            <el-icon>
              <Wallet />
            </el-icon>
            <span>申请提现</span>
          </el-button>
          <span class="wallet-hero__hint">金额需大于 0 元，审核后打款</span>
        </div>
      </el-card>

      <!-- 保证金余额 -->
      <el-card shadow="never" class="dev-surface-card wallet-hero__card">
        <div class="wallet-hero__header">
          <span class="wallet-hero__section-label">保证金余额</span>
          <el-tag size="small" effect="plain" type="info">充值总额 {{ money(depositTotalPaid) }}</el-tag>
        </div>
        <div class="wallet-hero__body">
          <div class="wallet-hero__main">
            <span class="wallet-hero__label">可提现保证金</span>
            <span class="wallet-hero__amount" :class="{ 'wallet-hero__amount--dim': !canWithdrawDeposit }">
              {{ money(depositWithdrawable) }}
            </span>
          </div>
          <div class="wallet-hero__tags">
            <el-tag v-if="(depositStatus?.frozen_cny ?? 0) > 0" size="small" type="warning" effect="plain">
              冻结中 {{ money(depositStatus?.frozen_cny) }}
            </el-tag>
            <el-tag v-if="(depositStatus?.pending_refund_cny ?? 0) > 0" size="small" type="warning" effect="plain">
              退款处理中 {{ money(depositStatus?.pending_refund_cny) }}
            </el-tag>
            <el-tag v-if="(depositWithdrawalSummary?.pending_withdraw_cny ?? 0) > 0" size="small" type="warning"
              effect="plain">
              处理中 {{ money(depositWithdrawalSummary?.pending_withdraw_cny) }}
            </el-tag>
            <el-tag size="small" effect="plain" :type="canWithdrawDeposit ? 'success' : 'info'">
              {{ canWithdrawDeposit ? '满足提现条件' : '不满足提现条件' }}
            </el-tag>
            <el-tag v-if="creditInfo && creditInfo.enforce_deposit_limit" size="small" type="primary" effect="plain">
              信用 {{ creditInfo.credit_score.toFixed(2) }} · 剩余可充
              {{ money(creditInfo.remaining_deposit_cap_cny) }}
            </el-tag>
          </div>
        </div>
        <div class="wallet-hero__footer">
          <el-button class="wallet-hero__button wallet-hero__button--primary" type="primary"
            :disabled="!canWithdrawDeposit" :loading="depositLoading" @click="openDepositWithdrawDialog">
            <el-icon v-if="!depositLoading">
              <Wallet />
            </el-icon>
            <span>提现保证金</span>
          </el-button>
          <el-button class="wallet-hero__button wallet-hero__button--ghost" plain @click="openRechargeDialog">
            <el-icon><Wallet /></el-icon>
            <span>充值</span>
          </el-button>
        </div>
      </el-card>
    </div>

    <section class="wallet-records" aria-label="钱包记录">
      <div class="dev-upload-section__head">
        <h3 class="dev-section-title">钱包记录</h3>
        <el-tooltip v-if="activeRecordTab === 'deposit'" content="刷新保证金记录">
          <el-button :icon="Refresh" :loading="depositLoading" aria-label="刷新保证金记录" @click="loadDeposit()" />
        </el-tooltip>
        <el-button v-else text @click="router.push('/dev/wallet/withdrawals')">查看全部提现记录 →</el-button>
      </div>
      <el-tabs v-model="activeRecordTab">
        <el-tab-pane label="保证金退回" name="deposit">
      <el-table class="wallet-records__table" :data="pagedDepositRecords" row-key="withdrawal_id" stripe v-loading="depositLoading" :empty-text="depositLoading ? '加载中' : '暂无保证金退回记录'">
        <el-table-column prop="withdrawal_id" label="申请单号" min-width="180" show-overflow-tooltip />
        <el-table-column label="金额" width="120" align="right">
          <template #default="scope"><span class="wallet-records__amount">{{ money(scope.row.amount_cny) }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default="scope">
            <el-tag size="small" effect="light" :type="scope.row.status === 'paid' ? 'success' : scope.row.status === 'payout_failed' || scope.row.status === 'rejected' ? 'danger' : 'warning'">
              {{ depositReturnStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="处理结果" min-width="260" show-overflow-tooltip>
          <template #default="scope">{{ scope.row.status === 'paid' ? (scope.row.review_note || scope.row.paid_reference || '已退回') : (scope.row.payout_failure_message || scope.row.review_note || '-') }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="申请时间" min-width="180" />
      </el-table>
      <div class="wallet-records__footer">
        <div class="wallet-records__count">
          <span>共 {{ depositRecords.length }} 条</span>
          <el-select v-model="depositRecordPageSize" aria-label="每页记录数" class="wallet-records__page-size">
            <el-option v-for="size in [10, 20, 50]" :key="size" :label="`${size} 条/页`" :value="size" />
          </el-select>
        </div>
        <el-pagination v-model:current-page="depositRecordPage" :page-size="depositRecordPageSize" :total="depositRecords.length" :pager-count="5" layout="prev, pager, next" background aria-label="保证金退回记录分页" />
      </div>
        </el-tab-pane>
        <el-tab-pane label="最近收入" name="income">
      <el-table class="wallet-records__table" :data="recentIncome" stripe v-loading="loading" :empty-text="loading ? '加载中' : '暂无收入记录'">
        <el-table-column label="需求" min-width="280">
          <template #default="scope">
            <div class="dev-wallet-table__title">{{ scope.row.title }}</div>
            <div class="dev-wallet-table__meta">
              {{ scope.row.requirement_id }} · {{ scope.row.customer }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="140">
          <template #default="scope">
            <span class="dev-wallet-table__amount">{{ money(scope.row.amount_cny) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="scope">
            <el-tag size="small" type="success" effect="plain">{{
              statusText(scope.row.requirement_status)
              }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="paid_at" label="支付时间" min-width="180" />
      </el-table>
        </el-tab-pane>
      </el-tabs>
    </section>

    <!-- 收入提现弹窗 -->
    <el-dialog v-model="withdrawDialogVisible" title="申请提现" width="520px">
      <el-form label-position="top">
        <el-form-item label="可提现余额">
          <div class="dev-wallet-withdraw__balance">
            {{ money(overview?.withdrawable_balance_cny) }}
          </div>
        </el-form-item>
        <el-form-item label="提现金额" required>
          <el-input-number v-model="withdrawForm.amount_cny" :min="withdrawalMinAmount" :max="withdrawalMaxAmount" :precision="2" :step="0.01" placeholder="提现金额"
            style="width: 100%" />
          <div class="dev-wallet-withdraw__note">可提现 {{ money(withdrawalMinAmount) }} 至 {{ money(withdrawalMaxAmount) }}，最多保留两位小数，不能超过可提现余额。</div>
        </el-form-item>
        <el-form-item label="收款方式" required>
          <el-select v-model="withdrawForm.channel" placeholder="收款方式" style="width: 100%">
            <el-option v-if="withdrawalLimits?.alipay_enabled !== false" label="支付宝" value="alipay" />
            <el-option v-if="withdrawalLimits?.wechat_enabled !== false" label="微信" value="wechat" />
          </el-select>
        </el-form-item>
        <el-form-item label="收款人姓名" required>
          <el-input v-model="withdrawForm.account_name" placeholder="收款人姓名" :maxlength="withdrawalLimits?.account_name_max_len ?? 40" />
        </el-form-item>
        <el-form-item label="收款账号" required>
          <el-input v-model="withdrawForm.account_no" placeholder="收款账号" :maxlength="withdrawalLimits?.account_no_max_len ?? 80" />
        </el-form-item>
        <el-form-item label="申请备注">
          <el-input v-model="withdrawForm.note" type="textarea" :rows="3" :maxlength="withdrawalLimits?.note_max_len ?? 200" show-word-limit
            placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="withdrawDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingWithdrawal" @click="submitWithdrawal">提交申请</el-button>
      </template>
    </el-dialog>

    <!-- 保证金提现弹窗 -->
    <el-dialog v-model="depositWithdrawDialogVisible" title="保证金提现" width="520px">
      <el-form label-position="top">
        <el-form-item label="可提现保证金">
          <div class="dev-wallet-withdraw__balance">{{ money(depositWithdrawable) }}</div>
        </el-form-item>
        <el-form-item label="提现金额" required>
          <el-input-number v-model="depositWithdrawForm.amount_cny" :min="withdrawalMinAmount" :max="withdrawalMaxAmount" :precision="2" :step="0.01"
            placeholder="提现金额" style="width: 100%" />
          <div class="dev-wallet-withdraw__note">可提现 {{ money(withdrawalMinAmount) }} 至 {{ money(withdrawalMaxAmount) }}，最多保留两位小数，不能超过可提现保证金余额。</div>
        </el-form-item>
        <el-form-item label="退回方式">
          <div class="dev-wallet-withdraw__note">充值 360 天内原路退回；超过 360 天的部分，分账至付款人账户后提现至其收款银行卡。</div>
          <p v-if="depositWithdrawalError" role="alert">{{ depositWithdrawalError }}</p>
        </el-form-item>
        <el-form-item label="申请备注">
          <el-input v-model="depositWithdrawForm.note" type="textarea" :rows="3" :maxlength="withdrawalLimits?.note_max_len ?? 200" show-word-limit
            placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="depositWithdrawDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingDepositWithdrawal"
          @click="submitDepositWithdrawal">提交申请</el-button>
      </template>
    </el-dialog>

    <!-- 保证金充值弹窗 -->
    <el-dialog v-model="rechargeDialogVisible" title="保证金充值" width="520px" class="dev-recharge-dialog" align-center>
      <el-form class="dev-recharge-dialog__form" label-position="top">
        <el-form-item label="充值金额（元）" required>
          <el-input-number v-model="rechargeAmount" class="dev-recharge-dialog__amount-input" :min="0.01"
            :precision="2" :step="0.01" />
          <div class="dev-recharge-dialog__notes">
            <div class="dev-wallet-withdraw__note">充值后保证金余额增加，可用于解锁接单资格。</div>
            <div v-if="creditInfo && creditInfo.enforce_deposit_limit" class="dev-wallet-withdraw__note">
              当前信用 {{ creditInfo.credit_score.toFixed(2) }}（按 1 信用 = ¥{{
                creditInfo.cny_per_credit.toFixed(2)
              }}
              折算），还可充 <strong>{{ money(creditInfo.remaining_deposit_cap_cny) }}</strong>。
            </div>
          </div>
          <el-alert v-if="
            creditInfo &&
            creditInfo.enforce_deposit_limit &&
            rechargeAmount > creditInfo.remaining_deposit_cap_cny
          " class="dev-recharge-dialog__limit-alert" type="warning" :closable="false" show-icon
            title="充值金额超过当前信用允许的额度，提交将被拒绝。请联系管理员提升信用，或下调充值金额。" />
        </el-form-item>
        <el-form-item label="支付方式" required>
          <el-radio-group v-model="rechargeChannel">
            <el-radio-button value="alipay">支付宝</el-radio-button>
            <el-radio-button value="wechat">微信</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rechargeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="adapayRechargeLoading" @click="startAdapayRecharge">充值</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<style scoped>
.wallet-records {
  min-width: 0;
  padding-top: 20px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.wallet-records :deep(.el-tabs__item) {
  font-weight: 600;
  height: 48px;
}

.wallet-records__table {
  width: 100%;
  --el-table-header-bg-color: var(--el-fill-color-light);
  --el-table-header-text-color: var(--el-text-color-regular);
  --el-table-row-hover-bg-color: var(--el-color-primary-light-9);
}

.wallet-records__table :deep(.el-table__cell) {
  padding: 12px 0;
  font-variant-numeric: tabular-nums;
}

.wallet-records__amount {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.wallet-records__footer,
.wallet-records__count {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.wallet-records__footer {
  justify-content: space-between;
  padding: 16px 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.wallet-records__page-size {
  width: 116px;
}

@media (max-width: 600px) {
  .wallet-records__footer {
    justify-content: center;
  }

  .wallet-records__count {
    width: 100%;
    justify-content: space-between;
  }

  .wallet-records :deep(.el-pagination) {
    --el-pagination-button-width: 28px;
    --el-pagination-button-height: 28px;
    gap: 2px;
  }
}
</style>
