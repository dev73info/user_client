<script setup lang="ts">
import { TButton, TDialog, TInput } from 'ui_73info'

/**
 * 富文本编辑器用的单行输入弹窗（接替 `ElMessageBox.prompt`）。
 *
 * 状态与 Promise 在 `useRichEditorPrompt` 里：插入媒体要连问两次（地址、名称），
 * 调用方按顺序 await，这里只负责把当前的问法渲染出来，并把三条出口
 * （确定 / 取消 / 关闭）交回外层。做法说明见 `useRichEditorPrompt` 顶部注释。
 */
const props = defineProps<{
  open: boolean
  title: string
  message: string
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  settle: [value: string | null]
}>()
</script>

<template>
  <TDialog
    :open="props.open"
    :title="props.title"
    :width="420"
    @update:open="emit('settle', null)"
    @close="emit('settle', null)"
  >
    <label class="rich-text-editor__prompt-field">
      <span class="rich-text-editor__prompt-label">{{ props.message }}</span>
      <TInput
        :model-value="props.modelValue"
        autofocus
        @update:model-value="(value) => emit('update:modelValue', value)"
        @enter="emit('settle', props.modelValue)"
      />
    </label>
    <template #footer>
      <TButton variant="outline" @click="emit('settle', null)">取消</TButton>
      <TButton variant="solid" tone="accent" @click="emit('settle', props.modelValue)"
        >确定</TButton
      >
    </template>
  </TDialog>
</template>

<style scoped>
.rich-text-editor__prompt-field {
  display: grid;
  gap: 8px;
}

.rich-text-editor__prompt-label {
  color: var(--73-ink-soft);
  font-size: 13px;
  font-weight: 600;
}
</style>
