<script setup lang="ts">
import { TButton, TDialog } from 'ui_73info'

/**
 * 后端首次生成回调密钥时的弹窗：明文只回这一次，关掉就再也看不到。
 *
 * 页内也有一份同样的明文面板（`ResourceApiChannelSection`），弹窗只是把「只显示一次」
 * 这件事在最醒目的位置再说一遍。
 */
defineProps<{
  secret: string
  /** 确认按钮的文案：编辑页是「我已保存」，创建页保存后要回资源列表。 */
  confirmLabel?: string
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  copy: []
  /** 点「我已保存」：消费方要在关闭弹窗之外做收尾（复位表单、回列表）。 */
  confirm: []
}>()

function onConfirm() {
  open.value = false
  emit('confirm')
}
</script>

<template>
  <TDialog
    v-model:open="open"
    width="560px"
    class="dev-dialog"
    title="回调密钥已生成（只显示这一次）"
  >
    <p class="dev-secret-dialog__hint">
      这是平台为这个接口资源生成的回调密钥。<strong>关闭后平台不再显示明文</strong>，
      请立即复制并保存到你自有站点的服务端，用于校验回调签名。
    </p>
    <code class="dev-secret-dialog__value">{{ secret }}</code>
    <template #footer>
      <TButton variant="outline" @click="emit('copy')">复制密钥</TButton>
      <TButton variant="solid" tone="accent" @click="onConfirm">{{
        confirmLabel || '我已保存'
      }}</TButton>
    </template>
  </TDialog>
</template>
