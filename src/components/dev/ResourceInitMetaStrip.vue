<script setup lang="ts">
import { TButton, TIcon, Back, Refresh } from 'ui_73info'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'

/**
 * 「发布资源」创建页的顶部读数条：读数在左、页面级操作在右，与其余菜单页同一条形态。
 *
 * 两类资源都读「资源类型」（免费 / 付费 / 接口）：接口资源额外标「原创」，
 * 普通资源读当前归类的资源项目名。「刷新标签」也在这里（接口资源没有标签树）。
 */
defineProps<{
  isApiKind: boolean
  rootLabel: string
  resourceTypeLabel: string
  isLoadingTags: boolean
}>()

const emit = defineEmits<{
  refreshTags: []
  back: []
}>()
</script>

<template>
  <WorkbenchBarSlot>
    <div class="dev-meta-strip">
      <!-- 接口资源不选标签归类，读数条只交代资源类型与「原创」 -->
      <template v-if="isApiKind">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">资源类型</span>
          <span class="dev-meta-strip__value">{{ resourceTypeLabel }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">类型</span>
          <span class="dev-meta-strip__value">原创</span>
        </div>
      </template>
      <template v-else>
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__value">{{ rootLabel }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">资源类型</span>
          <span class="dev-meta-strip__value">{{ resourceTypeLabel }}</span>
        </div>
      </template>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton
          v-if="!isApiKind"
          icon-only
          aria-label="刷新标签"
          :loading="isLoadingTags"
          @click="emit('refreshTags')"
        >
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
        <TButton variant="outline" @click="emit('back')">
          <template #prefix>
            <TIcon><Back /></TIcon>
          </template>
          返回列表
        </TButton>
      </div>
    </div>
  </WorkbenchBarSlot>
</template>
