<script setup lang="ts">
/**
 * 开发者接单收入提现弹窗（手动提现路径）。
 *
 * 从收益钱包页提出来的公共窗口：工作台总览的「提现」按钮与收益钱包的「申请提现」按钮
 * 共用同一个弹窗，总览页点了就地开窗，不再跳到钱包页，避免两处各写一份表单与提交逻辑。
 *
 * 余额与出款通道状态在每次打开时重新拉取，用此刻的服务端数据做前置校验与金额上限；
 * 提交成功后只发 `submitted` 事件，由调用方决定怎么刷新自己的余额展示。
 *
 * 样式复用全局的 `.dev-dialog`（styles/dev-base.css）与 `.dev-wallet-withdraw__*`
 * （styles/dev-wallet.css），两者都由 main.ts 全局引入，所以本组件不需要自己的 style 块。
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  createDevWithdrawalRequest,
  getDevWalletOverview,
  getDevWithdrawalSetting,
  validateDevWithdrawalRequest,
  type CreateDevWithdrawalRequest,
  type DevWithdrawalSetting,
} from '@/api/devWallet'
import { useAuthStore } from '@/stores/auth'


import { TButton, TDialog, TForm, TFormItem, TInput, TInputNumber, TMessage } from 'ui_73info'
const auth = useAuthStore()
const router = useRouter()

const emit = defineEmits<{ submitted: [] }>()

/** 提现下限与后端默认口径一致；上限取打开弹窗那一刻的可提现余额。 */
const MIN_AMOUNT_CNY = 0.01
/** 备注长度上限：与 `validateDevWithdrawalRequest` 的默认值同源，后端还有一次兜底校验。 */
const NOTE_MAX_LEN = 200
/** 出款说明兜底文案：正常情况下由后端 `payout_schedule_note` 下发，只在设置接口失败时兜底。 */
const DEFAULT_PAYOUT_SCHEDULE_NOTE = 'T+1 到账，免手续费'

const visible = ref(false)
const submitting = ref(false)
/** 打开弹窗时拉到的可提现余额：既用于金额上限，也显示在表单首行 */
const withdrawable = ref(0)
const setting = ref<DevWithdrawalSetting | null>(null)

const form = reactive<CreateDevWithdrawalRequest>({
  amount_cny: 0,
  // 接单收入统一经 Adapay 出款到开发者绑定的收款银行卡，收款信息由服务端补全。
  channel: 'adapay',
  account_name: '',
  account_no: '',
  note: '',
})

const payoutChannelReady = computed(() => setting.value?.payout_channel_ready ?? false)
/** 通道状态未知时按就绪处理，真正的拦截交给后端，避免一次请求失败就禁用提现入口。 */
const payoutChannelUsable = computed(() => setting.value === null || payoutChannelReady.value)
const payoutChannelMessage = computed(() => setting.value?.payout_channel_message ?? '')
const payoutScheduleNote = computed(
  () => setting.value?.payout_schedule_note || DEFAULT_PAYOUT_SCHEDULE_NOTE,
)
/** 收款账户固定为账号中心绑定的 Adapay 收款银行卡，这里只回显状态 */
const payoutAccountLabel = computed(() =>
  payoutChannelReady.value ? '账号中心绑定的收款银行卡' : '尚未绑定收款银行卡',
)

/**
 * 打开弹窗：先取当前余额与出款通道状态，前置条件不满足时只提示、不开窗。
 *
 * 余额不足与通道未就绪都由后端再拦一次，这里的判断只是为了少一次必然失败的提交。
 */
async function open(): Promise<void> {
  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  // 提现偏好加载失败不影响余额判断：通道状态缺失时按就绪处理
  const [overview, preference] = await Promise.all([
    getDevWalletOverview(auth.token).catch(() => null),
    getDevWithdrawalSetting(auth.token).catch(() => null),
  ])
  setting.value = preference

  if (!overview) {
    TMessage.error('加载可提现余额失败，请稍后重试')
    return
  }
  withdrawable.value = overview.withdrawable_balance_cny ?? 0

  if (withdrawable.value < MIN_AMOUNT_CNY) {
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

/** 跳转账号中心绑定或修改收款银行卡（手动与自动提现的前置条件） */
function goBindSettlementAccount(): void {
  visible.value = false
  void router.push({ name: 'workbench-account', query: { settle: '1' } })
}

function resetForm(): void {
  form.amount_cny = 0
  form.channel = 'adapay'
  form.account_name = ''
  form.account_no = ''
  form.note = ''
}

async function submit(): Promise<void> {
  if (submitting.value) {
    return
  }
  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  const payload: CreateDevWithdrawalRequest = {
    amount_cny: normalizeCnyAmount(Number(form.amount_cny)),
    channel: form.channel,
    account_name: form.account_name.trim(),
    account_no: form.account_no.trim(),
    note: form.note?.trim() || null,
  }

  const validationMessage = validateDevWithdrawalRequest(payload, withdrawable.value)
  if (validationMessage) {
    TMessage.warning(validationMessage)
    return
  }

  submitting.value = true
  try {
    const record = await createDevWithdrawalRequest(auth.token, payload)
    // 出款提交后由 Adapay 处理：可能已出款、也可能仍在处理中（T+1 到账）或失败待补发
    if (record.status === 'paid') {
      TMessage.success('提现已提交，平台已完成出款')
    } else if (record.status === 'payout_failed') {
      TMessage.warning(record.payout_failure_message || '出款未完成，平台会安排补发')
    } else {
      TMessage.success('提现已提交，Adapay 出款一般 T+1 到账')
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

// 与各开发者页面一致的小工具：金额展示与两位小数归一
function money(value?: number | null): string {
  if (value == null) {
    return '¥0.00'
  }

  return `¥${value.toFixed(2)}`
}

function normalizeCnyAmount(value: number): number {
  return Math.round(value * 100) / 100
}

defineExpose({ open })
</script>

<template>
  <!-- 收入提现：收款账户固定为账号中心绑定的收款银行卡，前端只采集金额与备注 -->
  <TDialog v-model:open="visible" title="申请提现" width="520px" class="dev-dialog">
    <TForm label-position="top">
      <TFormItem label="可提现余额">
        <div class="dev-figure dev-figure--sm">{{ money(withdrawable) }}</div>
      </TFormItem>
      <TFormItem label="提现金额" required>
        <TInputNumber v-model="form.amount_cny" :min="MIN_AMOUNT_CNY" :max="withdrawable"
          :precision="2" :step="0.01" placeholder="提现金额" style="width: 100%" />
        <div class="dev-wallet-withdraw__note">
          最多 {{ money(withdrawable) }}，保留两位小数，不能超过可提现余额。
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
        <TInput show-count v-model="form.note" type="textarea" :rows="3" :maxlength="NOTE_MAX_LEN"
          placeholder="可选" />
      </TFormItem>
    </TForm>
    <template #footer>
      <TButton @click="visible = false">取消</TButton>
      <TButton variant="solid" tone="accent" :loading="submitting" @click="submit">确认提现</TButton>
    </template>
  </TDialog>
</template>
