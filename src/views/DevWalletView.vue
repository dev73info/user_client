<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Close, Plus, Wallet } from '@element-plus/icons-vue'
import QRCode from 'qrcode'

import {
  createDevWithdrawalRequest,
  getDevWithdrawalLimits,
  getDevWalletOverview,
  type CreateDevWithdrawalRequest,
  type DevWithdrawalLimits,
  type DevWalletIncomeItem,
  type DevWalletOverview,
  validateDevWithdrawalRequest,
} from '@/api/devWallet'
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
} from '@/api/devOrderDeposit'
import { getDevCreditSelf, type DevCreditSelf } from '@/api/devCredit'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
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
const alipayIframeLoading = ref(false)
const confirmingAlipay = ref(false)
const pendingRechargeAmount = ref(0)
const pendingExpiresAt = ref('')
const nowTick = ref(Date.now())
const POLL_INTERVAL_MS = 8_000
let pollTimer: ReturnType<typeof setInterval> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null

const recentIncome = computed<DevWalletIncomeItem[]>(() => overview.value?.recent_income ?? [])
const withdrawalMinAmount = computed(() => withdrawalLimits.value?.min_amount_cny ?? 0.01)
const withdrawalMaxAmount = computed(() => withdrawalLimits.value?.max_amount_cny ?? 999999)
const canWithdraw = computed(() => (overview.value?.withdrawable_balance_cny ?? 0) >= withdrawalMinAmount.value)

const depositWithdrawable = computed(
  () => depositWithdrawalSummary.value?.withdrawable_balance_cny ?? 0,
)
const depositTotalPaid = computed(() => depositStatus.value?.total_paid_cny ?? 0)
const canWithdrawDeposit = computed(() => depositWithdrawable.value >= withdrawalMinAmount.value)

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
  await Promise.all([loadWallet(), loadDeposit(), loadWithdrawalLimits()])
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

async function loadWithdrawalLimits() {
  if (!auth.token) return

  try {
    withdrawalLimits.value = await getDevWithdrawalLimits(auth.token)
    if (withdrawalLimits.value.alipay_enabled === false) {
      if (withdrawForm.channel === 'alipay') withdrawForm.channel = 'wechat'
      if (depositWithdrawForm.channel === 'alipay') depositWithdrawForm.channel = 'wechat'
    }
    if (withdrawalLimits.value.wechat_enabled === false) {
      if (withdrawForm.channel === 'wechat') withdrawForm.channel = 'alipay'
      if (depositWithdrawForm.channel === 'wechat') depositWithdrawForm.channel = 'alipay'
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载提现配置失败', 'error')
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
  const amount = normalizeCnyAmount(Number(rechargeAmount.value))
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999) {
    showToast('请输入大于 0 的金额（单位：元，最多两位小数，最高 999999 元）', 'warning')
    return
  }

  alipayLoading.value = true
  try {
    const order = await createDevOrderDepositAlipayPage(auth.token, amount)
    const parsedPaymentPage = new DOMParser().parseFromString(order.page_html, 'text/html')
    const sourceForm = parsedPaymentPage.forms.namedItem('alipaysubmit')
    if (!sourceForm?.action) {
      throw new Error('支付宝支付表单无效')
    }

    alipayPageHtml.value = order.page_html
    alipayIframeLoading.value = true
    alipayPaymentId.value = order.payment_id
    pendingRechargeAmount.value = amount
    pendingExpiresAt.value = order.expires_at ?? ''
    rechargeDialogVisible.value = false
    alipayPayDialogVisible.value = true
    await nextTick()

    const submitForm = document.createElement('form')
    submitForm.method = sourceForm.method || 'post'
    submitForm.action = sourceForm.action
    submitForm.target = 'alipay-payment-frame'
    for (const input of Array.from(sourceForm.querySelectorAll<HTMLInputElement>('input[name]'))) {
      const hiddenInput = document.createElement('input')
      hiddenInput.type = 'hidden'
      hiddenInput.name = input.name
      hiddenInput.value = input.value
      submitForm.appendChild(hiddenInput)
    }
    document.body.appendChild(submitForm)
    submitForm.submit()
    submitForm.remove()
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
  alipayIframeLoading.value = false
  pendingExpiresAt.value = ''
}

async function payWithWechat() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }
  const amount = normalizeCnyAmount(Number(rechargeAmount.value))
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999) {
    showToast('请输入大于 0 的金额（单位：元，最多两位小数，最高 999999 元）', 'warning')
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
    true,
  )
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
          <span class="wallet-hero__hint">金额需大于 0 元</span>
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
        <el-form-item label="收款方式" required>
          <el-select v-model="depositWithdrawForm.channel" placeholder="收款方式" style="width: 100%"
            @change="depositWithdrawForm.account_no = ''">
            <el-option v-if="withdrawalLimits?.alipay_enabled !== false" label="支付宝" value="alipay" />
            <el-option v-if="withdrawalLimits?.wechat_enabled !== false" label="微信" value="wechat" />
          </el-select>
        </el-form-item>
        <el-form-item label="收款人姓名" required>
          <el-input v-model="depositWithdrawForm.account_name" placeholder="收款人姓名" :maxlength="withdrawalLimits?.account_name_max_len ?? 40" />
        </el-form-item>
        <el-form-item :label="depositWithdrawForm.channel === 'wechat' ? '微信绑定账户' : '收款账号'" required>
          <el-input v-model="depositWithdrawForm.account_no"
            :disabled="depositWithdrawForm.channel === 'wechat'"
            :placeholder="depositWithdrawForm.channel === 'wechat' ? '使用已绑定微信账户' : '收款账号'"
            :maxlength="withdrawalLimits?.account_no_max_len ?? 80" />
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

        <iframe v-if="alipayPageHtml" name="alipay-payment-frame" class="alipay-pay-frame" frameborder="0"
          sandbox="allow-scripts allow-forms allow-same-origin" scrolling="no"
          @load="alipayIframeLoading = false"></iframe>
        <div v-else class="alipay-pay-launch-status">
          <Wallet />
          <strong>正在加载支付宝二维码</strong>
          <span>请稍候...</span>
        </div>
        <div v-if="alipayIframeLoading" class="alipay-pay-launch-status alipay-pay-launch-status--loading">
          <span>支付宝二维码加载中...</span>
        </div>
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
