<script setup lang="ts">
import { ref, watch } from 'vue'

import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'
import { initiatePurchaseTransfer } from '@/api/resourcePurchaseTransfers'
import { TButton, TDialog, TInput, TMessage } from 'ui_73info'

/**
 * R042 使用权转移弹窗：只有接口资源且已支付的订单会拉起它（判定在页面 `canTransfer`）。
 *
 * 表单是「接收方用户名 + 可选留言」，提交成功就关窗、提示并 emit `submitted`（页面据此跳到
 * 「我发起的转移」）。字段在每次打开时清空——与原先 `openTransfer` 里的清理同一时序。
 */
const props = defineProps<{
  order: ResourcePurchaseOrder | null
  token: string
}>()

const emit = defineEmits<{
  submitted: []
}>()

const open = defineModel<boolean>('open', { required: true })

const transferUsername = ref('')
const transferMessage = ref('')
const transferSaving = ref(false)

/** 留言字数上限：与后端 `transfer.rs::normalized_message` 的 200 字一致。 */
const TRANSFER_MESSAGE_MAX_LENGTH = 200

watch(open, (visible) => {
  if (!visible) {
    return
  }
  transferUsername.value = ''
  transferMessage.value = ''
})

async function submitTransfer() {
  const order = props.order
  if (!order || transferSaving.value) {
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
      message: transferMessage.value.trim() || undefined,
    })
    open.value = false
    TMessage.success('转移申请已发送，等待对方确认')
    emit('submitted')
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '发起使用权转移失败')
  } finally {
    transferSaving.value = false
  }
}
</script>

<template>
  <TDialog v-model:open="open" title="转移使用权" width="480px">
    <div class="purchases-transfer">
      <p class="purchases-transfer__lead">
        {{ order?.resource_title || `资源 #${order?.resource_id ?? ''}` }}
      </p>
      <label class="purchases-transfer__field">
        <span>接收方用户名</span>
        <TInput v-model="transferUsername" placeholder="对方平台用户名" />
      </label>
      <label class="purchases-transfer__field">
        <span>留言（可选）</span>
        <TInput
          v-model="transferMessage"
          placeholder="给对方说明转移原因"
          :maxlength="TRANSFER_MESSAGE_MAX_LENGTH"
        />
      </label>
      <p class="purchases-transfer__hint">
        对方确认后，这笔订单会记到对方账号下；历史支付与回调不受影响。
      </p>
      <div class="purchases-transfer__actions">
        <TButton variant="outline" :disabled="transferSaving" @click="open = false"> 取消 </TButton>
        <TButton :loading="transferSaving" @click="submitTransfer">发送申请</TButton>
      </div>
    </div>
  </TDialog>
</template>

<style scoped src="./purchase-transfer-dialog.css"></style>
