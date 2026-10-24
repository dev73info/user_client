<script setup lang="ts">
import { TIcon, WarningFilled } from 'ui_73info'

/**
 * 接取资格没过的提示条（协议 / 保证金 / 信用）。
 *
 * 走统一层的金色提示条 `.dev-notice`（与总览页、需求大厅同一种形状与配色），
 * 右侧按「差哪一件事」给一颗动作按钮：没签协议去签协议，其余去补保证金。
 */
defineProps<{
  /** 阻塞原因，空串表示不渲染（由父级用 v-if 控制，这里再做一层兜底）。 */
  reason: string
  /** 只差签协议这一件事。 */
  agreementBlocked: boolean
  /** 电签担保需求才需要补保证金。 */
  requiresDeposit: boolean
}>()

const emit = defineEmits<{
  'sign-agreement': []
  'go-deposit': []
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
    <div class="dev-notice__action">
      <button
        v-if="agreementBlocked"
        type="button"
        class="dev-btn dev-btn--gold"
        @click="emit('sign-agreement')"
      >
        去签署协议
      </button>
      <button
        v-else-if="requiresDeposit"
        type="button"
        class="dev-btn dev-btn--gold"
        @click="emit('go-deposit')"
      >
        去缴纳保证金
      </button>
    </div>
  </div>
</template>
