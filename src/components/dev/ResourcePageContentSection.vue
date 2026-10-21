<script setup lang="ts">
import { ref } from 'vue'
import RichTextEditor from '@/components/RichTextEditor.vue'

/**
 * 「页面内容」整块 = 发布说明的富文本编辑器。
 *
 * 编辑器要能被保存链路从外部回写（加载时把保存的 HTML 灌进去），所以这里把
 * `setContent` 通过 `defineExpose` 露给父级；提示（无效链接之类）原样往上抛，
 * 组件自己不碰 TMessage。
 */
defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  notify: [message: string, type?: 'success' | 'warning' | 'error']
}>()

const editorRef = ref<InstanceType<typeof RichTextEditor> | null>(null)

function setContent(html: string, emitUpdate = false) {
  editorRef.value?.setContent(html, emitUpdate)
}

defineExpose({ setContent })
</script>

<template>
  <section class="dev-upload-block dev-upload-block--split">
    <header class="dev-card-head">
      <section class="dev-card-head__title-block">
        <h3 class="dev-section-title">页面内容</h3>
      </section>
    </header>
    <RichTextEditor
      ref="editorRef"
      :model-value="modelValue"
      min-height="clamp(320px, 42vh, 480px)"
      @update:model-value="emit('update:modelValue', $event)"
      @notify="(message, type) => emit('notify', message, type)"
    />
  </section>
</template>
