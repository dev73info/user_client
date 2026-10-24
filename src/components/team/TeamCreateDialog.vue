<script setup lang="ts">
/**
 * 「创建团队」弹窗：团队名称（必填）+ 团队简介（可选）。
 *
 * 表单模型由页面持有（`useTeams` 的 `createName` / `createDesc`），提交也由页面做——
 * 组件只把两个输入框接上，并把「创建」转成 `submit` 事件。主题、宽度与遮罩关闭沿用统一层。
 */
import { TButton, TDialog, TForm, TFormItem, TInput } from 'ui_73info'

defineProps<{
  creating: boolean
}>()

const emit = defineEmits<{
  (e: 'submit'): void
}>()

const open = defineModel<boolean>('open', { required: true })
const createName = defineModel<string>('name', { required: true })
const createDesc = defineModel<string>('desc', { required: true })
</script>

<template>
  <TDialog
    v-model:open="open"
    title="创建团队"
    width="520px"
    class="dev-dialog"
    :mask-closable="!creating"
  >
    <TForm label-position="top">
      <TFormItem label="团队名称" required>
        <TInput
          v-model="createName"
          :maxlength="64"
          placeholder="输入团队名称"
          @keyup.enter="emit('submit')"
        />
      </TFormItem>
      <TFormItem label="团队简介">
        <TInput
          v-model="createDesc"
          show-count
          type="textarea"
          :rows="3"
          :maxlength="200"
          placeholder="简单描述团队的目的（可选）"
        />
      </TFormItem>
    </TForm>
    <template #footer>
      <TButton :disabled="creating" @click="open = false">取消</TButton>
      <TButton variant="solid" tone="accent" :loading="creating" @click="emit('submit')"
        >创建</TButton
      >
    </template>
  </TDialog>
</template>
