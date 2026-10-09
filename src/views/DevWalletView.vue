<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRouter } from 'vue-router'
import DevDepositRechargeDialog from '@/components/DevDepositRechargeDialog.vue'
import DevWithdrawalDialog from '@/components/DevWithdrawalDialog.vue'
import DevFundRecordsView from './DevFundRecordsView.vue'
import {
  getDevWalletOverview,
  getDevWithdrawalSetting,
  updateDevWithdrawalSetting,
  type DevWithdrawalLimits,
  type DevWithdrawalSetting,
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
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import {
  TButton,
  TCard,
  TDialog,
  TForm,
  TFormItem,
  TIcon,
  TInput,
  TInputNumber,
  TLoading,
  TSwitch,
  TTag,
  Refresh,
  Search,
  Wallet,
  WarningFilled,
} from 'ui_73info'

const auth = useAuthStore()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)

/** 保证金充值弹窗：表单与下单都由子组件承载，这里只留一个调用句柄 */
const rechargeDialog = ref<InstanceType<typeof DevDepositRechargeDialog> | null>(null)
/** 收入提现弹窗：余额与通道状态由子组件自己拉，这里只留调用句柄 */
const withdrawDialog = ref<InstanceType<typeof DevWithdrawalDialog> | null>(null)
const overview = ref<DevWalletOverview | null>(null)
const withdrawalLimits = ref<DevWithdrawalLimits | null>(null)
/**
 * 接单收入的提现偏好：自动提现开关 + 出款通道是否就绪。
 * 出款说明（T+1 到账、免手续费）由后端下发，前端原样展示，避免两边文案不一致。
 */
const withdrawalSetting = ref<DevWithdrawalSetting | null>(null)
const autoWithdrawSaving = ref(false)

// 保证金状态
const depositLoading = ref(false)
const depositStatus = ref<DevOrderDepositStatus | null>(null)
const depositWithdrawalSummary = ref<DevOrderDepositWithdrawalSummary | null>(null)
/* 「资金明细」的关键字筛选：与其它列表页的工具栏搜索同口径——只过滤已经加载回来的记录，
   不发新请求。四类记录共用这一个关键字（在子组件上按 prop 传入）。 */
const recordKeyword = ref('')

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

const nowTick = ref(Date.now())
// 后台轮询心跳：处理中的记录 5s 检查一次，仅剩打款失败（需人工处理）时放宽到 30s
const DEPOSIT_ACTIVE_POLL_MS = 5000
const DEPOSIT_STALLED_POLL_MS = 30000
// 焦点/可见性触发的刷新最小间隔，避免切换窗口时连续重复请求
const DEPOSIT_BACKGROUND_MIN_INTERVAL_MS = 3000
// 轮询节拍与节流阈值相等时，setInterval 的毫秒级抖动会让整次轮询被跳过，故留出容差
const DEPOSIT_POLL_JITTER_TOLERANCE_MS = 1000
const DEPOSIT_ACTIVE_STATUSES = ['pending_review', 'approved', 'payout_processing']
const DEPOSIT_STALLED_STATUSES = ['payout_failed']
let countdownTimer: ReturnType<typeof setInterval> | null = null
let depositRefreshTimer: ReturnType<typeof setInterval> | null = null
// 后台刷新只做并发保护，不点亮 depositLoading，否则表格每 5 秒闪一次遮罩
let depositFetching = false
// 记录最后一次刷新的启动时间（而非完成时间），避免请求耗时把下一次轮询挤掉
let depositRefreshStartedAt = 0

function depositRecordStatuses(): string[] {
  return (depositWithdrawalSummary.value?.withdrawals ?? []).map((record) => record.status)
}

function refreshDepositInBackground(minIntervalMs = DEPOSIT_BACKGROUND_MIN_INTERVAL_MS) {
  if (document.visibilityState !== 'visible') return
  if (depositFetching) return
  if (depositRefreshStartedAt && Date.now() - depositRefreshStartedAt < minIntervalMs) return
  void loadDeposit({ silent: true, background: true })
}

function refreshDepositWhenVisible() {
  refreshDepositInBackground()
}

function pollDepositStatus() {
  const statuses = depositRecordStatuses()
  if (statuses.some((status) => DEPOSIT_ACTIVE_STATUSES.includes(status))) {
    refreshDepositInBackground(DEPOSIT_ACTIVE_POLL_MS - DEPOSIT_POLL_JITTER_TOLERANCE_MS)
    return
  }
  if (statuses.some((status) => DEPOSIT_STALLED_STATUSES.includes(status))) {
    refreshDepositInBackground(DEPOSIT_STALLED_POLL_MS - DEPOSIT_POLL_JITTER_TOLERANCE_MS)
  }
}

const recentIncome = computed<DevWalletIncomeItem[]>(() => overview.value?.recent_income ?? [])
const withdrawalMinAmount = computed(() => withdrawalLimits.value?.min_amount_cny ?? 0.01)
const withdrawalMaxAmount = computed(() => withdrawalLimits.value?.max_amount_cny ?? 999999)
const canWithdraw = computed(() => (overview.value?.withdrawable_balance_cny ?? 0) >= withdrawalMinAmount.value)

/** 出款说明兜底文案：正常情况下由后端 `payout_schedule_note` 下发，只在设置接口失败时兜底。 */
const DEFAULT_PAYOUT_SCHEDULE_NOTE = 'T+1 到账，免手续费'

/** 设置接口是否已经返回：返回前不判断通道状态，避免误报「通道未就绪」。 */
const withdrawalSettingLoaded = computed(() => withdrawalSetting.value !== null)
const payoutChannelReady = computed(() => withdrawalSetting.value?.payout_channel_ready ?? false)
const payoutChannelMessage = computed(() => withdrawalSetting.value?.payout_channel_message ?? '')
/** 通道状态未知时按就绪处理，真正的拦截交给后端，避免一次请求失败就禁用提现入口。 */
const payoutChannelUsable = computed(() => withdrawalSettingLoaded.value === false || payoutChannelReady.value)
const autoWithdrawEnabled = computed(() => withdrawalSetting.value?.auto_withdraw_enabled ?? false)
/** T+1 到账与免手续费的说明，两条提现路径共用 */
const payoutScheduleNote = computed(
  () => withdrawalSetting.value?.payout_schedule_note || DEFAULT_PAYOUT_SCHEDULE_NOTE,
)
/** 手动提现入口：余额达标且出款通道可用（自动提现开启时仍允许手动发起） */
const canSubmitWithdrawal = computed(() => canWithdraw.value && payoutChannelUsable.value)
/** 自动提现开关：通道不可用时禁用（已开启的开关要允许关闭） */
const autoWithdrawReady = computed(() => payoutChannelUsable.value || autoWithdrawEnabled.value)

const depositWithdrawable = computed(
  () => depositWithdrawalSummary.value?.withdrawable_balance_cny ?? 0,
)
const depositTotalPaid = computed(() => depositStatus.value?.total_paid_cny ?? 0)
const canWithdrawDeposit = computed(() => depositWithdrawable.value >= withdrawalMinAmount.value)

onMounted(async () => {
  auth.hydrate()
  countdownTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
  depositRefreshTimer = setInterval(pollDepositStatus, DEPOSIT_ACTIVE_POLL_MS)
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

async function reloadWallet() {
  await Promise.all([loadWallet(), loadDeposit()])
}

async function loadWallet() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  loading.value = true
  try {
    const [wallet, setting] = await Promise.all([
      getDevWalletOverview(auth.token),
      // 提现偏好加载失败不影响余额展示：仅有开关与通道状态缺失，由后端兜底校验
      getDevWithdrawalSetting(auth.token).catch(() => null),
    ])
    overview.value = wallet
    if (setting) {
      withdrawalSetting.value = setting
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载钱包失败'
    showToast(message, 'error')
  } finally {
    loading.value = false
  }
}

type LoadDepositOptions = {
  /** 失败时不弹 toast（后台轮询使用） */
  silent?: boolean
  /** 后台刷新：不点亮表格/按钮的 loading 遮罩，避免闪烁 */
  background?: boolean
}

async function loadDeposit(options: LoadDepositOptions = {}) {
  if (!auth.token || depositFetching) return

  const { silent = false, background = false } = options
  depositFetching = true
  depositRefreshStartedAt = Date.now()
  if (!background) {
    depositLoading.value = true
  }
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
    depositFetching = false
    if (!background) {
      depositLoading.value = false
    }
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
    showToast(
      next
        ? '已开启自动提现，平台财务将在每个工作日批量出款'
        : '已关闭自动提现，之后需要自己手动发起提现',
      'success',
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : next ? '开启自动提现失败' : '关闭自动提现失败'
    showToast(message, 'error')
  } finally {
    autoWithdrawSaving.value = false
  }
}

/** 跳转账号中心绑定或修改收款银行卡（手动与自动提现的前置条件） */
function goBindSettlementAccount() {
  void router.push({ name: 'workbench-account', query: { settle: '1' } })
}

/** 收入提现弹窗：余额、通道状态与提交都在子组件内完成，提交成功后回刷本页读数 */
function openWithdrawDialog() {
  void withdrawDialog.value?.open()
}

/** 打开保证金充值弹窗：签约前置校验与信用额度查询都在子组件内完成 */
function openRechargeDialog() {
  void rechargeDialog.value?.open()
}

function openDepositWithdrawDialog() {
  if (!canWithdrawDeposit.value) {
    showToast('当前可提现保证金不足，暂时无法发起提现', 'warning')
    return
  }

  depositWithdrawDialogVisible.value = true
}

/* 工具栏的「重置」：清掉关键字即可（四类记录共用这一个筛选）。
   与其它列表页一致，常驻可用、不置灰。 */
function resetRecordFilters() {
  recordKeyword.value = ''
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
    // 静默刷新，避免提交后表格再闪一次 loading
    await loadDeposit({ silent: true, background: true })
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
    <WorkbenchBarSlot>
      <TLoading tag="div" class="dev-meta-strip" :loading="loading">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">累计收入</span>
          <span class="dev-meta-strip__value">{{ money(overview?.total_income_cny) }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">今日入账</span>
          <span class="dev-meta-strip__value">{{ money(overview?.today_income_cny) }}</span>
          <TTag
            variant="outline"
            :tone="(overview?.today_income_change_rate ?? 0) >= 0 ? 'success' : 'danger'"
            class="dev-meta-strip__tag"
          >
            {{ rateText(overview?.today_income_change_rate) }}
          </TTag>
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
        <div class="dev-meta-strip__item dev-meta-strip__action">
          <TButton icon-only :loading="loading || depositLoading" aria-label="刷新钱包数据" @click="reloadWallet">
            <TIcon>
              <Refresh />
            </TIcon>
          </TButton>
        </div>
      </TLoading>
    </WorkbenchBarSlot>

    <!-- 主余额卡片 -->
    <div class="wallet-hero">
      <!-- 接单收入 -->
      <TCard class="dev-surface-card wallet-hero__card">
        <div class="dev-card-head">
          <div class="dev-card-head__title-block">
            <h3 class="dev-section-title">接单收入</h3>
          </div>
          <div class="dev-card-head__actions">
            <TTag variant="outline" tone="info"
              >已提现 {{ money(overview?.paid_withdraw_cny) }}</TTag
            >
          </div>
        </div>
        <div class="wallet-hero__body">
          <div class="wallet-hero__main">
            <span class="dev-figure" :class="{ 'dev-figure--muted': !canWithdraw }">
              {{ money(overview?.withdrawable_balance_cny) }}
            </span>
          </div>
          <!-- 状态标签与 T+1 说明同处一行：标签靠左，说明贴右边界。说明文字由后端下发 -->
          <div class="wallet-hero__meta">
            <div class="wallet-hero__tags">
              <TTag
                variant="outline"
                v-if="(overview?.pending_withdraw_cny ?? 0) > 0"
                tone="warning"
              >
                提现处理中 {{ money(overview?.pending_withdraw_cny) }}
              </TTag>
              <TTag variant="outline" :tone="canWithdraw ? 'success' : 'info'">
                {{ canWithdraw ? '满足提现条件' : '不满足提现条件' }}
              </TTag>
            </div>
            <p class="wallet-hero__note">{{ payoutScheduleNote }}</p>
          </div>
        </div>

        <!-- 自动提现与手动提现是并存的两条出款路径：并成一行展示，说明折到行下方 -->
        <div class="wallet-payout">
          <div class="wallet-payout__paths">
            <div class="wallet-payout__path">
              <span class="wallet-payout__title">自动提现</span>
              <TSwitch
                class="wallet-payout__switch"
                :model-value="autoWithdrawEnabled"
                :loading="autoWithdrawSaving"
                :disabled="!autoWithdrawReady"
                aria-label="自动提现"
                @update:model-value="toggleAutoWithdraw"
              />
            </div>
            <div class="wallet-payout__path">
              <TButton
                variant="solid"
                tone="accent"
                :disabled="!canSubmitWithdrawal"
                @click="openWithdrawDialog"
              >
                <TIcon>
                  <Wallet />
                </TIcon>
                <span>申请提现</span>
              </TButton>
            </div>
          </div>
          <div
            v-if="withdrawalSettingLoaded && !payoutChannelReady"
            class="wallet-payout__alert"
            role="status"
          >
            <TIcon>
              <WarningFilled />
            </TIcon>
            <span>{{ payoutChannelMessage || '出款通道暂未就绪，请先绑定收款银行卡' }}</span>
            <TButton variant="text" tone="accent" @click="goBindSettlementAccount">去绑定</TButton>
          </div>
        </div>
      </TCard>

      <!-- 保证金余额 -->
      <TCard class="dev-surface-card wallet-hero__card">
        <div class="dev-card-head">
          <div class="dev-card-head__title-block">
            <h3 class="dev-section-title">保证金余额</h3>
          </div>
          <div class="dev-card-head__actions">
            <TTag variant="outline" tone="info">充值总额 {{ money(depositTotalPaid) }}</TTag>
          </div>
        </div>
        <div class="wallet-hero__body">
          <div class="wallet-hero__main">
            <span class="dev-figure" :class="{ 'dev-figure--muted': !canWithdrawDeposit }">
              {{ money(depositWithdrawable) }}
            </span>
          </div>
          <div class="wallet-hero__tags">
            <TTag variant="outline" v-if="(depositStatus?.frozen_cny ?? 0) > 0" tone="warning">
              冻结中 {{ money(depositStatus?.frozen_cny) }}
            </TTag>
            <TTag
              variant="outline"
              v-if="(depositStatus?.pending_refund_cny ?? 0) > 0"
              tone="warning"
            >
              退款处理中 {{ money(depositStatus?.pending_refund_cny) }}
            </TTag>
            <TTag
              variant="outline"
              v-if="(depositWithdrawalSummary?.pending_withdraw_cny ?? 0) > 0"
              tone="warning"
            >
              处理中 {{ money(depositWithdrawalSummary?.pending_withdraw_cny) }}
            </TTag>
            <TTag variant="outline" :tone="canWithdrawDeposit ? 'success' : 'info'">
              {{ canWithdrawDeposit ? '满足提现条件' : '不满足提现条件' }}
            </TTag>
            <TTag
              variant="outline"
              v-if="creditInfo && creditInfo.enforce_deposit_limit"
              tone="accent"
            >
              信用 {{ creditInfo.credit_score.toFixed(2) }} · 剩余可充
              {{ money(creditInfo.remaining_deposit_cap_cny) }}
            </TTag>
          </div>
        </div>
        <div class="wallet-hero__footer">
          <TButton
            variant="solid"
            tone="accent"
            :disabled="!canWithdrawDeposit"
            :loading="depositLoading"
            @click="openDepositWithdrawDialog"
          >
            <TIcon v-if="!depositLoading">
              <Wallet />
            </TIcon>
            <span>提现保证金</span>
          </TButton>
          <TButton variant="outline" @click="openRechargeDialog">
            <TIcon><Wallet /></TIcon>
            <span>充值</span>
          </TButton>
        </div>
      </TCard>
    </div>

    <section class="dev-surface-card wallet-records" aria-label="资金明细">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">资金明细</h3>
        </div>
      </div>
      <div class="dev-toolbar">
        <TInput
          v-model="recordKeyword"
          class="dev-toolbar__search"
          clearable
          placeholder="搜索单号、类型、状态或处理备注"
        >
          <template #prefix>
            <TIcon>
              <Search />
            </TIcon>
          </template>
        </TInput>

        <div class="dev-toolbar__actions">
          <TButton variant="outline" @click="resetRecordFilters">
            <TIcon>
              <Refresh />
            </TIcon>
            <span>重置</span>
          </TButton>
        </div>
      </div>

      <!-- 资金明细：保证金充值 / 保证金提现 / 收入 / 收入提现四类合成一段（子组件里按时间倒序拼） -->
      <DevFundRecordsView :income="recentIncome" :keyword="recordKeyword" />
    </section>

    <!-- 收入提现弹窗：与工作台总览的「提现」按钮共用同一组件 -->
    <DevWithdrawalDialog ref="withdrawDialog" @submitted="loadWallet" />

    <!-- 保证金提现弹窗 -->
    <TDialog
      v-model:open="depositWithdrawDialogVisible"
      title="保证金提现"
      width="520px"
      class="dev-dialog"
    >
      <TForm label-position="top">
        <TFormItem label="可提现保证金">
          <div class="dev-figure dev-figure--sm">{{ money(depositWithdrawable) }}</div>
        </TFormItem>
        <TFormItem label="提现金额" required>
          <TInputNumber
            v-model="depositWithdrawForm.amount_cny"
            :min="withdrawalMinAmount"
            :max="withdrawalMaxAmount"
            :precision="2"
            :step="0.01"
            placeholder="提现金额"
            style="width: 100%"
          />
          <div class="dev-wallet-withdraw__note">
            可提现 {{ money(withdrawalMinAmount) }} 至
            {{ money(withdrawalMaxAmount) }}，最多保留两位小数，不能超过可提现保证金余额。
          </div>
        </TFormItem>
        <TFormItem label="退回方式">
          <div class="dev-wallet-withdraw__note">
            充值 360 天内原路退回；超过 360 天的部分，分账至付款人账户后提现至其收款银行卡。
          </div>
          <p v-if="depositWithdrawalError" role="alert">{{ depositWithdrawalError }}</p>
        </TFormItem>
        <TFormItem label="申请备注">
          <TInput
            show-count
            v-model="depositWithdrawForm.note"
            type="textarea"
            :rows="3"
            :maxlength="withdrawalLimits?.note_max_len ?? 200"
            placeholder="可选"
          />
        </TFormItem>
      </TForm>
      <template #footer>
        <TButton @click="depositWithdrawDialogVisible = false">取消</TButton>
        <TButton
          variant="solid"
          tone="accent"
          :loading="submittingDepositWithdrawal"
          @click="submitDepositWithdrawal"
          >提交申请</TButton
        >
      </template>
    </TDialog>

    <!-- 保证金充值弹窗：与工作台总览的「保证金不足」提示共用同一组件 -->
    <DevDepositRechargeDialog ref="rechargeDialog" />
  </div>
</template>

<style scoped>
/* 表格走 dev-base.css 的 .dev-table，表尾走 .dev-pager（这两处原来在页内用 :deep 改写，
   还顺手改了子组件 DevFundRecordsView 里的同名元素）。这里只留本页特有样式。 */
/* 钱包记录与其余菜单页的列表同构：一张 .dev-surface-card（同底/同描边/同圆角/同阴影，
   内边距 24px 由统一层给）。原来它是页面上的一条裸区块——标题与表格直接压在页面背景上，
   只靠一条顶部分隔线开头，与资源列表、我的接单那种「标题 + 工具栏 + 列表都在卡片里」
   不是一种结构，切菜单时整页的骨架会变。 */
.wallet-records {
  min-width: 0;
}

/* 记录切换与关键字搜索一起走统一层的 .dev-toolbar（筛选 → 搜索 → 右侧动作），
   间距由工具栏自己给，本页不再补 margin。 */

.wallet-records__amount {
  font-weight: 700;
  color: var(--dev-ink);
  font-variant-numeric: tabular-nums;
}
</style>
