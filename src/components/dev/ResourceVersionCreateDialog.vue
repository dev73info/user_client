<script setup lang="ts">
import { reactive, ref, watch } from 'vue'

import RichTextEditor from '@/components/RichTextEditor.vue'
import { TButton, TDialog, TForm, TFormItem, TInput } from 'ui_73info'

/** 发布版本表单；金额校验与请求由 useResourceVersionDialogs 处理。 */
const open = defineModel<boolean>('open', { required: true })

defineProps<{
  submitting: boolean
  requirePrice?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: { version: string; note: string; priceYuan: string; file: File | null }]
}>()

const form = reactive({
  version: '',
  priceYuan: '0',
  note: '',
})

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const selectedFileName = ref('')
const noteEditor = ref<InstanceType<typeof RichTextEditor> | null>(null)

function reset() {
  form.version = ''
  form.priceYuan = '0'
  form.note = ''
  noteEditor.value?.setContent('<p></p>', false)
  selectedFile.value = null
  selectedFileName.value = ''
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

watch(open, (visible) => {
  if (visible) {
    reset()
  }
})

function triggerFileSelect() {
  fileInput.value?.click()
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  selectedFile.value = file
  selectedFileName.value = file?.name ?? ''
}

function submit() {
  emit('submit', {
    version: form.version,
    note: form.note,
    priceYuan: form.priceYuan,
    file: selectedFile.value,
  })
}
</script>

<template>
  <TDialog
    v-model:open="open"
    title="发布版本"
    width="720px"
    class="dev-dialog"
    :mask-closable="!submitting"
  >
    <TForm label-position="top" class="dev-version-form">
      <TFormItem label="版本号" required>
        <TInput v-model="form.version" :maxlength="80" placeholder="例如：1.20.1-2.0.0" />
      </TFormItem>
      <TFormItem label="单版本售价（元）" :required="requirePrice">
        <TInput
          v-model="form.priceYuan"
          inputmode="decimal"
          placeholder="0 表示不可单买"
          aria-label="单版本售价（元）"
        />
      </TFormItem>
      <TFormItem label="资源文件" required>
        <div class="dev-version-file-picker">
          <input
            ref="fileInput"
            type="file"
            class="dev-version-file-picker__input"
            @change="handleFileChange"
          />
          <TButton @click="triggerFileSelect">选择文件</TButton>
          <span class="dev-version-file-picker__name">{{ selectedFileName || '未选择文件' }}</span>
        </div>
      </TFormItem>
      <TFormItem label="备注">
        <RichTextEditor
          ref="noteEditor"
          :model-value="form.note"
          min-height="clamp(120px, 18vh, 160px)"
          max-height="clamp(200px, 30vh, 280px)"
          @update:model-value="form.note = $event"
        />
      </TFormItem>
    </TForm>
    <template #footer>
      <TButton @click="reset">清空</TButton>
      <TButton variant="solid" tone="accent" :loading="submitting" @click="submit">
        发布版本
      </TButton>
    </template>
  </TDialog>
</template>
