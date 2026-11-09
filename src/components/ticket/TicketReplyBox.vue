<script setup lang="ts">
/**
 * 工单详情的回复区：输入、附件上传、发送与两类错误提示。
 *
 * 从 `views/TicketCenterView.vue` 拆出来（视图 300 行预算）：草稿与附件是组件内部状态，
 * 提交 / 上传 / 下载仍走页面传下来的 `useTicketActions` 方法，页面不再持有这几份 ref。
 */
import { ref } from 'vue'

import type { TicketAttachment } from '@/api/tickets'
import TicketAttachments from '@/components/ticket/TicketAttachments.vue'
import { TButton } from 'ui_73info'

const props = defineProps<{
  canReply: boolean
  replying: boolean
  actionError: string
  submitReply: (content: string, attachmentIds: number[]) => Promise<boolean>
  uploadAttachment: (file: File) => Promise<TicketAttachment>
  downloadAttachment: (attachment: TicketAttachment) => void | Promise<void>
}>()

const content = ref('')
const attachments = ref<TicketAttachment[]>([])
const uploading = ref(false)
const error = ref('')

async function uploadFile(file: File) {
  error.value = ''
  uploading.value = true
  try {
    const uploaded = await props.uploadAttachment(file)
    attachments.value = [...attachments.value, uploaded]
  } catch (err) {
    error.value = err instanceof Error && err.message ? err.message : '上传附件失败'
  } finally {
    uploading.value = false
  }
}

function removeAttachment(attachment: TicketAttachment) {
  attachments.value = attachments.value.filter((item) => item.id !== attachment.id)
}

async function send() {
  const ok = await props.submitReply(
    content.value,
    attachments.value.map((item) => item.id),
  )
  if (!ok) return
  content.value = ''
  attachments.value = []
}
</script>

<template>
  <div v-if="canReply" class="ticket-reply">
    <textarea v-model="content" rows="3" placeholder="补充说明或回复客服" />
    <TicketAttachments
      :attachments="attachments"
      :uploading="uploading"
      @upload="uploadFile"
      @remove="removeAttachment"
      @download="downloadAttachment"
    />
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="actionError" role="alert">{{ actionError }}</p>
    <TButton variant="solid" tone="accent" :loading="replying" @click="send">发送回复</TButton>
  </div>
  <div v-else class="ticket-reply ticket-reply--blocked">
    <p v-if="actionError" role="alert">{{ actionError }}</p>
    <span class="ticket-item__meta">当前不可回复</span>
  </div>
</template>

<style scoped>
.ticket-reply {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}
.ticket-reply textarea {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--73-border);
  border-radius: 8px;
  background: var(--73-surface-strong);
  color: var(--73-ink);
  font: inherit;
}
[role='alert'] {
  margin: 0;
  color: var(--73-danger-text);
}
.ticket-item__meta {
  color: var(--73-ink-muted);
  font-size: 12px;
}
</style>
