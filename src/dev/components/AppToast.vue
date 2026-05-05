<script setup lang="ts">
import type { ToastType } from '@dev/composables/useToast'

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
  <!-- Element Plus Message handles toast display; this component is a no-op placeholder. -->
  <div v-if="false" />
</template>
