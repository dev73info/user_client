<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { TButton, TDialog, TForm, TFormItem, TInput } from 'ui_73info'

import { getMyAdapayMember } from '@/api/adapay'
import { useResourceVersionDraft } from '@/composables/useResourceVersionDraft'
import { normalizeYuanPriceText } from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'

/** 快捷发布版本表单；金额校验与请求由 useDevResourcePublishVersion 处理。 */
const props = withDefaults(
  defineProps<{
    /** 弹窗开关（`v-model:open`） */
    open: boolean
    /** 目标资源标题，用于弹窗标题；没选资源时为 null */
    resourceTitle: string | null
    /** 正在发布：页脚按钮转圈、防重复提交 */
    submitting: boolean
    /** 售价输入框占位：按资源是否已有买断价区分「0 = 免费」与「0 表示不单卖」。 */
    pricePlaceholder?: string
  }>(),
  { pricePlaceholder: '0 = 免费' },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  /** 表单原值，交给 `useDevResourcePublishVersion.submitVersion` 校验并发请求 */
  submit: [payload: { version: string; note: string; priceYuan: string; file: File | null }]
}>()

const {
  versionFileInput,
  selectedVersionFile,
  selectedVersionFileName,
  versionForm,
  reset: resetVersionDraft,
  triggerFileSelect: triggerVersionFileSelect,
  handleFileChange: handleVersionFileChange,
} = useResourceVersionDraft()

/** 售价输入框实例：实时归一前导 0 / 多余小数时要拿到底层 input 改写值并复位光标。 */
const priceInputRef = ref<InstanceType<typeof TInput> | null>(null)

function onPriceInput() {
  const el = priceInputRef.value?.inputRef ?? null
  const raw = versionForm.priceYuan
  const { text, caret } = normalizeYuanPriceText(raw, el?.selectionStart ?? null)
  if (text === raw) {
    return
  }
  versionForm.priceYuan = text
  if (!el || caret === null) {
    return
  }
  el.value = text
  el.setSelectionRange(caret, caret)
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

/* 每次打开都是一张空表单：原先在视图的打开函数里调 `reset()`，
   现在跟着开关走（关窗后草稿不再可见，下次打开必然清空）。 */
watch(
  () => props.open,
  (open) => {
    if (open) {
      resetVersionDraft()
      void refreshSettlement()
    }
  },
)
</script>

<template>
  <TDialog
    :open="open"
    width="520px"
    class="dev-dialog"
    :title="resourceTitle !== null ? `发布版本 · ${resourceTitle}` : '发布版本'"
    @update:open="emit('update:open', $event)"
  >
    <TForm label-position="top" class="dev-version-form">
      <TFormItem label="版本号" required>
        <TInput v-model="versionForm.version" :maxlength="80" placeholder="例如：1.20.1-2.0.0" />
      </TFormItem>
      <TFormItem label="单版本售价">
        <TInput
          ref="priceInputRef"
          v-model="versionForm.priceYuan"
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
            ref="versionFileInput"
            type="file"
            class="dev-version-file-picker__input"
            @change="handleVersionFileChange"
          />
          <TButton @click="triggerVersionFileSelect">选择文件</TButton>
          <span class="dev-version-file-picker__name">{{
            selectedVersionFileName || '未选择文件'
          }}</span>
        </div>
      </TFormItem>
      <TFormItem label="备注">
        <TInput
          show-count
          v-model="versionForm.note"
          type="textarea"
          :rows="4"
          :maxlength="1000"
          placeholder="记录本次新版本说明、兼容性变化或补充信息"
        />
      </TFormItem>
    </TForm>

    <template #footer>
      <TButton @click="emit('update:open', false)">取消</TButton>
      <TButton
        variant="solid"
        tone="accent"
        :loading="submitting"
        @click="
          emit('submit', {
            version: versionForm.version,
            note: versionForm.note,
            priceYuan: versionForm.priceYuan,
            file: selectedVersionFile,
          })
        "
      >
        发布版本
      </TButton>
    </template>
  </TDialog>
</template>
