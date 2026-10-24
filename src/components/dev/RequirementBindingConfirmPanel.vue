<script setup lang="ts">
import { TCheckbox } from 'ui_73info'

/**
 * 关联前第二次确认。
 *
 * 第一道「已详细阅读需求」没勾时，这里的勾选框是置灰的——
 * 两次确认是串联的，跳过阅读直接确认等于没有确认。
 */
defineProps<{
  requirementTitle: string
  /** 即将关联到的资源（已有项目标题 / 待初始化的新项目）。 */
  resourceLabel: string
  reviewConfirmed: boolean
}>()

const finalConfirmed = defineModel<boolean>('finalConfirmed', { required: true })
</script>

<template>
  <section class="dev-requirement-hall__confirm-panel">
    <div class="dev-requirement-hall__confirm-head">
      <span class="dev-requirement-hall__confirm-title">二次确认</span>
      <span class="dev-requirement-hall__confirm-meta">需求将进入开发中且不可重复绑定</span>
    </div>
    <p class="dev-requirement-hall__confirm-text">
      当前将关联需求“{{ requirementTitle }}”到资源“{{
        resourceLabel
      }}”。请确认资源能力、预算范围与验收标准均已匹配。
    </p>
    <TCheckbox v-model="finalConfirmed" :disabled="!reviewConfirmed">
      我确认本次关联无误，允许将该需求正式绑定到当前资源方案
    </TCheckbox>
  </section>
</template>
