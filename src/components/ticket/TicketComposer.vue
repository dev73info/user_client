<script setup lang="ts">
import { ref, watch } from 'vue'

import { TButton, TDialog } from 'ui_73info'

import TicketAttachments from '@/components/ticket/TicketAttachments.vue'
import type { CreateTicketPayload, TicketAttachment, TicketCategory } from '@/api/tickets'
import { TICKET_PRIORITY_OPTIONS } from '@/shared/ticketDisplay'

const props = withDefaults(
  defineProps<{
    open: boolean
    categories: TicketCategory[]
    loading?: boolean
    error?: string
    upload: (file: File) => Promise<TicketAttachment>
  }>(),
  { loading: false, error: '' },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: CreateTicketPayload]
}>()

const subject = ref('')
const category = ref('')
const priority = ref('normal')
const content = ref('')
const attachments = ref<TicketAttachment[]>([])
const uploading = ref(false)
const uploadError = ref('')
const formError = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    subject.value = ''
    category.value = ''
    priority.value = 'normal'
    content.value = ''
    attachments.value = []
    uploading.value = false
    uploadError.value = ''
    formError.value = ''
  },
)

async function handleUpload(file: File) {
  uploadError.value = ''
  uploading.value = true
  try {
    const uploaded = await props.upload(file)
    attachments.value = [...attachments.value, uploaded]
  } catch (err) {
    uploadError.value = err instanceof Error && err.message ? err.message : '上传附件失败'
  } finally {
    uploading.value = false
  }
}

function removeAttachment(attachment: TicketAttachment) {
  attachments.value = attachments.value.filter((item) => item.id !== attachment.id)
}

function submit() {
  formError.value = ''
  if (!subject.value.trim()) {
    formError.value = '请填写工单标题'
    return
  }
  if (!content.value.trim()) {
    formError.value = '请填写问题描述'
    return
  }
  emit('submit', {
    subject: subject.value.trim(),
    content: content.value.trim(),
    category: category.value || null,
    priority: priority.value,
    attachment_ids: attachments.value.map((item) => item.id),
  })
}
</script>

<template>
  <TDialog :open="open" title="新建工单" width="560px" @update:open="emit('update:open', $event)">
    <div class="ticket-compose">
      <label>
        标题
        <input v-model="subject" maxlength="120" placeholder="简要说明遇到的问题" />
      </label>
      <label>
        分类
        <select v-model="category">
          <option value="">不选分类</option>
          <option v-for="item in categories" :key="item.name" :value="item.name">
            {{ item.name }}
          </option>
        </select>
      </label>
      <label>
        优先级
        <select v-model="priority">
          <option
            v-for="option in TICKET_PRIORITY_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <label>
        问题描述
        <textarea v-model="content" rows="5" placeholder="补充复现步骤和期望结果" />
      </label>
      <TicketAttachments
        :attachments="attachments"
        :uploading="uploading"
        @upload="handleUpload"
        @remove="removeAttachment"
      />
      <p v-if="formError" role="alert">{{ formError }}</p>
      <p v-else-if="uploadError" role="alert">{{ uploadError }}</p>
      <p v-else-if="error" role="alert">{{ error }}</p>
      <div class="ticket-compose__actions">
        <TButton variant="outline" :disabled="loading" @click="emit('update:open', false)">
          取消
        </TButton>
        <TButton variant="solid" tone="accent" :loading="loading" @click="submit">
          提交工单
        </TButton>
      </div>
    </div>
  </TDialog>
</template>

<style scoped>
.ticket-compose {
  display: grid;
  gap: 10px;
}
.ticket-compose label {
  display: grid;
  gap: 6px;
}
.ticket-compose input,
.ticket-compose select,
.ticket-compose textarea {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--73-border);
  border-radius: 8px;
  background: var(--73-surface-strong);
  color: var(--73-ink);
  font: inherit;
}
.ticket-compose textarea {
  resize: vertical;
}
.ticket-compose__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
[role='alert'] {
  margin: 0;
  color: var(--73-danger-text);
  font-size: 12px;
}
</style>
