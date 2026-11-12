<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { getMyAdapayMember } from '@/api/adapay'
import type { McResourceVersionPayload } from '@/api/mcResources'
import RichTextEditor from '@/components/RichTextEditor.vue'
import { fenToYuanText, normalizeYuanPriceText } from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'
import {
  TButton,
  TDialog,
  TForm,
  TFormItem,
  TInput,
  TOption,
  TSelect,
  type SelectModelValue,
} from 'ui_73info'

/**
 * 「编辑版本」弹窗：版本号（可从历史版本里选）、单版本售价、可更换的资源文件与富文本备注。
 *
 * 打开时用 `version` 那份回填草稿（与拆分前 `openEditVersionDialog` 里的赋值 + `nextTick` 同序）；
 * 选历史版本号会把该版本的备注一并带进来。校验与请求在 `useResourceVersionDialogs.submitVersionEdit`。
 */
const open = defineModel<boolean>('open', { required: true })

const props = withDefaults(
  defineProps<{
    /** 正在编辑的版本；null 表示没有目标 */
    version: McResourceVersionPayload | null
    /** 历史版本（下拉候选，也是备注回填的取值来源） */
    options: McResourceVersionPayload[]
    /** 正在保存：页脚按钮转圈 */
    submitting: boolean
    /** 版本文件名（页面提供的纯展示口径） */
    fileNameOf: (version: McResourceVersionPayload) => string
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

const auth = useAuthStore()
const router = useRouter()
/** 结算账户是否已开通：未开通时售价锁定，先引导去账户页完善（与发布版本弹窗同一口径）。 */
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

function resetDraft(target: McResourceVersionPayload | null) {
  form.version = target?.version ?? ''
  form.priceYuan = fenToYuanText(target?.price_fen ?? 0)
  form.note = target?.note ?? ''
  selectedFile.value = null
  selectedFileName.value = ''
  if (fileInput.value) {
    fileInput.value.value = ''
  }
  void nextTick(() => {
    noteEditor.value?.setContent(form.note || '<p></p>', false)
  })
}

watch(
  () => [open.value, props.version] as const,
  ([visible]) => {
    if (visible) {
      resetDraft(props.version)
      void refreshSettlement()
    }
  },
  { immediate: true },
)

/* `TSelect` 的 `change` 是宽联合，这里只需单值，收紧一次再用。 */
function onVersionChange(value: SelectModelValue) {
  const version = String(value)
  const found = props.options.find((item) => item.version === version)
  if (!found) return
  form.note = found.note || ''
  noteEditor.value?.setContent(found.note || '<p></p>', false)
}

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
    width="720px"
    class="dev-dialog"
    :title="version ? `编辑版本 · ${version.version}` : '编辑版本'"
  >
    <TForm label-position="top" class="dev-version-form">
      <TFormItem label="版本号" required>
        <TSelect
          v-model="form.version"
          filterable
          placeholder="输入或选择历史版本号"
          style="width: 100%"
          @change="onVersionChange"
        >
          <TOption v-for="v in options" :key="v.id" :label="v.version" :value="v.version" />
        </TSelect>
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
      <TFormItem label="资源文件">
        <div class="dev-version-file-picker">
          <input
            ref="fileInput"
            type="file"
            class="dev-version-file-picker__input"
            @change="handleFileChange"
          />
          <TButton @click="triggerFileSelect">更换文件</TButton>
          <span class="dev-version-file-picker__name">
            {{ selectedFileName || (version ? fileNameOf(version) : '未选择文件') }}
          </span>
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
      <TButton @click="open = false">取消</TButton>
      <TButton variant="solid" tone="accent" :loading="submitting" @click="submit">保存</TButton>
    </template>
  </TDialog>
</template>
