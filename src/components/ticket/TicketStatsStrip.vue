<script setup lang="ts">
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { TButton, TIcon, Refresh } from 'ui_73info'

/**
 * 工单中心顶部读数条：两侧都是「一条读数横条」，只是各自落在自己的统一层上
 * （开发者侧 .dev-meta-strip / 用户工作台侧 .wb-strip），刷新固定在 __action 槽。
 * 组件只负责展示与回传刷新事件，取数在 `useTicketCenter`。
 */
defineProps<{
  dev: boolean
  total: number
  pending: number
  resolved: number
  loading: boolean
}>()

defineEmits<{ refresh: [] }>()
</script>

<template>
  <WorkbenchBarSlot>
    <section v-if="dev" class="dev-meta-strip" aria-label="工单概览">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">全部工单</span>
        <span class="dev-meta-strip__value">{{ total }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">处理中</span>
        <span class="dev-meta-strip__value">{{ pending }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">已完成</span>
        <span class="dev-meta-strip__value">{{ resolved }}</span>
      </div>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton icon-only aria-label="刷新工单" :loading="loading" @click="$emit('refresh')">
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
      </div>
    </section>

    <section v-else class="wb-strip" aria-label="工单概览">
      <div class="wb-strip__item">
        <span class="wb-strip__label">全部工单</span>
        <span class="wb-strip__value">{{ total }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">处理中</span>
        <span class="wb-strip__value">{{ pending }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">已完成</span>
        <span class="wb-strip__value">{{ resolved }}</span>
      </div>
      <div class="wb-strip__item wb-strip__action">
        <TButton icon-only aria-label="刷新工单" :loading="loading" @click="$emit('refresh')">
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
      </div>
    </section>
  </WorkbenchBarSlot>
</template>
