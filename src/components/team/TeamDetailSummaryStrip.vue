<script setup lang="ts">
/**
 * 团队详情页顶部读数条。
 *
 * 读数在左、页面级刷新固定在右上角 `__action` 槽；工作台外壳由 `WorkbenchBarSlot` 统一提供，
 * 这一块只负责把三个读数排好。
 */
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { TButton, TIcon, TLoading, Refresh } from 'ui_73info'

defineProps<{
  loading: boolean
  memberCount: number
  myRoleLabel: string
  ownerUsername?: string
}>()

const emit = defineEmits<{ (e: 'refresh'): void }>()
</script>

<template>
  <WorkbenchBarSlot>
    <TLoading tag="div" class="dev-meta-strip" :loading="loading">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">团队成员</span>
        <span class="dev-meta-strip__value">{{ memberCount }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">我的角色</span>
        <span class="dev-meta-strip__value">{{ myRoleLabel }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">所有者</span>
        <span class="dev-meta-strip__value">{{ ownerUsername || '—' }}</span>
      </div>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton icon-only :loading="loading" aria-label="刷新团队详情" @click="emit('refresh')">
          <TIcon><Refresh /></TIcon>
        </TButton>
      </div>
    </TLoading>
  </WorkbenchBarSlot>
</template>
