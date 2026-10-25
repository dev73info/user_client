<script setup lang="ts">
import { computed, ref } from 'vue'
import { TButton, TDialog, TMessage, TInputNumber } from 'ui_73info'

import { createPrepaidRecharge } from '@/api/devOrderDeposit'
import { toFen } from '@/composables/useDevWalletDeposit'
import { useAuthStore } from '@/stores/auth'

/**
 * 保证金充值弹窗。
 *
 * 只做一件事：下一张充值单，拿到 `client_action` 后交给调用方去拉起支付。
 * 金额在本地按元输入、提交前换成整数分——浮点元不进请求体。
 */
const emit = defineEmits<{
  (event: 'succeeded'): void
}>()

const auth = useAuthStore()
const open = ref(false)
const submitting = ref(false)
/** 充值金额（元），默认 1000。 */
const amountYuan = ref(1000)

const amountFen = computed(() => toFen(amountYuan.value))
const amountError = computed(() => {
  if (!Number.isFinite(amountYuan.value) || amountYuan.value <= 0) {
    return '请输入大于 0 的金额'
  }
  if (amountFen.value < 1) {
    return '金额至少 0.01 元'
  }
  return ''
})

function show() {
  amountYuan.value = 1000
  open.value = true
}

async function submit() {
  if (submitting.value || amountError.value) {
    if (amountError.value) TMessage.warning(amountError.value)
    return
  }
  submitting.value = true
  try {
    const order = await createPrepaidRecharge(auth.token, {
      amount_fen: amountFen.value,
      channel: 'alipay',
      client_platform: 'pc',
    })
    // 渠道给了拉起动作就交给它；没给说明后端已经幂等返回了既有单，提示去支付即可。
    const action = order.client_action as { pay_url?: string } | null
    if (action?.pay_url) {
      window.location.href = action.pay_url
      return
    }
    TMessage.success('充值单已创建，请完成支付')
    emit('succeeded')
    open.value = false
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '创建充值订单失败')
  } finally {
    submitting.value = false
  }
}

defineExpose({ show })
</script>

<template>
  <TDialog v-model:open="open" title="充值接单保证金" width="420px">
    <p class="deposit-dialog__hint">
      保证金用于担保单接单时冻结，履约完成后释放。充值金额可随时申请提现。
    </p>
    <label class="deposit-dialog__field">
      <span>充值金额（元）</span>
      <TInputNumber
        v-model="amountYuan"
        :min="0.01"
        :step="100"
        :precision="2"
        class="deposit-dialog__input"
      />
    </label>
    <p v-if="amountError" class="deposit-dialog__error">{{ amountError }}</p>

    <template #footer>
      <TButton :disabled="submitting" @click="open = false">取消</TButton>
      <TButton variant="solid" tone="accent" :loading="submitting" @click="submit">
        去支付
      </TButton>
    </template>
  </TDialog>
</template>

<style scoped>
.deposit-dialog__hint {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--73-ink-soft);
}

.deposit-dialog__field {
  display: grid;
  gap: 8px;
  font-size: 13px;
  color: var(--73-ink);
}

.deposit-dialog__input {
  width: 100%;
}

.deposit-dialog__error {
  margin: 8px 0 0;
  font-size: 12px;
  /* 不要用 var(--el-color-danger)：这套 Element 令牌在本应用没有定义，
     引用了会静默退回继承色，错误提示看起来跟正文一样。 */
  color: var(--73-danger);
}
</style>
