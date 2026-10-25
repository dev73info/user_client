<script setup lang="ts">
import { computed, ref } from 'vue'
import { TButton, TDialog, TInput, TMessage, TInputNumber } from 'ui_73info'

import { createPrepaidWithdrawal } from '@/api/devOrderDeposit'
import { toFen } from '@/composables/useDevWalletDeposit'
import { useAuthStore } from '@/stores/auth'

/**
 * 保证金提现申请弹窗。
 *
 * 只提交「整数分 + 备注」：收款账户取账号中心绑定的那一张，**前端不传也不该传**——
 * 让前端指定收款账户等于把别人账户填进去就能提走钱。
 */
const emit = defineEmits<{
  (event: 'succeeded'): void
}>()

/** 可提额度（分），由调用方从后端读数传入。 */
const props = defineProps<{ withdrawableFen: number }>()

const auth = useAuthStore()
const visible = ref(false)
const submitting = ref(false)
const amountYuan = ref<number | null>(null)
const note = ref('')

const amountFen = computed(() => (amountYuan.value == null ? 0 : toFen(amountYuan.value)))
const amountError = computed(() => {
  if (amountYuan.value == null || !Number.isFinite(amountYuan.value) || amountYuan.value <= 0) {
    return '请输入提现金额'
  }
  if (amountFen.value > props.withdrawableFen) {
    return `超过可提现额度 ¥${(props.withdrawableFen / 100).toFixed(2)}`
  }
  return ''
})

function open() {
  amountYuan.value = null
  note.value = ''
  visible.value = true
}

async function submit() {
  if (submitting.value) return
  if (amountError.value) {
    TMessage.warning(amountError.value)
    return
  }
  submitting.value = true
  try {
    await createPrepaidWithdrawal(auth.token, {
      amount_fen: amountFen.value,
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
    })
    TMessage.success('提现申请已提交，等待审核')
    visible.value = false
    emit('succeeded')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '提交提现申请失败')
  } finally {
    submitting.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <TDialog v-model:open="visible" title="提现接单保证金" width="420px">
    <p class="withdraw-dialog__hint">
      可提现 ¥{{ (withdrawableFen / 100).toFixed(2) }}。提现金额原路退回充值时的付款账户。
    </p>

    <label class="withdraw-dialog__field">
      <span>提现金额（元）</span>
      <TInputNumber
        v-model="amountYuan"
        :min="0.01"
        :max="withdrawableFen / 100"
        :precision="2"
        placeholder="请输入提现金额"
        class="withdraw-dialog__input"
      />
    </label>
    <p v-if="amountError && amountYuan != null" class="withdraw-dialog__error">
      {{ amountError }}
    </p>

    <label class="withdraw-dialog__field">
      <span>备注（选填）</span>
      <TInput v-model="note" placeholder="例如：暂时不需要接单了" :maxlength="200" />
    </label>

    <template #footer>
      <TButton :disabled="submitting" @click="visible = false">取消</TButton>
      <TButton
        variant="solid"
        tone="accent"
        :loading="submitting"
        :disabled="!!amountError"
        @click="submit"
      >
        提交申请
      </TButton>
    </template>
  </TDialog>
</template>

<style scoped>
.withdraw-dialog__hint {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--73-ink-soft);
}

.withdraw-dialog__field {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
  font-size: 13px;
  color: var(--73-ink);
}

.withdraw-dialog__input {
  width: 100%;
}

.withdraw-dialog__error {
  margin: -6px 0 12px;
  font-size: 12px;
  /* `--el-color-danger` 在本应用没有定义（见 DevDepositRechargeDialog 的说明），
     引用它会让错误文案退回正文色，看着跟提示一样。 */
  color: var(--73-danger);
}
</style>
