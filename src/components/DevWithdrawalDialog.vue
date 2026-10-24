<script setup lang="ts">
/**
 * 开发者接单收入提现弹窗（手动提现路径）。
 *
 * 从收益钱包页提出来的公共窗口：工作台总览的「提现」按钮与收益钱包的「申请提现」按钮
 * 共用同一个弹窗，总览页点了就地开窗，不再跳到钱包页，避免两处各写一份表单与提交逻辑。
 *
 * 读数与门禁全部来自契约端点：可提现额度取 `GET /api/payment/withdrawals/balance`
 * （`withdrawable_fen`，整数分），单笔上下限取 `GET /api/payment/withdrawal-limits/system`，
 * 自动出款门禁取 `GET /api/payment/withdrawal-setting`。三者任一失败都不拦提交——
 * 后端还会再校验一次，这里只是少一次必然失败的请求。
 *
 * 提交成功后只发 `submitted` 事件，由调用方决定怎么刷新自己的余额展示。
 *
 * 样式复用全局的 `.dev-dialog`（styles/dev-base.css）与 `.dev-wallet-withdraw__*`
 * （styles/dev-wallet.css），两者都由 main.ts 全局引入，所以本组件不需要自己的 style 块。
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  createDevWithdrawalRequest,
  getDevWithdrawalBalance,
  getDevWithdrawalConfig,
  getDevWithdrawalSetting,
  validateDevWithdrawalRequest,
  WITHDRAW_NOTE_MAX_LEN,
  type DevWithdrawalConfig,
  type DevWithdrawalSetting,
} from '@/api/devWallet'
import { formatFenAsCny, parseCnyToFen } from '@/shared/money'
import { useAuthStore } from '@/stores/auth'

import { TButton, TDialog, TForm, TFormItem, TInput, TInputNumber, TMessage } from 'ui_73info'

const auth = useAuthStore()
const router = useRouter()

const emit = defineEmits<{ submitted: [] }>()

/** 出款说明兜底文案：正常情况下由后端 `auto_payout_note` 下发。 */
const DEFAULT_PAYOUT_SCHEDULE_NOTE = '限额内可自动出款，其余提现进入人工审核'

const visible = ref(false)
const submitting = ref(false)
/** 打开弹窗时拉到的可提现额度（分）：既是金额上限，也显示在表单首行。 */
const withdrawableFen = ref(0)
const setting = ref<DevWithdrawalSetting | null>(null)
const limits = ref<DevWithdrawalConfig | null>(null)

const form = reactive({
  amount_cny: 0,
  note: '',
})

const payoutChannelReady = computed(() => setting.value?.payout_channel_ready ?? false)
/** 通道状态未知时按就绪处理，真正的拦截交给后端，避免一次请求失败就禁用提现入口。 */
const payoutChannelUsable = computed(() => setting.value === null || payoutChannelReady.value)
const payoutChannelMessage = computed(() => setting.value?.auto_payout_blocked_reason ?? '')
const payoutScheduleNote = computed(
  () => setting.value?.auto_payout_note || DEFAULT_PAYOUT_SCHEDULE_NOTE,
)
/** 金额输入框的下限（元）：契约的 `min_fen` 换成分，只用于控件约束。 */
const minAmountCny = computed(() => (limits.value?.min_fen ?? 1) / 100)
/** 金额输入框的上限（元）：单笔上限与可提现余额取小（0 表示不限额）。 */
const maxAmountCny = computed(() => {
  const capFen = limits.value?.max_fen ?? 0
  const ceilingFen = capFen > 0 ? Math.min(capFen, withdrawableFen.value) : withdrawableFen.value
  return ceilingFen / 100
})
/** 收款账户固定为账号中心绑定的那张卡，这里只回显状态与尾号。 */
const payoutAccountLabel = computed(() => {
  if (!payoutChannelReady.value) {
    return '尚未绑定收款银行卡'
  }
  const tail = setting.value?.account_no_tail?.trim()
  return tail ? `账号中心绑定的收款银行卡（尾号 ${tail}）` : '账号中心绑定的收款银行卡'
})

/**
 * 打开弹窗：先取当前额度与门禁状态，前置条件不满足时只提示、不开窗。
 *
 * 三个读数各自失败都不阻断：拿不到额度就不做上限校验，拿不到门禁就不拦通道状态，
 * 真正的判定在后端。
 */
async function open(): Promise<void> {
  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  const [balance, preference, config] = await Promise.all([
    getDevWithdrawalBalance(auth.token).catch(() => null),
    getDevWithdrawalSetting(auth.token).catch(() => null),
    getDevWithdrawalConfig(auth.token).catch(() => null),
  ])
  setting.value = preference
  limits.value = config

  if (!balance) {
    TMessage.error('加载可提现额度失败，请稍后重试')
    return
  }
  withdrawableFen.value = balance.withdrawable_fen

  if (withdrawableFen.value < (config?.min_fen ?? 1)) {
    TMessage.warning('当前可提现余额不足，暂时无法发起提现')
    return
  }
  if (!payoutChannelUsable.value) {
    TMessage.warning(payoutChannelMessage.value || '出款通道暂未就绪，暂时无法发起提现')
    return
  }

  resetForm()
  visible.value = true
}

/** 跳转账号中心绑定或修改收款银行卡（手动与自动提现的前置条件）。 */
function goBindSettlementAccount(): void {
  visible.value = false
  void router.push({ name: 'workbench-account', query: { settle: '1' } })
}

function resetForm(): void {
  form.amount_cny = 0
  form.note = ''
}

/** 输入框里的元换成整数分：非数字（空、多小数位）返回 null，由校验统一报错。 */
function readAmountFen(): number {
  const parsed = parseCnyToFen(form.amount_cny)
  return parsed ?? Number.NaN
}

async function submit(): Promise<void> {
  if (submitting.value) {
    return
  }
  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  const payload = {
    amount_fen: readAmountFen(),
    note: form.note?.trim() || null,
  }

  const validationMessage = validateDevWithdrawalRequest({
    payload,
    withdrawableFen: withdrawableFen.value,
    limits: limits.value,
  })
  if (validationMessage) {
    TMessage.warning(validationMessage)
    return
  }

  submitting.value = true
  try {
    const record = await createDevWithdrawalRequest(auth.token, payload)
    // 状态文案以后端 `status_label` 为准（契约只保证这个中文说明），本地只兜一句。
    const label = record.status_label || record.status
    if (record.status === 'paid') {
      TMessage.success('提现已提交，平台已完成出款')
    } else if (record.status === 'payout_failed') {
      TMessage.warning(record.payout_failure_reason || '出款未完成，平台会安排补发')
    } else {
      TMessage.success(`提现申请已提交（${label}），到账后可在提现记录里查看`)
    }
    visible.value = false
    resetForm()
    emit('submitted')
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '提交提现申请失败')
  } finally {
    submitting.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <!-- 收入提现：收款账户固定为账号中心绑定的收款银行卡，前端只采集金额与备注 -->
  <TDialog v-model:open="visible" title="申请提现" width="520px" class="dev-dialog">
    <TForm label-position="top">
      <TFormItem label="可提现余额">
        <div class="dev-figure dev-figure--sm">¥{{ formatFenAsCny(withdrawableFen) }}</div>
      </TFormItem>
      <TFormItem label="提现金额" required>
        <TInputNumber
          v-model="form.amount_cny"
          :min="minAmountCny"
          :max="maxAmountCny"
          :precision="2"
          :step="0.01"
          placeholder="提现金额"
          style="width: 100%"
        />
        <div class="dev-wallet-withdraw__note">
          最多 ¥{{ formatFenAsCny(withdrawableFen) }}，保留两位小数，不能超过可提现余额。
        </div>
      </TFormItem>
      <TFormItem label="收款账户">
        <div class="dev-wallet-withdraw__account">
          <span>{{ payoutAccountLabel }}</span>
          <TButton variant="text" tone="accent" @click="goBindSettlementAccount">
            {{ payoutChannelReady ? '更换银行卡' : '去绑定' }}
          </TButton>
        </div>
        <div class="dev-wallet-withdraw__note">{{ payoutScheduleNote }}</div>
      </TFormItem>
      <TFormItem label="申请备注">
        <TInput
          v-model="form.note"
          show-count
          type="textarea"
          :rows="3"
          :maxlength="WITHDRAW_NOTE_MAX_LEN"
          placeholder="可选"
        />
      </TFormItem>
    </TForm>
    <template #footer>
      <TButton @click="visible = false">取消</TButton>
      <TButton variant="solid" tone="accent" :loading="submitting" @click="submit">确认提现</TButton>
    </template>
  </TDialog>
</template>
