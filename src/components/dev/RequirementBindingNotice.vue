<script setup lang="ts">
import { TIcon, WarningFilled } from 'ui_73info'

/**
 * 接取资格没过的提示条（现在只有入驻协议这一道坎）。
 *
 * 走统一层的金色提示条 `.dev-notice`（与需求大厅同一种形状与配色），
 * 右侧只在「差签协议」时给一颗「去签署协议」按钮。
 *
 * 保证金不在这里提示：2.0 的接单保证金由后端在接单时从可提现收益里冻结，
 * 不够会回 409 中文说明，前端没有可预判的读数。
 */
defineProps<{
  /** 阻塞原因，空串表示不渲染（由父级用 v-if 控制，这里再做一层兜底）。 */
  reason: string
  /** 只差签协议这一件事。 */
  agreementBlocked: boolean
}>()

const emit = defineEmits<{
  'sign-agreement': []
}>()
</script>

<template>
  <div v-if="reason" class="dev-notice" role="alert">
    <span class="dev-notice__icon" aria-hidden="true">
      <TIcon>
        <WarningFilled />
      </TIcon>
    </span>
    <div class="dev-notice__copy">
      <p>{{ reason }}</p>
    </div>
    <div v-if="agreementBlocked" class="dev-notice__action">
      <button type="button" class="dev-btn dev-btn--gold" @click="emit('sign-agreement')">
        去签署协议
      </button>
    </div>
  </div>
</template>
