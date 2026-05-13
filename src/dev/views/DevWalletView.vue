<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Close, Plus, Wallet } from '@element-plus/icons-vue'
import QRCode from 'qrcode'

import {
  createDevWithdrawalRequest,
  getDevWalletOverview,
  type CreateDevWithdrawalRequest,
  type DevWalletIncomeItem,
  type DevWalletOverview,
  validateDevWithdrawalRequest,
} from '@dev/api/wallet'
import {
  confirmDevOrderDepositAlipayPayment,
  confirmDevOrderDepositWechatPayment,
  createDevOrderDepositAlipayPage,
  createDevOrderDepositWithdrawalRequest,
  createDevOrderDepositWechatPayment,
  getDevOrderDepositStatus,
  getDevOrderDepositWithdrawalSummary,
  type CreateDevOrderDepositWithdrawalRequest,
  type DevOrderDepositStatus,
  type DevOrderDepositWithdrawalSummary,
} from '@dev/api/devOrderDeposit'
import { getDevCreditSelf, type DevCreditSelf } from '@dev/api/devCredit'
import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
const withdrawDialogVisible = ref(false)
const submittingWithdrawal = ref(false)
const overview = ref<DevWalletOverview | null>(null)
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
const creditInfo = ref<DevCreditSelf | null>(null)
const depositWithdrawDialogVisible = ref(false)
const submittingDepositWithdrawal = ref(false)
const depositWithdrawForm = reactive<CreateDevOrderDepositWithdrawalRequest>({
  amount_cny: 0,
  channel: 'alipay',
  account_name: '',
  account_no: '',
  note: '',
})

// 保证金充值
const rechargeDialogVisible = ref(false)
const rechargeAmount = ref<number>(100)
const alipayLoading = ref(false)
const wechatLoading = ref(false)
const wechatPayDialogVisible = ref(false)
const wechatPaymentId = ref('')
const wechatQrDataUrl = ref('')
const confirmingWechat = ref(false)
const alipayPayDialogVisible = ref(false)
const alipayPaymentId = ref('')
const alipayPageHtml = ref('')
const confirmingAlipay = ref(false)
const pendingRechargeAmount = ref(0)
const pendingExpiresAt = ref('')
const nowTick = ref(Date.now())
const POLL_INTERVAL_MS = 8_000
let pollTimer: ReturnType<typeof setInterval> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null

const recentIncome = computed<DevWalletIncomeItem[]>(() => overview.value?.recent_income ?? [])
const canWithdraw = computed(() => (overview.value?.withdrawable_balance_cny ?? 0) >= 1)
const withdrawHint = computed(() => {
  if (canWithdraw.value) {
    return '单次提现最低 1 元，可直接发起申请'
  }

  return `单次提现最低 1 元，当前余额 ${money(overview.value?.withdrawable_balance_cny)}，暂不满足提现条件`
})

const depositWithdrawable = computed(
  () => depositWithdrawalSummary.value?.withdrawable_balance_cny ?? 0,
)
const depositTotalPaid = computed(() => depositStatus.value?.total_paid_cny ?? 0)
const canWithdrawDeposit = computed(() => depositWithdrawable.value >= 1)
const depositWithdrawHint = computed(() => {
  if (canWithdrawDeposit.value) {
    return '单次提现最低 1 元，可直接发起申请'
  }
  return `单次提现最低 1 元，当前可提现 ${money(depositWithdrawable.value)}，暂不满足提现条件`
})

const expiresAtMs = computed(() => {
  const raw = pendingExpiresAt.value.trim()
  if (!raw) return NaN
  return new Date(raw.replace(' ', 'T')).getTime()
})

const countdownMs = computed(() => {
  if (!Number.isFinite(expiresAtMs.value)) return NaN
  return Math.max(0, expiresAtMs.value - nowTick.value)
})

const isExpired = computed(() => Number.isFinite(countdownMs.value) && countdownMs.value <= 0)

const countdownText = computed(() => {
  if (!Number.isFinite(countdownMs.value)) return ''
  if (countdownMs.value <= 0) return '已过期'
  const s = Math.floor(countdownMs.value / 1000)
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
})

onMounted(async () => {
  auth.hydrate()
  await Promise.all([loadWallet(), loadDeposit()])
  countdownTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  clearPaymentTimers()
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

async function loadDeposit() {
  if (!auth.token) return

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
    showToast(message, 'error')
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
    amount_cny: Number(withdrawForm.amount_cny),
    channel: withdrawForm.channel,
    account_name: withdrawForm.account_name.trim(),
    account_no: withdrawForm.account_no.trim(),
    note: withdrawForm.note?.trim() || null,
  }

  const validationMessage = validateDevWithdrawalRequest(
    payload,
    overview.value?.withdrawable_balance_cny,
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

async function refreshAll() {
  await Promise.all([loadWallet(), loadDeposit()])
}

function clearPaymentTimers() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startPaymentPoll(confirmFn: () => Promise<void>) {
  clearPaymentTimers()
  pollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return
    void confirmFn()
  }, POLL_INTERVAL_MS)
}

function openRechargeDialog() {
  rechargeAmount.value = 100
  rechargeDialogVisible.value = true
}

async function payWithAlipay() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }
  const amount = Number(rechargeAmount.value)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999) {
    showToast('请输入合法金额（0.01 – 999999 元）', 'warning')
    return
  }

  alipayLoading.value = true
  try {
    const order = await createDevOrderDepositAlipayPage(auth.token, amount)
    const rawHtml = order.page_html
    alipayPageHtml.value = rawHtml
    alipayPaymentId.value = order.payment_id
    pendingRechargeAmount.value = amount
    pendingExpiresAt.value = order.expires_at ?? ''
    rechargeDialogVisible.value = false
    await nextTick()
    alipayPayDialogVisible.value = true
    startPaymentPoll(pollConfirmAlipay)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '创建支付宝订单失败', 'error')
  } finally {
    alipayLoading.value = false
  }
}

async function pollConfirmAlipay() {
  if (!auth.token || !alipayPaymentId.value || confirmingAlipay.value) return
  try {
    const result = await confirmDevOrderDepositAlipayPayment(auth.token, alipayPaymentId.value)
    if (result.has_paid_deposit) {
      clearPaymentTimers()
      showToast('充値成功！', 'success')
      closeAlipayDialog()
      await loadDeposit()
    }
  } catch {
    // 默默失败，等待下次轮询
  }
}

async function confirmAlipayPay() {
  if (!auth.token || !alipayPaymentId.value) return

  confirmingAlipay.value = true
  try {
    const result = await confirmDevOrderDepositAlipayPayment(auth.token, alipayPaymentId.value)
    if (result.has_paid_deposit) {
      clearPaymentTimers()
      showToast('充值成功！', 'success')
      closeAlipayDialog()
      await loadDeposit()
    } else {
      showToast('未检测到支付，请扫码完成后再确认', 'warning')
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '确认支付失败', 'error')
  } finally {
    confirmingAlipay.value = false
  }
}

function closeAlipayDialog() {
  clearPaymentTimers()
  alipayPayDialogVisible.value = false
  alipayPageHtml.value = ''
  pendingExpiresAt.value = ''
}

async function payWithWechat() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }
  const amount = Number(rechargeAmount.value)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999) {
    showToast('请输入合法金额（0.01 – 999999 元）', 'warning')
    return
  }

  wechatLoading.value = true
  try {
    const order = await createDevOrderDepositWechatPayment(auth.token, amount)
    wechatPaymentId.value = order.payment_id
    wechatQrDataUrl.value = await QRCode.toDataURL(order.code_url, { width: 240, margin: 1 })
    pendingRechargeAmount.value = amount
    pendingExpiresAt.value = order.expires_at ?? ''
    rechargeDialogVisible.value = false
    await nextTick()
    wechatPayDialogVisible.value = true
    startPaymentPoll(pollConfirmWechat)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '创建微信订单失败', 'error')
  } finally {
    wechatLoading.value = false
  }
}

async function pollConfirmWechat() {
  if (!auth.token || !wechatPaymentId.value || confirmingWechat.value) return
  try {
    const result = await confirmDevOrderDepositWechatPayment(auth.token, wechatPaymentId.value)
    if (result.has_paid_deposit) {
      clearPaymentTimers()
      showToast('充値成功！', 'success')
      wechatPayDialogVisible.value = false
      pendingExpiresAt.value = ''
      await loadDeposit()
    }
  } catch {
    // 默默失败，等待下次轮询
  }
}

async function confirmWechatPay() {
  if (!auth.token || !wechatPaymentId.value) return

  confirmingWechat.value = true
  try {
    const result = await confirmDevOrderDepositWechatPayment(auth.token, wechatPaymentId.value)
    if (result.has_paid_deposit) {
      clearPaymentTimers()
      showToast('充値成功！', 'success')
      wechatPayDialogVisible.value = false
      pendingExpiresAt.value = ''
      await loadDeposit()
    } else {
      showToast('未检测到支付，请扫码完成后再确认', 'warning')
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '确认支付失败', 'error')
  } finally {
    confirmingWechat.value = false
  }
}

function openDepositWithdrawDialog() {
  if (!canWithdrawDeposit.value) {
    showToast('当前可提现保证金不足，暂时无法发起提现', 'warning')
    return
  }

  depositWithdrawDialogVisible.value = true
}

function resetDepositWithdrawForm() {
  depositWithdrawForm.amount_cny = 0
  depositWithdrawForm.channel = 'alipay'
  depositWithdrawForm.account_name = ''
  depositWithdrawForm.account_no = ''
  depositWithdrawForm.note = ''
}

async function submitDepositWithdrawal() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  const payload: CreateDevOrderDepositWithdrawalRequest = {
    amount_cny: Number(depositWithdrawForm.amount_cny),
    channel: depositWithdrawForm.channel,
    account_name: depositWithdrawForm.account_name.trim(),
    account_no: depositWithdrawForm.account_no.trim(),
    note: depositWithdrawForm.note?.trim() || null,
  }

  const validationMessage = validateDevWithdrawalRequest(payload, depositWithdrawable.value)
  if (validationMessage) {
    showToast(validationMessage, 'warning')
    return
  }

  submittingDepositWithdrawal.value = true
  try {
    await createDevOrderDepositWithdrawalRequest(auth.token, payload)
    showToast('保证金提现申请已提交', 'success')
    depositWithdrawDialogVisible.value = false
    resetDepositWithdrawForm()
    await loadDeposit()
  } catch (error) {
    const message = error instanceof Error ? error.message : '提交保证金提现申请失败'
    showToast(message, 'error')
  } finally {
    submittingDepositWithdrawal.value = false
  }
}
</script>

<template>
  <div class="dev-page dev-wallet-page">
    <!-- 次要统计条 -->
    <div class="wallet-meta-strip" v-loading="loading">
      <div class="wallet-meta-strip__item">
        <span class="wallet-meta-strip__label">累计收入</span>
        <span class="wallet-meta-strip__value">{{ money(overview?.total_income_cny) }}</span>
      </div>
      <div class="wallet-meta-strip__divider" />
      <div class="wallet-meta-strip__item">
        <span class="wallet-meta-strip__label">今日入账</span>
        <span class="wallet-meta-strip__value">{{ money(overview?.today_income_cny) }}</span>
        <el-tag size="small" :type="(overview?.today_income_change_rate ?? 0) >= 0 ? 'success' : 'danger'"
          effect="plain" class="wallet-meta-strip__tag">
          {{ rateText(overview?.today_income_change_rate) }}
        </el-tag>
      </div>
      <div class="wallet-meta-strip__divider" />
      <div class="wallet-meta-strip__item">
        <span class="wallet-meta-strip__label">完成订单</span>
        <span class="wallet-meta-strip__value">{{ overview?.total_completed_orders ?? 0 }}</span>
      </div>
      <div class="wallet-meta-strip__divider" />
      <div class="wallet-meta-strip__item">
        <span class="wallet-meta-strip__label">活跃需求</span>
        <span class="wallet-meta-strip__value">{{ overview?.active_requirement_count ?? 0 }}</span>
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
          <span class="wallet-hero__hint">最低 1 元，审核后打款</span>
        </div>
      </el-card>

      <!-- 接单保证金 -->
      <el-card shadow="never" class="dev-surface-card wallet-hero__card">
        <div class="wallet-hero__header">
          <span class="wallet-hero__section-label">接单保证金</span>
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
            <el-tag v-if="(depositWithdrawalSummary?.pending_withdraw_cny ?? 0) > 0" size="small" type="warning"
              effect="plain">
              审核中 {{ money(depositWithdrawalSummary?.pending_withdraw_cny) }}
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
            <el-icon>
              <Plus />
            </el-icon>
            <span>充值</span>
          </el-button>
          <span class="wallet-hero__hint">最低 1 元</span>
        </div>
      </el-card>
    </div>

    <!-- 最近收入 -->
    <el-card shadow="never" class="dev-surface-card">
      <div class="dev-upload-section__head">
        <section>
          <h3 class="dev-section-title">最近收入</h3>
          <p class="dev-section-desc">最近 5 笔收入记录，便于快速确认来源需求和支付时间。</p>
        </section>
        <el-button text @click="router.push('/dev/wallet/withdrawals')">查看全部提现记录 →</el-button>
      </div>

      <el-table :data="recentIncome" stripe v-loading="loading" :empty-text="loading ? '加载中' : '暂无收入记录'">
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
    </el-card>

    <!-- 收入提现弹窗 -->
    <el-dialog v-model="withdrawDialogVisible" title="申请提现" width="520px">
      <el-form label-position="top">
        <el-form-item label="可提现余额">
          <div class="dev-wallet-withdraw__balance">
            {{ money(overview?.withdrawable_balance_cny) }}
          </div>
        </el-form-item>
        <el-form-item label="提现金额" required>
          <el-input-number v-model="withdrawForm.amount_cny" :min="1" :precision="2" :step="100" placeholder="提现金额"
            style="width: 100%" />
          <div class="dev-wallet-withdraw__note">单次最低 1 元，不能超过可提现余额。</div>
        </el-form-item>
        <el-form-item label="收款方式" required>
          <el-select v-model="withdrawForm.channel" placeholder="收款方式" style="width: 100%">
            <el-option label="支付宝" value="alipay" />
            <el-option label="微信" value="wechat" />
          </el-select>
        </el-form-item>
        <el-form-item label="收款人姓名" required>
          <el-input v-model="withdrawForm.account_name" placeholder="收款人姓名" maxlength="40" />
        </el-form-item>
        <el-form-item label="收款账号" required>
          <el-input v-model="withdrawForm.account_no" placeholder="收款账号" maxlength="80" />
        </el-form-item>
        <el-form-item label="申请备注">
          <el-input v-model="withdrawForm.note" type="textarea" :rows="3" maxlength="200" show-word-limit
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
          <el-input-number v-model="depositWithdrawForm.amount_cny" :min="1" :precision="2" :step="100"
            placeholder="提现金额" style="width: 100%" />
          <div class="dev-wallet-withdraw__note">单次最低 1 元，不能超过可提现保证金余额。</div>
        </el-form-item>
        <el-form-item label="收款方式" required>
          <el-select v-model="depositWithdrawForm.channel" placeholder="收款方式" style="width: 100%">
            <el-option label="支付宝" value="alipay" />
            <el-option label="微信" value="wechat" />
          </el-select>
        </el-form-item>
        <el-form-item label="收款人姓名" required>
          <el-input v-model="depositWithdrawForm.account_name" placeholder="收款人姓名" maxlength="40" />
        </el-form-item>
        <el-form-item label="收款账号" required>
          <el-input v-model="depositWithdrawForm.account_no" placeholder="收款账号" maxlength="80" />
        </el-form-item>
        <el-form-item label="申请备注">
          <el-input v-model="depositWithdrawForm.note" type="textarea" :rows="3" maxlength="200" show-word-limit
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
          <el-input-number v-model="rechargeAmount" class="dev-recharge-dialog__amount-input" :min="1" :precision="2"
            :step="100" />
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
      </el-form>
      <template #footer>
        <el-button class="dev-recharge-dialog__button dev-recharge-dialog__button--ghost"
          @click="rechargeDialogVisible = false">
          <el-icon>
            <Close />
          </el-icon>
          <span>取消</span>
        </el-button>
        <el-button class="dev-recharge-dialog__button dev-recharge-dialog__button--secondary" :loading="wechatLoading"
          @click="payWithWechat">
          <el-icon v-if="!wechatLoading">
            <Wallet />
          </el-icon>
          <span>微信支付</span>
        </el-button>
        <el-button class="dev-recharge-dialog__button dev-recharge-dialog__button--primary" type="primary"
          :loading="alipayLoading" @click="payWithAlipay">
          <el-icon v-if="!alipayLoading">
            <Wallet />
          </el-icon>
          <span>支付宝支付</span>
        </el-button>
      </template>
    </el-dialog>

    <!-- 支付宝支付弹窗 -->
    <el-dialog v-model="alipayPayDialogVisible" title="支付宝扫码支付" width="380px" align-center
      :before-close="closeAlipayDialog">
      <div class="alipay-pay-qr">
        <div class="pay-amount-banner">
          充值金额 <span class="pay-amount-banner__value">{{ money(pendingRechargeAmount) }}</span>
        </div>

        <iframe v-if="alipayPageHtml" :srcdoc="alipayPageHtml" class="alipay-pay-frame" frameborder="0" scrolling="no"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups"></iframe>

        <div v-else class="alipay-pay-loading">加载支付宝页面中…</div>
        <div class="pay-countdown" :class="{ 'pay-countdown--expired': isExpired }">
          <span v-if="countdownText">{{ isExpired ? '订单已过期' : `剩余 ${countdownText}` }}</span>
          <span v-else class="pay-countdown__polling">支付中…每 8 秒自动检测</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="closeAlipayDialog">取消</el-button>
        <el-button type="primary" :loading="confirmingAlipay" :disabled="isExpired"
          @click="confirmAlipayPay">我已支付</el-button>
      </template>
    </el-dialog>

    <!-- 微信支付二维码弹窗 -->
    <el-dialog v-model="wechatPayDialogVisible" title="微信扫码支付" width="320px" align-center :before-close="() => {
        clearPaymentTimers()
        wechatPayDialogVisible = false
        pendingExpiresAt = ''
      }
      ">
      <div class="wechat-pay-qr">
        <div class="pay-amount-banner">
          充值金额 <span class="pay-amount-banner__value">{{ money(pendingRechargeAmount) }}</span>
        </div>
        <img v-if="wechatQrDataUrl" :src="wechatQrDataUrl" alt="微信支付二维码" class="wechat-pay-qr__img" />
        <div class="pay-countdown" :class="{ 'pay-countdown--expired': isExpired }">
          <span v-if="countdownText">{{ isExpired ? '订单已过期' : `剩余 ${countdownText}` }}</span>
          <span v-else class="pay-countdown__polling">支付中…每 8 秒自动检测</span>
        </div>
        <p class="wechat-pay-qr__hint">请使用微信扫码完成支付，支付成功后将自动关闭</p>
      </div>
      <template #footer>
        <el-button @click="
          () => {
            clearPaymentTimers()
            wechatPayDialogVisible = false
            pendingExpiresAt = ''
          }
        ">取消</el-button>
        <el-button type="primary" :loading="confirmingWechat" :disabled="isExpired"
          @click="confirmWechatPay">我已支付</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dev-wallet-page {
  gap: 20px;
}

/* 次要统计条 */
.wallet-meta-strip {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 12px 20px;
  background: var(--dev-surface, #fff);
  border: 1px solid var(--dev-border, #e8e8e8);
  border-radius: 10px;
  flex-wrap: wrap;
  row-gap: 10px;
}

.wallet-meta-strip__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px;
}

.wallet-meta-strip__divider {
  width: 1px;
  height: 18px;
  background: var(--dev-border, #e8e8e8);
  flex-shrink: 0;
}

.wallet-meta-strip__label {
  font-size: 12px;
  color: var(--dev-muted);
  white-space: nowrap;
}

.wallet-meta-strip__value {
  font-size: 14px;
  font-weight: 700;
  color: var(--dev-ink);
  white-space: nowrap;
}

.wallet-meta-strip__tag {
  margin-left: 2px;
}

/* 主余额卡片区 */
.wallet-hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.wallet-hero__card {
  display: flex;
  flex-direction: column;
}

.wallet-hero__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.wallet-hero__section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--dev-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.wallet-hero__body {
  flex: 1;
  margin-bottom: 20px;
}

.wallet-hero__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.wallet-hero__label {
  font-size: 13px;
  color: var(--dev-muted);
}

.wallet-hero__amount {
  font-size: 36px;
  font-weight: 800;
  color: var(--dev-gold);
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.wallet-hero__amount--dim {
  color: var(--dev-muted);
}

.wallet-hero__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.wallet-hero__footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--dev-border, #f0f0f0);
}

.wallet-hero__button.el-button {
  min-height: 44px;
  height: 44px;
  padding: 0 18px;
  border-radius: 10px;
  font-weight: 800;
  line-height: 1;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    opacity 160ms ease,
    transform 160ms ease;
}

.wallet-hero__button.el-button :deep(span) {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.wallet-hero__button.el-button .el-icon {
  font-size: 16px;
}

.wallet-hero__button--primary.el-button {
  min-width: 132px;
  border-color: var(--dev-blue);
  background: var(--dev-blue);
  color: #fff;
  box-shadow: 0 10px 22px rgba(31, 74, 209, 0.18);
}

.wallet-hero__button--primary.el-button:hover:not(.is-disabled),
.wallet-hero__button--primary.el-button:focus-visible:not(.is-disabled) {
  border-color: #173aaa;
  background: #173aaa;
  color: #fff;
  box-shadow: 0 12px 24px rgba(31, 74, 209, 0.22);
  transform: translateY(-1px);
}

.wallet-hero__button--ghost.el-button {
  min-width: 88px;
  border-color: rgba(148, 163, 184, 0.3);
  background: rgba(255, 255, 255, 0.9);
  color: #475569;
  box-shadow: 0 8px 18px rgba(17, 24, 39, 0.04);
}

.wallet-hero__button--ghost.el-button:hover,
.wallet-hero__button--ghost.el-button:focus-visible {
  border-color: rgba(31, 74, 209, 0.24);
  background: rgba(31, 74, 209, 0.07);
  color: var(--dev-blue);
  box-shadow: 0 10px 20px rgba(31, 74, 209, 0.08);
  transform: translateY(-1px);
}

.wallet-hero__button.el-button.is-disabled,
.wallet-hero__button.el-button.is-disabled:hover,
.wallet-hero__button.el-button.is-disabled:focus-visible {
  border-color: rgba(148, 163, 184, 0.22);
  background: #e5edf5;
  color: #7c8da3;
  box-shadow: none;
  opacity: 1;
  transform: none;
}

.wallet-hero__button.el-button.is-loading {
  transform: none;
}

.wallet-hero__hint {
  font-size: 12px;
  color: var(--dev-muted);
}

/* 提现弹窗 */
.dev-wallet-withdraw__balance {
  font-size: 22px;
  font-weight: 700;
  color: var(--dev-gold);
}

.dev-wallet-withdraw__note {
  margin-top: 6px;
  font-size: 12px;
  color: var(--dev-muted);
}

:global(.dev-recharge-dialog.el-dialog) {
  max-width: calc(100vw - 32px);
  overflow: hidden;
  border-radius: 14px;
  box-shadow: 0 22px 56px rgba(15, 23, 42, 0.18);
}

:global(.dev-recharge-dialog .el-dialog__header) {
  margin: 0;
  padding: 26px 28px 0;
}

:global(.dev-recharge-dialog .el-dialog__title) {
  color: #111827;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.35;
}

:global(.dev-recharge-dialog .el-dialog__headerbtn) {
  top: 22px;
  right: 22px;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

:global(.dev-recharge-dialog .el-dialog__headerbtn:hover) {
  background: rgba(15, 23, 42, 0.06);
}

:global(.dev-recharge-dialog .el-dialog__body) {
  padding: 24px 28px 0;
}

:global(.dev-recharge-dialog .el-dialog__footer) {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding: 28px 28px 26px;
  background: #fff;
  border-top: 1px solid rgba(226, 232, 240, 0.82);
}

.dev-recharge-dialog__form :deep(.el-form-item) {
  margin-bottom: 0;
}

.dev-recharge-dialog__form :deep(.el-form-item__label) {
  margin-bottom: 10px;
  color: #334155;
  font-size: 14px;
  font-weight: 800;
}

.dev-recharge-dialog__amount-input.el-input-number {
  width: 100%;
  overflow: hidden;
  border-radius: 10px;
}

.dev-recharge-dialog__amount-input :deep(.el-input__wrapper) {
  min-height: 48px;
  background: #f8fafc;
  border-radius: 10px;
  box-shadow: 0 0 0 1px rgba(203, 213, 225, 0.9) inset;
}

.dev-recharge-dialog__amount-input :deep(.el-input__inner) {
  color: #334155;
  font-size: 16px;
  font-weight: 700;
}

.dev-recharge-dialog__amount-input :deep(.el-input-number__decrease),
.dev-recharge-dialog__amount-input :deep(.el-input-number__increase) {
  width: 48px;
  border-color: rgba(203, 213, 225, 0.9);
  background: #f8fafc;
  color: #64748b;
}

.dev-recharge-dialog__amount-input :deep(.el-input-number__decrease) {
  border-radius: 10px 0 0 10px;
}

.dev-recharge-dialog__amount-input :deep(.el-input-number__increase) {
  border-radius: 0 10px 10px 0;
}

.dev-recharge-dialog__amount-input :deep(.el-input-number__decrease:hover),
.dev-recharge-dialog__amount-input :deep(.el-input-number__increase:hover) {
  color: var(--dev-blue);
}

.dev-recharge-dialog__notes {
  display: grid;
  gap: 8px;
  width: 100%;
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 10px;
  background: #f8fafc;
}

.dev-recharge-dialog__notes .dev-wallet-withdraw__note {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}

.dev-recharge-dialog__notes strong {
  color: var(--dev-gold);
  font-weight: 800;
}

.dev-recharge-dialog__limit-alert.el-alert {
  width: 100%;
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid rgba(245, 158, 11, 0.18);
  border-radius: 10px;
  background: #fff7ed;
}

.dev-recharge-dialog__limit-alert :deep(.el-alert__title) {
  color: #b45309;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.55;
}

.dev-recharge-dialog__limit-alert :deep(.el-alert__icon) {
  color: #f59e0b;
}

.dev-recharge-dialog__button.el-button {
  min-height: 42px;
  height: 42px;
  margin-left: 0;
  padding: 0 18px;
  border-radius: 10px;
  font-weight: 800;
  line-height: 1;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.dev-recharge-dialog__button.el-button :deep(span) {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.dev-recharge-dialog__button.el-button .el-icon {
  font-size: 16px;
}

.dev-recharge-dialog__button--ghost.el-button {
  border-color: rgba(148, 163, 184, 0.32);
  background: #fff;
  color: #475569;
}

.dev-recharge-dialog__button--ghost.el-button:hover,
.dev-recharge-dialog__button--ghost.el-button:focus-visible {
  border-color: rgba(31, 74, 209, 0.24);
  background: rgba(31, 74, 209, 0.07);
  color: var(--dev-blue);
  box-shadow: 0 10px 20px rgba(31, 74, 209, 0.08);
  transform: translateY(-1px);
}

.dev-recharge-dialog__button--secondary.el-button {
  border-color: rgba(16, 185, 129, 0.22);
  background: #ecfdf5;
  color: #047857;
  box-shadow: 0 10px 20px rgba(16, 185, 129, 0.08);
}

.dev-recharge-dialog__button--secondary.el-button:hover,
.dev-recharge-dialog__button--secondary.el-button:focus-visible {
  border-color: rgba(16, 185, 129, 0.34);
  background: #dff9ed;
  color: #047857;
  box-shadow: 0 12px 24px rgba(16, 185, 129, 0.12);
  transform: translateY(-1px);
}

.dev-recharge-dialog__button--primary.el-button {
  border-color: var(--dev-blue);
  background: var(--dev-blue);
  color: #fff;
  box-shadow: 0 10px 22px rgba(31, 74, 209, 0.18);
}

.dev-recharge-dialog__button--primary.el-button:hover,
.dev-recharge-dialog__button--primary.el-button:focus-visible {
  border-color: #173aaa;
  background: #173aaa;
  color: #fff;
  box-shadow: 0 12px 24px rgba(31, 74, 209, 0.22);
  transform: translateY(-1px);
}

.dev-recharge-dialog__button.el-button.is-loading {
  transform: none;
}

/* 收入表格 */
.dev-wallet-table__title {
  font-weight: 700;
  color: var(--dev-ink);
}

.dev-wallet-table__meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--dev-muted);
}

.dev-wallet-table__amount {
  font-weight: 700;
  color: var(--dev-gold);
}

@media (max-width: 720px) {
  .wallet-hero {
    grid-template-columns: 1fr;
  }

  :global(.dev-recharge-dialog .el-dialog__header) {
    padding: 22px 20px 0;
  }

  :global(.dev-recharge-dialog .el-dialog__body) {
    padding: 20px 20px 0;
  }

  :global(.dev-recharge-dialog .el-dialog__footer) {
    padding: 22px 20px 20px;
  }

  .dev-recharge-dialog__button.el-button {
    flex: 1 1 140px;
  }
}

/* 金额横幅 */
.pay-amount-banner {
  width: 100%;
  padding: 10px 16px;
  background: var(--el-color-primary-light-9, #ecf5ff);
  border-radius: 8px;
  font-size: 14px;
  color: var(--dev-muted);
  text-align: center;
}

.pay-amount-banner__value {
  font-size: 22px;
  font-weight: 800;
  color: var(--dev-gold);
  margin-left: 6px;
}

/* 倒计时 */
.pay-countdown {
  font-size: 13px;
  color: var(--dev-muted);
  margin: 6px 0 2px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.pay-countdown--expired {
  color: var(--el-color-danger);
  font-weight: 600;
}

.pay-countdown__polling {
  font-size: 12px;
  color: var(--el-color-primary);
  animation: fade-pulse 1.8s ease-in-out infinite;
}

@keyframes fade-pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.45;
  }
}

/* 支付宝二维码 */
.alipay-pay-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.alipay-pay-frame {
  width: 300px;
  height: 300px;
  border: none;
  border-radius: 8px;
  background: #fff;
}

.alipay-pay-loading {
  width: 100%;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--dev-muted);
}

/* 微信二维码 */
.wechat-pay-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.wechat-pay-qr__img {
  width: 240px;
  height: 240px;
  border-radius: 8px;
}

.wechat-pay-qr__hint {
  font-size: 13px;
  color: var(--dev-muted);
  text-align: center;
  line-height: 1.6;
}
</style>
