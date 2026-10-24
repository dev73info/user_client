<script setup lang="ts">
import { TButton, TIcon, WarningFilled } from 'ui_73info'

/**
 * 「尚未签署《开发者入驻协议》」那条提示。
 *
 * 与总览页的保证金提示共用统一层的 `.dev-notice`（金色 + 图标徽标 + 文案 + 右侧动作），
 * 不用 el-alert。窄屏且列表为空时这条要藏起来（说明与按钮并进空态里，见 `DevRequirementHallList`），
 * 所以由父级把「窄屏空态」这件事作为 `feedEmpty` 传进来。
 */
defineProps<{
  /** 窄屏卡片流此刻是空态：顶上这条与空态里那条重复，藏掉 */
  feedEmpty: boolean
}>()

const emit = defineEmits<{
  /** 去签《开发者入驻协议》 */
  sign: []
}>()
</script>

<template>
  <div
    class="dev-notice dev-requirement-hall__agreement-notice"
    :class="{ 'is-feed-empty': feedEmpty }"
    role="alert"
  >
    <span class="dev-notice__icon" aria-hidden="true">
      <TIcon>
        <WarningFilled />
      </TIcon>
    </span>
    <div class="dev-notice__copy">
      <strong>尚未签署《开发者入驻协议》</strong>
    </div>
    <div class="dev-notice__action">
      <TButton variant="solid" tone="accent" @click="emit('sign')">去签署协议</TButton>
    </div>
  </div>
</template>

<style scoped>
@media (max-width: 640px) {
  /* 窄屏列表为空时，签协议提示并进空态里（说明在上、按钮在下），顶上这条随之隐藏 */
  .dev-requirement-hall__agreement-notice.is-feed-empty {
    display: none;
  }
}
</style>
