<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import RichTextEditor from '@/components/RichTextEditor.vue'
import { TButton, TDialog, TForm, TFormItem, TInput } from 'ui_73info'
import { getMyAdapayMember } from '@/api/adapay'
import { normalizeYuanPriceText } from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'

/** 发布版本表单；金额校验与请求由 useResourceVersionDialogs 处理。 */
const open = defineModel<boolean>('open', { required: true })

const props = withDefaults(
  defineProps<{
    submitting: boolean
    /** 售价输入框占位：按资源是否已有买断价区分「0 = 免费」与「0 表示不单卖」。 */
    pricePlaceholder?: string
  }>(),
  { pricePlaceholder: '0 = 免费' },
)

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

/** 售价输入框实例：实时归一前导 0 / 多余小数时要拿到底层 input 改写值并复位光标。 */
const priceInputRef = ref<InstanceType<typeof TInput> | null>(null)

function onPriceInput() {
  const el = priceInputRef.value?.inputRef ?? null
  const raw = form.priceYuan
  const { text, caret } = normalizeYuanPriceText(raw, el?.selectionStart ?? null)
  if (text === raw) {
    return
  }
  form.priceYuan = text
  if (!el || caret === null) {
    return
  }
  el.value = text
  el.setSelectionRange(caret, caret)
}

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

const auth = useAuthStore()
const router = useRouter()
/** 结算账户是否已开通：未开通时售价锁定，先引导去账户页完善。 */
const settlementReady = ref(false)

async function refreshSettlement() {
  if (!auth.token) {
    settlementReady.value = false
    return
  }
  try {
    const member = await getMyAdapayMember(auth.token)
    settlementReady.value = member?.acceptsSettlement === true
  } catch {
    settlementReady.value = false
  }
}

function goSettlement() {
  void router.push({ name: 'workbench-account', query: { settle: '1' } })
}

watch(open, (visible) => {
  if (visible) {
    reset()
    void refreshSettlement()
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
      <TFormItem label="单版本售价">
        <TInput
          ref="priceInputRef"
          v-model="form.priceYuan"
          inputmode="decimal"
          :disabled="!settlementReady"
          :placeholder="props.pricePlaceholder"
          aria-label="单版本售价"
          @input="onPriceInput"
        >
          <template #suffix>
            <span class="dev-price-unit">元</span>
          </template>
        </TInput>
        <p v-if="!settlementReady" class="dev-field-hint">
          完成结算账户后才能设置售价
          <TButton variant="text" tone="accent" size="sm" @click="goSettlement">
            去完善结算账户
          </TButton>
        </p>
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
