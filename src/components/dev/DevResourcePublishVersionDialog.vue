<script setup lang="ts">
import { watch } from 'vue'

import { TButton, TDialog, TForm, TFormItem, TInput } from 'ui_73info'

import { useResourceVersionDraft } from '@/composables/useResourceVersionDraft'

/** 快捷发布版本表单；金额校验与请求由 useDevResourcePublishVersion 处理。 */
const props = defineProps<{
  /** 弹窗开关（`v-model:open`） */
  open: boolean
  /** 目标资源标题，用于弹窗标题；没选资源时为 null */
  resourceTitle: string | null
  /** 正在发布：页脚按钮转圈、防重复提交 */
  submitting: boolean
}>()

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

/* 每次打开都是一张空表单：原先在视图的打开函数里调 `reset()`，
   现在跟着开关走（关窗后草稿不再可见，下次打开必然清空）。 */
watch(
  () => props.open,
  (open) => {
    if (open) {
      resetVersionDraft()
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
      <TFormItem label="单版本售价（元）">
        <TInput
          v-model="versionForm.priceYuan"
          inputmode="decimal"
          placeholder="0 表示不可单买"
          aria-label="单版本售价（元）"
        />
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
