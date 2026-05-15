<script setup lang="ts">
import '@/styles/toast.css'
import type { ToastType } from '@/composables/useToast'

defineProps<{
  visible: boolean
  message: string
  type: ToastType
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="toast-fade">
      <aside v-if="visible" class="toast" :class="`toast-${type}`" role="status" aria-live="polite">
        <span class="toastMsg">{{ message }}</span>
        <button class="toastClose" type="button" aria-label="关闭提示" @click="emit('close')">
          ×
        </button>
      </aside>
    </Transition>
  </Teleport>
</template>
