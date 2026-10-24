<script setup lang="ts">
import { ref } from 'vue'

import DeliverySubmitDialog from '@/components/DeliverySubmitDialog.vue'
import type { RequirementItem } from '@/api/devRequirements'

import { TMessage } from 'ui_73info'

/**
 * 交付版本提交弹窗的挂点：打开前的「有没有绑定资源」判定与弹窗状态都在这里，
 * 页面只通过暴露的 `open(item)` 按行拉起，提交成功后由页面回刷列表（`submitted`）。
 */
const props = defineProps<{
  token: string
}>()

const emit = defineEmits<{
  submitted: []
}>()

const visible = ref(false)
const requirement = ref<RequirementItem | null>(null)

function open(item: RequirementItem) {
  if (item.bound_resource_id == null) {
    TMessage.warning('当前需求还没有关联资源项目')
    return
  }

  requirement.value = item
  visible.value = true
}

defineExpose({ open })
</script>

<template>
  <DeliverySubmitDialog
    v-model:visible="visible"
    :token="props.token"
    :bound-resource-id="requirement?.bound_resource_id ?? null"
    @submitted="emit('submitted')"
  />
</template>
