<script setup lang="ts">
import { ref, watch } from 'vue'

import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'
import { initiatePurchaseTransfer } from '@/api/resourcePurchaseTransfers'
import { describeBackendError } from '@/shared/backendErrorText'
import { TAlert, TButton, TDialog, TForm, TFormItem, TInput, TMessage } from 'ui_73info'

const props = defineProps<{
  order: ResourcePurchaseOrder | null
  token: string
}>()
const emit = defineEmits<{ submitted: [] }>()
const open = defineModel<boolean>('open', { required: true })
const transferUsername = ref('')
const transferMessage = ref('')
const transferSaving = ref(false)

watch(open, (visible) => {
  if (!visible) return
  transferUsername.value = ''
  transferMessage.value = ''
})

async function submitTransfer() {
  const order = props.order
  if (!order || transferSaving.value) return
  if (!props.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }
  const toUsername = transferUsername.value.trim()
  if (!toUsername) {
    TMessage.warning('请填写接收方用户名')
    return
  }
  transferSaving.value = true
  try {
    await initiatePurchaseTransfer(props.token, order.order_no, {
      to_username: toUsername,
      message: transferMessage.value.trim() || null,
    })
    open.value = false
    TMessage.success('转移申请已发送，等待对方接受')
    emit('submitted')
  } catch (error) {
    TMessage.error(describeBackendError(error, '发起使用权转移失败'))
  } finally {
    transferSaving.value = false
  }
}
</script>

<template>
  <TDialog v-model:open="open" title="转移订单使用权" width="480px">
    <TAlert tone="warning" variant="soft" title="对方接受后，这笔订单的使用权将转给对方。" />
    <TForm label-position="top" class="purchase-transfer-form">
      <p class="purchase-transfer-form__resource">
        {{ order?.resource_title || `资源 #${order?.resource_id ?? ''}` }}
      </p>
      <TFormItem label="接收方登录用户名" required>
        <TInput v-model="transferUsername" :maxlength="64" placeholder="登录用户名" />
      </TFormItem>
      <TFormItem label="说明">
        <TInput
          v-model="transferMessage"
          type="textarea"
          :rows="3"
          :maxlength="500"
          show-count
          placeholder="交接事项"
        />
      </TFormItem>
    </TForm>
    <template #footer>
      <TButton variant="outline" :disabled="transferSaving" @click="open = false">取消</TButton>
      <TButton :loading="transferSaving" @click="submitTransfer">发送申请</TButton>
    </template>
  </TDialog>
</template>

<style scoped>
.purchase-transfer-form {
  margin-top: 16px;
}
.purchase-transfer-form__resource {
  margin: 0 0 14px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
</style>
