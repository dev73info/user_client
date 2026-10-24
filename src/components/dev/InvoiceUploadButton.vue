<script setup lang="ts">
import { TButton, TIcon, UploadFilled } from 'ui_73info'

/**
 * 接单卡上的「上传发票」按钮。
 *
 * 只有外观与两档文案：选文件与上传在 `composables/useInvoiceUpload` 里，
 * 这里不碰接口，也不自己去查「这张票能不能传」——能传的票由页面筛好再 `v-for` 出来。
 * 上传中短暂换成「上传中…」，同时把同排其它票的按钮一起置灰（一次只传一个）。
 */
defineProps<{
  /** 这一张票正在上传。 */
  uploading: boolean
  /** 另一张票正在上传：这一颗置灰等着。 */
  disabled: boolean
}>()

const emit = defineEmits<{
  pick: []
}>()
</script>

<template>
  <TButton
    variant="outline"
    tone="accent"
    :loading="uploading"
    :disabled="disabled"
    @click="emit('pick')"
  >
    <TIcon><UploadFilled /></TIcon>
    <span>{{ uploading ? '上传中…' : '上传发票' }}</span>
  </TButton>
</template>
